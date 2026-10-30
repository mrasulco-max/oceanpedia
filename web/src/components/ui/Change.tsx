import { formatPct } from "@/lib/format";

export function Change({ pct, badge = false }: { pct: number; badge?: boolean }) {
  const cls = pct >= 0 ? "up" : "down";
  const txt = `${pct >= 0 ? "▲" : "▼"} ${formatPct(pct)}`;
  return badge ? <span className={`badge ${cls}`}>{txt}</span> : <span className={cls} style={{ fontWeight: 700, fontSize: 12 }}>{txt}</span>;
}
