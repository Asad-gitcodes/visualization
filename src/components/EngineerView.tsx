"use client";
import { useState } from "react";
import { PerfProfile } from "@/types/perf";
import { CHART_COLORS, fmt, TOOLTIP_STYLE } from "@/lib/chartUtils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface Props {
  profiles: PerfProfile[];
}

interface Anomaly {
  profileLabel: string;
  batchSize: number;
  metric: string;
  description: string;
  value: number;
  previous: number;
  delta: string;
}

/**
 * Two checks only — both have actionable interpretations:
 *
 * 1. Throughput regression: total throughput drops >10% going from a smaller
 *    to larger batch size. Projection models assume superlinear scaling;
 *    a drop suggests a memory pressure cliff or a batching bug.
 *
 * 2. TTFT spike: TTFT increases >50% between consecutive batch sizes.
 *    TTFT should decrease (or stay flat) as batch grows because prefill
 *    amortises; a spike usually indicates a KV-cache eviction or scheduler stall.
 *
 * Removed: maxMs ≠ targetMs. In the actual data these columns are always equal
 * (targetMs is the projection input, maxMs is the projection output — they
 * converge by construction). Flagging them creates noise with no actionable signal.
 */
function detectAnomalies(profiles: PerfProfile[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const p of profiles) {
    const label = `${p.model} · ${p.profile}`;
    const rows = [...p.rows].sort((a, b) => a.batchSize - b.batchSize);
    for (let i = 1; i < rows.length; i++) {
      const cur = rows[i];
      const prev = rows[i - 1];

      if (cur.throughput < prev.throughput * 0.9) {
        const pct = (((cur.throughput - prev.throughput) / prev.throughput) * 100).toFixed(1);
        anomalies.push({
          profileLabel: label,
          batchSize: cur.batchSize,
          metric: "Throughput regression",
          description: "May indicate memory pressure cliff or batching bug",
          value: cur.throughput,
          previous: prev.throughput,
          delta: `${pct}%`,
        });
      }

      if (cur.ttftMs > prev.ttftMs * 1.5) {
        const pct = (((cur.ttftMs - prev.ttftMs) / prev.ttftMs) * 100).toFixed(1);
        anomalies.push({
          profileLabel: label,
          batchSize: cur.batchSize,
          metric: "TTFT spike",
          description: "TTFT should decrease with batch size; spike suggests KV-cache eviction or scheduler stall",
          value: cur.ttftMs,
          previous: prev.ttftMs,
          delta: `+${pct}%`,
        });
      }
    }
  }
  return anomalies;
}

