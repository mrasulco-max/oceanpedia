import type { Candle } from "@/lib/types";
import { formatNumber } from "@/lib/format";

/** Grafik candlestick SVG (dirender di server, tanpa library klien). */
export function CandleChart({ data, height = 360, label }: { data: Candle[]; height?: number; label: string }) {
  if (data.length === 0) return <p style={{ color: "var(--sub)" }}>Data grafik belum tersedia.</p>;
  const W = 1000, AX = 64, PW = W - AX, VH = 60, H = height - VH - 26;
  const lo = Math.min(...data.map((d) => d.l)), hi = Math.max(...data.map((d) => d.h));
  const pad = (hi - lo) * 0.06 || 1;
  const y = (v: number) => 6 + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - 12);
  const cw = PW / data.length, bw = Math.max(1, cw * 0.62);
  const vmax = Math.max(...data.map((d) => d.v)) || 1;
  const ma = (k: number) => data.map((_, i) => { const s = data.slice(Math.max(0, i - k + 1), i + 1); return s.reduce((a, b) => a + b.c, 0) / s.length; });
  const ticks = Array.from({ length: 5 }, (_, i) => lo - pad + ((hi - lo + 2 * pad) * i) / 4);
  const last = data[data.length - 1]!;
  const lp = y(last.c);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={label} style={{ display: "block" }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={0} x2={PW} y1={y(v)} y2={y(v)} stroke="#F0F3F8" />
          <text x={PW + 8} y={y(v) + 4} fontSize={11} fill="#8794A8" fontFamily="var(--mono)">{formatNumber(v)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const vh = (d.v / vmax) * (VH - 6);
        return <rect key={"v" + i} x={i * cw + (cw - bw) / 2} y={H + 6 + VH - vh} width={bw} height={vh} fill={d.c >= d.o ? "#16A34A" : "#E5484D"} opacity={0.25} />;
      })}
      {[{ k: 9, c: "#F59E0B" }, { k: 21, c: "#7C3AED" }].map(({ k, c }) => (
        <polyline key={k} fill="none" stroke={c} strokeWidth={1.5} points={ma(k).map((m, i) => `${(i * cw + cw / 2).toFixed(1)},${y(m).toFixed(1)}`).join(" ")} />
      ))}
      {data.map((d, i) => {
        const col = d.c >= d.o ? "#16A34A" : "#E5484D";
        const cx = i * cw + cw / 2;
        return (
          <g key={"c" + i}>
            <line x1={cx} x2={cx} y1={y(d.h)} y2={y(d.l)} stroke={col} strokeWidth={1.1} />
            <rect x={i * cw + (cw - bw) / 2} y={y(Math.max(d.o, d.c))} width={bw} height={Math.max(1.4, Math.abs(y(d.o) - y(d.c)))} fill={col} />
          </g>
        );
      })}
      <line x1={0} x2={PW} y1={lp} y2={lp} stroke="#16A34A" strokeDasharray="2 3" />
      <rect x={PW + 2} y={lp - 10} width={AX - 4} height={20} rx={4} fill="#16A34A" />
      <text x={PW + 8} y={lp + 4} fontSize={11} fontWeight={700} fill="#fff" fontFamily="var(--mono)">{formatNumber(last.c)}</text>
      <line x1={PW} x2={PW} y1={0} y2={H + VH + 6} stroke="#E3EAF4" />
    </svg>
  );
}
