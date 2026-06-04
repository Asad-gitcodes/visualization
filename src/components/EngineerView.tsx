"use client";
import { PerfProfile } from "@/types/perf";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts";

const COLORS = [
  "#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa",
  "#38bdf8", "#fb923c", "#4ade80", "#e879f9", "#facc15",
  "#94a3b8",
];

function fmt(n: number, decimals = 1) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}

interface Props {
  profiles: PerfProfile[];
}

interface Anomaly {
  key: string;
  profile: string;
  batchSize: number;
  metric: string;
  value: number;
  expected: number;
  delta: string;
}

function detectAnomalies(profiles: PerfProfile[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const p of profiles) {
    const key = `${p.model} · ${p.profile}`;
    const rows = p.rows;
    // Check that throughput increases monotonically with batch size
    for (let i = 1; i < rows.length; i++) {
      const cur = rows[i];
      const prev = rows[i - 1];
      // Gen speed should decrease with batch size (more competition per user)
      // Throughput should increase
      if (cur.throughput < prev.throughput * 0.9) {
        anomalies.push({
          key,
          profile: `${p.model} ${p.profile}`,
          batchSize: cur.batchSize,
          metric: "Throughput",
          value: cur.throughput,
          expected: prev.throughput,
          delta: `${(((cur.throughput - prev.throughput) / prev.throughput) * 100).toFixed(1)}%`,
        });
      }
      // TTFT should decrease or stay flat with bigger batch
      if (cur.ttftMs > prev.ttftMs * 1.5) {
        anomalies.push({
          key,
          profile: `${p.model} ${p.profile}`,
          batchSize: cur.batchSize,
          metric: "TTFT",
          value: cur.ttftMs,
          expected: prev.ttftMs,
          delta: `+${(((cur.ttftMs - prev.ttftMs) / prev.ttftMs) * 100).toFixed(1)}%`,
        });
      }
      // maxMs vs targetMaxMs should match
      if (Math.abs(cur.maxMs - cur.targetMaxMs) / cur.targetMaxMs > 0.01) {
        anomalies.push({
          key,
          profile: `${p.model} ${p.profile}`,
          batchSize: cur.batchSize,
          metric: "Max≠Target ms",
          value: cur.maxMs,
          expected: cur.targetMaxMs,
          delta: `${(((cur.maxMs - cur.targetMaxMs) / cur.targetMaxMs) * 100).toFixed(2)}%`,
        });
      }
    }
  }
  return anomalies;
}

