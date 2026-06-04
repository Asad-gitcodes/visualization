"use client";
import { useState } from "react";
import { PerfProfile, GoNoGoThresholds, DEFAULT_THRESHOLDS } from "@/types/perf";
import { PROFILE_TTFT_SLO, PROFILE_GEN_SPEED_SLO } from "@/lib/profileLabels";
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
import { Settings2, Info } from "lucide-react";

const COLORS = [
  "#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa",
  "#38bdf8", "#fb923c", "#4ade80", "#e879f9", "#facc15", "#94a3b8",
];

interface Props {
  profiles: PerfProfile[];
}

function fmt(n: number, decimals = 1) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}

/**
 * Pick the row at the median batch size — the likely operating point for a
 * moderate-traffic deployment. Min-batch understates throughput; max-batch
 * overstates it at unrealistic concurrency.
 */
function representativeRow(profile: PerfProfile) {
  const rows = [...profile.rows].sort((a, b) => a.batchSize - b.batchSize);
  return rows[Math.floor(rows.length / 2)] ?? rows[0];
}

function GoNoGoBadge({
  ttft, genSpeed, ttftSlo, genSpeedSlo,
}: { ttft: number; genSpeed: number; ttftSlo: number; genSpeedSlo: number }) {
  const ttftOk = ttft <= ttftSlo;
  const genOk = genSpeed >= genSpeedSlo;
  const go = ttftOk && genOk;
  const reasons = [];
  if (!ttftOk) reasons.push(`TTFT ${ttft.toFixed(1)}ms > SLO ${ttftSlo}ms`);
  if (!genOk) reasons.push(`Gen ${fmt(genSpeed)} t/s < SLO ${genSpeedSlo} t/s`);
  return (
    <span
      title={reasons.join(" · ") || "Both SLOs met"}
      className={`px-2 py-0.5 rounded-full text-xs font-bold cursor-help ${
        go ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
      }`}
    >
      {go ? "✓ GO" : "✗ NO-GO"}
    </span>
  );
}

