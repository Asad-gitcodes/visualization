export const CHART_COLORS = [
  "#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa",
  "#38bdf8", "#fb923c", "#4ade80", "#e879f9", "#facc15", "#94a3b8",
];

export function fmt(n: number, decimals = 1): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}

export const TOOLTIP_STYLE = {
  contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 },
  labelStyle: { color: "#a1a1aa" },
};