export function EngineerView({ profiles }: Props) {
  if (profiles.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-20">
        Upload performance sweep files above to see the engineer view.
      </div>
    );
  }

  const seriesMap = new Map<string, { profile: PerfProfile; color: string }>();
  profiles.forEach((p, i) => {
    const key = `${p.model} · ${p.profile}`;
    if (!seriesMap.has(key)) seriesMap.set(key, { profile: p, color: COLORS[i % COLORS.length] });
  });
  const series = Array.from(seriesMap.entries());

  const batchSizes = Array.from(
    new Set(profiles.flatMap((p) => p.rows.map((r) => r.batchSize)))
  ).sort((a, b) => a - b);

  function buildData(metric: keyof (typeof profiles)[0]["rows"][0]) {
    return batchSizes.map((bs) => {
      const point: Record<string, number | string> = { batchSize: bs };
      series.forEach(([key, { profile }]) => {
        const row = profile.rows.find((r) => r.batchSize === bs);
        if (row) point[key] = row[metric] as number;
      });
      return point;
    });
  }

  const anomalies = detectAnomalies(profiles);

  // Efficiency ratio: throughput / maxMs (higher = better efficiency)
  const efficiencyData = batchSizes.map((bs) => {
    const point: Record<string, number | string> = { batchSize: bs };
    series.forEach(([key, { profile }]) => {
      const row = profile.rows.find((r) => r.batchSize === bs);
      if (row && row.maxMs > 0) point[key] = (row.throughput / row.maxMs) * 1000;
    });
    return point;
  });

  const chartProps = {
    contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 },
    labelStyle: { color: "#a1a1aa" },
  };

  return (
    <div className="space-y-8">
      {/* Anomaly panel */}
      <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
        <h3 className="text-zinc-200 font-medium mb-3">
          Anomaly Detection{" "}
          <span className={`text-sm font-normal ${anomalies.length > 0 ? "text-amber-400" : "text-green-400"}`}>
            {anomalies.length === 0 ? "· No anomalies" : `· ${anomalies.length} flagged`}
          </span>
        </h3>
        {anomalies.length === 0 ? (
          <p className="text-zinc-500 text-sm">All metrics look monotonically consistent across batch sizes.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400">
                  <th className="pb-2 pr-4">Model · Profile</th>
                  <th className="pb-2 pr-4">Batch</th>
                  <th className="pb-2 pr-4">Metric</th>
                  <th className="pb-2 pr-4">Actual</th>
                  <th className="pb-2 pr-4">Expected</th>
                  <th className="pb-2">Delta</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a, i) => (
                  <tr key={i} className="border-b border-zinc-800 text-zinc-300">
                    <td className="py-1.5 pr-4 font-medium">{a.profile}</td>
                    <td className="py-1.5 pr-4">{a.batchSize}</td>
                    <td className="py-1.5 pr-4 text-amber-400">{a.metric}</td>
                    <td className="py-1.5 pr-4">{fmt(a.value)}</td>
                    <td className="py-1.5 pr-4">{fmt(a.expected)}</td>
                    <td className="py-1.5 text-red-400">{a.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Config summary table */}
      <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
        <h3 className="text-zinc-200 font-medium mb-3">Profile Configuration</h3>
        <div className="overflow-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="pb-2 pr-4">Model</th>
                <th className="pb-2 pr-4">Profile</th>
                <th className="pb-2 pr-4">Input Len</th>
                <th className="pb-2 pr-4">Output Len</th>
                <th className="pb-2 pr-4">Cache %</th>
                <th className="pb-2 pr-4">Batch Sizes</th>
                <th className="pb-2">Peak Throughput</th>
              </tr>
            </thead>
            <tbody>
              {series.map(([key, { profile, color }]) => {
                const peakRow = profile.rows.reduce((b, r) => r.throughput > b.throughput ? r : b, profile.rows[0]);
                return (
                  <tr key={key} className="border-b border-zinc-800 text-zinc-300">
                    <td className="py-1.5 pr-4 font-medium" style={{ color }}>{profile.model}</td>
                    <td className="py-1.5 pr-4">{profile.profile}</td>
                    <td className="py-1.5 pr-4">{fmt(profile.inputLength, 0)}</td>
                    <td className="py-1.5 pr-4">{fmt(profile.outputLength, 0)}</td>
                    <td className="py-1.5 pr-4">{(profile.cachePercent * 100).toFixed(0)}%</td>
                    <td className="py-1.5 pr-4">{profile.rows.map((r) => r.batchSize).join(", ")}</td>
                    <td className="py-1.5">{fmt(peakRow?.throughput ?? 0)} t/s @ bs={peakRow?.batchSize}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total Throughput */}
      <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
        <h3 className="text-zinc-200 font-medium mb-1">Total Throughput (t/s) vs Batch Size</h3>
        <p className="text-zinc-500 text-xs mb-4">Projection sanity check — should scale superlinearly</p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={buildData("throughput")}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 11 }} />
            <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
            <Tooltip {...chartProps} formatter={(v) => [`${fmt(Number(v))} t/s`, ""]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map(([key, { color }]) => (
              <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Throughput per box */}
      <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
        <h3 className="text-zinc-200 font-medium mb-1">Throughput / Box (t/s/hardware) vs Batch Size</h3>
        <p className="text-zinc-500 text-xs mb-4">Hardware efficiency — flat or rising is healthy</p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={buildData("throughputPerBox")}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 11 }} />
            <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
            <Tooltip {...chartProps} formatter={(v) => [`${fmt(Number(v))} t/s/box`, ""]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map(([key, { color }]) => (
              <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cached vs Uncached */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
          <h3 className="text-zinc-200 font-medium mb-1">Cached Throughput (t/s)</h3>
          <p className="text-zinc-500 text-xs mb-4">KV cache hit path</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={buildData("cachedThroughput")}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 10 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
              <Tooltip {...chartProps} formatter={(v) => [`${fmt(Number(v))} t/s`, ""]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {series.map(([key, { color }]) => (
                <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
          <h3 className="text-zinc-200 font-medium mb-1">Uncached Throughput (t/s)</h3>
          <p className="text-zinc-500 text-xs mb-4">Cold path — prefill-dominated</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={buildData("uncachedThroughput")}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 10 }} />
              <YAxis stroke="#71717a" tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
              <Tooltip {...chartProps} formatter={(v) => [`${fmt(Number(v))} t/s`, ""]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {series.map(([key, { color }]) => (
                <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Efficiency */}
      <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
        <h3 className="text-zinc-200 font-medium mb-1">Throughput Efficiency (t/s per second of latency budget)</h3>
        <p className="text-zinc-500 text-xs mb-4">Higher = more tokens per unit of latency budget consumed</p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={efficiencyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 11 }} />
            <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
            <Tooltip {...chartProps} formatter={(v) => [`${fmt(Number(v))}`, ""]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map(([key, { color }]) => (
              <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Full data table */}
      <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
        <h3 className="text-zinc-200 font-medium mb-3">Raw Data Table</h3>
        <div className="overflow-auto">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="pb-2 pr-3">Model</th>
                <th className="pb-2 pr-3">Profile</th>
                <th className="pb-2 pr-3">Batch</th>
                <th className="pb-2 pr-3">Throughput</th>
                <th className="pb-2 pr-3">T/box</th>
                <th className="pb-2 pr-3">TTFT(ms)</th>
                <th className="pb-2 pr-3">Gen t/s</th>
                <th className="pb-2 pr-3">RPM</th>
                <th className="pb-2 pr-3">MaxMs</th>
                <th className="pb-2">TargetMs</th>
              </tr>
            </thead>
            <tbody>
              {profiles.flatMap((p) =>
                p.rows.map((r, j) => (
                  <tr key={`${p.model}-${p.profile}-${j}`} className="border-b border-zinc-800/50 text-zinc-300 hover:bg-zinc-700/20">
                    <td className="py-1 pr-3 font-medium">{p.model}</td>
                    <td className="py-1 pr-3">{p.profile}</td>
                    <td className="py-1 pr-3">{r.batchSize}</td>
                    <td className="py-1 pr-3">{fmt(r.throughput)}</td>
                    <td className="py-1 pr-3">{fmt(r.throughputPerBox)}</td>
                    <td className="py-1 pr-3">{r.ttftMs.toFixed(2)}</td>
                    <td className="py-1 pr-3">{fmt(r.genSpeed)}</td>
                    <td className="py-1 pr-3">{fmt(r.rpm)}</td>
                    <td className="py-1 pr-3">{fmt(r.maxMs, 0)}</td>
                    <td className="py-1">{fmt(r.targetMaxMs, 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
