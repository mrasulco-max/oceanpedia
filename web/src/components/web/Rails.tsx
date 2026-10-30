import { AdSlot, pickSlot } from "@/components/ui/AdSlot";
import type { AdSlot as Slot } from "@/lib/types";

/** Tata letak 3 kolom: iklan skyscraper kiri/kanan (160×600) + konten tengah. */
export function Rails({ slots, children }: { slots: Slot[]; children: React.ReactNode }) {
  const left = pickSlot(slots, "web_sky_left");
  const right = pickSlot(slots, "web_sky_right");
  if (!left && !right) return <div className="w-wrap" style={{ marginTop: 28 }}>{children}</div>;
  return (
    <div className="w-wrap w-rails">
      <aside aria-label="Ruang iklan kiri"><AdSlot slot={left} /></aside>
      <div style={{ minWidth: 0 }}>{children}</div>
      <aside aria-label="Ruang iklan kanan"><AdSlot slot={right} /></aside>
    </div>
  );
}

export function TopLeaderboard({ slots }: { slots: Slot[] }) {
  const s = pickSlot(slots, "web_leaderboard_top");
  return s ? <div className="w-wrap w-top-ad"><AdSlot slot={s} /></div> : null;
}