export function CustomerView({ profiles }: Props) {
  const [thresholds, setThresholds] = useState<GoNoGoThresholds>(DEFAULT_THRESHOLDS);
  const [showThresholds, setShowThresholds] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [selectedProfileNum, setSelectedProfileNum] = useState<string>("");

  const allModels = Array.from(new Set(profiles.map((p) => p.model))).sort();
  const allProfileNums = Array.from(new Set(profiles.map((p) => p.profileNum))).sort();

  if (profiles.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-20">
        Upload performance sweep files above to see the customer view.
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
      seriesMap.set(key, { profile: p, color: COLORS[profiles.indexOf(p) % COLORS.length] });
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

  // SLO resolution: global override > per-profile default
  function ttftSloFor(p: PerfProfile) {
    if (thresholds.maxTtftMs !== DEFAULT_THRESHOLDS.maxTtftMs) return thresholds.maxTtftMs;
    return PROFILE_TTFT_SLO[p.profileNum] ?? 50;
  }
  function genSpeedSloFor(p: PerfProfile) {
    if (thresholds.minGenSpeedTps !== DEFAULT_THRESHOLDS.minGenSpeedTps) return thresholds.minGenSpeedTps;
    return PROFILE_GEN_SPEED_SLO[p.profileNum] ?? 30;
  }

  function toggleModel(m: string) {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  }

  const tooltipStyle = {
    contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 },
    labelStyle: { color: "#a1a1aa" },
  };

  return (
    <div className="space-y-6">
      {/* Comparison + threshold controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-start gap-6">
          {allModels.length > 1 && (
            <div className="space-y-2">
              <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Compare models</p>
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
          <div className="ml-auto">
            <button
              onClick={() => setShowThresholds((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                showThresholds
                  ? "border-amber-600 text-amber-400 bg-amber-500/10"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              <Settings2 size={12} /> SLO thresholds
            </button>
          </div>
        </div>

        {showThresholds && (
          <div className="pt-3 border-t border-zinc-800 space-y-2">
            <div className="flex items-center gap-4 text-xs text-zinc-400 flex-wrap">
              <span className="text-zinc-500">Global overrides (blank = use per-profile defaults):</span>
              <label className="flex items-center gap-1.5">
                Max TTFT (ms)
                <input
                  type="number"
                  min={1}
                  placeholder="auto"
                  value={thresholds.maxTtftMs === DEFAULT_THRESHOLDS.maxTtftMs ? "" : thresholds.maxTtftMs}
                  onChange={(e) =>
                    setThresholds((t) => ({
                      ...t,
                      maxTtftMs: e.target.value ? Number(e.target.value) : DEFAULT_THRESHOLDS.maxTtftMs,
                    }))
                  }
                  className="w-20 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="flex items-center gap-1.5">
                Min Gen Speed (t/s)
                <input
                  type="number"
                  min={1}
                  placeholder="auto"
                  value={thresholds.minGenSpeedTps === DEFAULT_THRESHOLDS.minGenSpeedTps ? "" : thresholds.minGenSpeedTps}
                  onChange={(e) =>
                    setThresholds((t) => ({
                      ...t,
                      minGenSpeedTps: e.target.value ? Number(e.target.value) : DEFAULT_THRESHOLDS.minGenSpeedTps,
                    }))
                  }
                  className="w-20 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </label>
            </div>
            <p className="text-zinc-600 text-xs flex items-start gap-1">
              <Info size={11} className="mt-0.5 shrink-0" />
              Per-profile TTFT SLOs: 30ms (conversational/balanced), 50ms (long-form), 100ms (doc
              processing), 200ms (RAG/large-doc). Gen speed SLOs: 50 t/s (interactive), 30 t/s
              (streaming), 20 t/s (batch). Basis: human reading speed ≈ 15 t/s; interactive targets
              3× reading speed.
            </p>
          </div>
        )}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-zinc-500 py-10">No profiles match the current filter.</div>
      )}

      {filtered.length > 0 && (
        <>
          {/* Summary cards */}
          <div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-1">Go / No-Go Summary</h2>
            <p className="text-zinc-500 text-xs mb-4">
              Evaluated at median batch size (representative mid-load). Hover badge for failure reason.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {series.map(([key, { profile, color }]) => {
                const repRow = representativeRow(profile);
                if (!repRow) return null;
                const ttftSlo = ttftSloFor(profile);
                const genSlo = genSpeedSloFor(profile);
                return (
                  <div key={key} className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm" style={{ color }}>{profile.model}</span>
                      <GoNoGoBadge ttft={repRow.ttftMs} genSpeed={repRow.genSpeed} ttftSlo={ttftSlo} genSpeedSlo={genSlo} />
                    </div>
                    <p className="text-zinc-500 text-xs mb-3 leading-tight">{profile.profile}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-zinc-700/50 rounded p-2">
                        <div className="text-zinc-400 flex justify-between">
                          TTFT <span className="text-zinc-600">SLO {ttftSlo}ms</span>
                        </div>
                        <div className={`font-bold text-base ${repRow.ttftMs <= ttftSlo ? "text-white" : "text-red-400"}`}>
                          {repRow.ttftMs.toFixed(1)} ms
                        </div>
                      </div>
                      <div className="bg-zinc-700/50 rounded p-2">
                        <div className="text-zinc-400 flex justify-between">
                          Gen Speed <span className="text-zinc-600">SLO {genSlo}</span>
                        </div>
                        <div className={`font-bold text-base ${repRow.genSpeed >= genSlo ? "text-white" : "text-red-400"}`}>
                          {fmt(repRow.genSpeed)} t/s
                        </div>
                      </div>
                      <div className="bg-zinc-700/50 rounded p-2">
                        <div className="text-zinc-400">Throughput</div>
                        <div className="text-white font-bold text-base">{fmt(repRow.throughput)} t/s</div>
                      </div>
                      <div className="bg-zinc-700/50 rounded p-2">
                        <div className="text-zinc-400">RPM</div>
                        <div className="text-white font-bold text-base">{fmt(repRow.rpm)}</div>
                      </div>
                    </div>
                    <p className="text-zinc-600 text-xs mt-2">@ bs={repRow.batchSize} (median load)</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TTFT chart */}
          <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
            <h3 className="text-zinc-200 font-medium mb-1">Time to First Token (ms) vs Batch Size</h3>
            <p className="text-zinc-500 text-xs mb-4">Lower is better. SLO varies by profile — see per-profile defaults in the threshold panel.</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={buildData("ttftMs")}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 11 }} />
                <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}ms`} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${Number(v).toFixed(2)} ms`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {series.map(([key, { color }]) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Gen Speed chart */}
          <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
            <h3 className="text-zinc-200 font-medium mb-1">Generation Speed (t/s/user) vs Batch Size</h3>
            <p className="text-zinc-500 text-xs mb-4">Decreases with batch size — more users sharing hardware. Target above reading speed (15 t/s).</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={buildData("genSpeed")}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 11 }} />
                <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${fmt(Number(v))} t/s`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {series.map(([key, { color }]) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* RPM chart */}
          <div className="bg-zinc-800/40 rounded-xl p-5 border border-zinc-700">
            <h3 className="text-zinc-200 font-medium mb-1">Requests Per Minute vs Batch Size</h3>
            <p className="text-zinc-500 text-xs mb-4">System capacity — how many concurrent requests the deployment can serve.</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={buildData("rpm")}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="batchSize" stroke="#71717a" tick={{ fontSize: 11 }} />
                <YAxis stroke="#71717a" tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${fmt(Number(v))} RPM`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {series.map(([key, { color }]) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