export function EngineerView({ profiles }: Props) {
  const allModels = Array.from(new Set(profiles.map((p) => p.model))).sort();
  const allProfileNums = Array.from(new Set(profiles.map((p) => p.profileNum))).sort();
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [selectedProfileNum, setSelectedProfileNum] = useState<string>("");

  if (profiles.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-20">
        Upload performance sweep files above to see the engineer view.
      </div>
    );
  }

  const filtered = profiles.filter((p) => {
    const modelOk = selectedModels.size === 0 || selectedModels.has(p.model);
    const profileOk = !selectedProfileNum || p.profileNum === selectedProfileNum;
    return modelOk && profileOk;
  });

  const seriesMap = new Map<string, { profile: PerfProfile; color: string }>();
  filtered.forEach((p) => {
    const key = `${p.model} · ${p.profile}`;
    if (!seriesMap.has(key))
      seriesMap.set(key, { profile: p, color: CHART_COLORS[profiles.indexOf(p) % CHART_COLORS.length] });
  });
  const series = Array.from(seriesMap.entries());

  const batchSizes = Array.from(
    new Set(filtered.flatMap((p) => p.rows.map((r) => r.batchSize)))
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

  const efficiencyData = batchSizes.map((bs) => {
    const point: Record<string, number | string> = { batchSize: bs };
    series.forEach(([key, { profile }]) => {
      const row = profile.rows.find((r) => r.batchSize === bs);
      if (row && row.maxMs > 0) point[key] = (row.throughput / row.maxMs) * 1000;
    });
    return point;
  });

  const anomalies = detectAnomalies(filtered);

  function toggleModel(m: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }

  return (
    <div className="space-y-8">
      {/* Filter controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-start gap-6">
          {allModels.length > 1 && (
            <div className="space-y-2">
              <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Filter models</p>
              <div className="flex flex-wrap gap-2">
                {allModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => toggleModel(m)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                      selectedModels.size === 0 || selectedModels.has(m)
                        ? "border-blue-500 text-blue-400 bg-blue-500/10"
                        : "border-zinc-700 text-zinc-500"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
          {allProfileNums.length > 1 && (
            <div className="space-y-2">
              <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Traffic profile</p>
              <select
                value={selectedProfileNum}
                onChange={(e) => setSelectedProfileNum(e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">All profiles</option>
                {allProfileNums.map((n) => (
                  <option key={n} value={n}>
                    {profiles.find((p) => p.profileNum === n)?.profile ?? `Profile ${n}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-zinc-600 text-xs self-end pb-1">
            {filtered.length} of {profiles.length} sweep{profiles.length !== 1 ? "s" : ""} shown
          </p>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-zinc-500 py-10">No profiles match the current filter.</div>
      )}

      {filtered.length > 0 && (
        <>
          {/* Anomaly panel */}
          <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
            <h3 className="text-zinc-200 font-medium mb-3">
              Anomaly Detection{" "}
              <span className={`text-sm font-normal ${anomalies.length > 0 ? "text-amber-400" : "text-green-400"}`}>
                {anomalies.length === 0 ? "· No anomalies" : `· ${anomalies.length} flagged`}
              </span>
            </h3>
            {anomalies.length === 0 ? (
              <p className="text-zinc-500 text-sm">
                Throughput scales monotonically and TTFT is flat or decreasing across all batch sizes.
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-zinc-700 text-zinc-400">
                      <th className="pb-2 pr-4">Model · Profile</th>
                      <th className="pb-2 pr-4">Batch</th>
                      <th className="pb-2 pr-4">Anomaly</th>
                      <th className="pb-2 pr-4">Actual</th>
                      <th className="pb-2 pr-4">Previous</th>
                      <th className="pb-2 pr-4">Delta</th>
                      <th className="pb-2">Likely cause</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((a, i) => (
                      <tr key={i} className="border-b border-zinc-800 text-zinc-300">
                        <td className="py-1.5 pr-4 font-medium">{a.profileLabel}</td>
                        <td className="py-1.5 pr-4">{a.batchSize}</td>
                        <td className="py-1.5 pr-4 text-amber-400">{a.metric}</td>
                        <td className="py-1.5 pr-4">{fmt(a.value)}</td>
                        <td className="py-1.5 pr-4">{fmt(a.previous)}</td>
                        <td className="py-1.5 pr-4 text-red-400">{a.delta}</td>
                        <td className="py-1.5 text-zinc-500 max-w-xs">{a.description}</td>
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
                    const peakRow = profile.rows.reduce(
                      (b, r) => (r.throughput > b.throughput ? r : b),
                      profile.rows[0]
                    );
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
            <p className="text-zinc-500 text-xs mb-4">Should scale superlinearly — a flat or dropping curve flags a projection issue</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={buildData("throughput")}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 11 }} />
                <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(Number(v))} t/s`, ""]} />
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
            <p className="text-zinc-500 text-xs mb-4">Hardware efficiency — flat or rising is healthy; steep decline suggests resource contention</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={buildData("throughputPerBox")}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 11 }} />
                <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(Number(v))} t/s/box`, ""]} />
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
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(Number(v))} t/s`, ""]} />
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
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(Number(v))} t/s`, ""]} />
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
            <h3 className="text-zinc-200 font-medium mb-1">Throughput Efficiency (tokens per ms of latency budget)</h3>
            <p className="text-zinc-500 text-xs mb-4">Higher = more tokens per unit of latency budget consumed; useful for comparing models at equal latency cost</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={efficiencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 11 }} />
                <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmt(Number(v))} t/ms`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {series.map(([key, { color }]) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Raw data table */}
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
                    <th className="pb-2 pr-3">TTFT (ms)</th>
                    <th className="pb-2 pr-3">Gen t/s</th>
                    <th className="pb-2 pr-3">RPM</th>
                    <th className="pb-2 pr-3">Cached t/s</th>
                    <th className="pb-2">Uncached t/s</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.flatMap((p) =>
                    p.rows.map((r, j) => (
                      <tr
                        key={`${p.model}-${p.profile}-${j}`}
                        className="border-b border-zinc-800/50 text-zinc-300 hover:bg-zinc-700/20"
                      >
                        <td className="py-1 pr-3 font-medium">{p.model}</td>
                        <td className="py-1 pr-3">{p.profile}</td>
                        <td className="py-1 pr-3">{r.batchSize}</td>
                        <td className="py-1 pr-3">{fmt(r.throughput)}</td>
                        <td className="py-1 pr-3">{fmt(r.throughputPerBox)}</td>
                        <td className="py-1 pr-3">{r.ttftMs.toFixed(2)}</td>
                        <td className="py-1 pr-3">{fmt(r.genSpeed)}</td>
                        <td className="py-1 pr-3">{fmt(r.rpm)}</td>
                        <td className="py-1 pr-3">{fmt(r.cachedThroughput)}</td>
                        <td className="py-1">{fmt(r.uncachedThroughput)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
