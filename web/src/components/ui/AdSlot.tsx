import type { AdSlot as Slot } from "@/lib/types";

/**
 * Placeholder slot iklan. Di produksi komponen ini memuat ad server (mis. Google Ad Manager)
 * berdasarkan `code`. Slot hanya dirender bila API mengembalikannya untuk halaman tersebut
 * (pelanggan Plus tidak menerima slot sama sekali).
 */
export function AdSlot({ slot, fallbackWidth }: { slot: Slot | undefined; fallbackWidth?: number }) {
  if (!slot) return null;
  const w = slot.width || fallbackWidth || 300;
  const h = slot.height || 120;
  return (
    <div className="ad" role="complementary" aria-label={`Iklan ${slot.placement}`} style={{ width: w, maxWidth: "100%" }}>
      <span className="ad-label"><span>Iklan</span><span>{slot.width ? `${slot.width}×${slot.height}` : "native"}</span></span>
      <span className="ad-box" style={{ width: w, height: h }}>{slot.width ? `${slot.width} × ${slot.height}` : "native"}</span>
    </div>
  );
}

export function pickSlot(slots: Slot[], code: string) {
  return slots.find((s) => s.code === code);
}
