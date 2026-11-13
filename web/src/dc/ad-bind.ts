import "server-only";
import type { AdSlot } from "@/lib/types";
import { esc } from "./bind";

const isVideo = (u: string) => /\.(mp4|webm|m4v|mov)(\?|$)/i.test(u);
const live = (s: AdSlot | undefined): s is AdSlot & { campaign_id: string; creative_url: string } => !!s?.campaign_id && !!s.creative_url;

function creative(s: AdSlot & { creative_url: string }, fit: "contain" | "cover"): string {
  const u = esc(s.creative_url);
  return isVideo(s.creative_url)
    ? `<video src="${u}" muted loop playsinline preload="metadata" style="width: 100%; height: 100%; object-fit: ${fit}; display: block"></video>`
    : `<img src="${u}" alt="Iklan ${esc(s.advertiser ?? "")}" loading="lazy" style="width: 100%; height: 100%; object-fit: ${fit}; display: block">`;
}

/** Popup iklan (enhancer "adpopup"): tampil setelah jeda singkat, dibatasi frekuensinya per perangkat. */
export function adPopup(slots: AdSlot[], app: boolean): string {
  const s = slots.find((x) => x.placement === "popup" && live(x));
  if (!live(s)) return "";
  const w = app ? "min(86vw, 340px)" : `${s.width || 400}px`;
  return (
    `<div data-ad-popup="${esc(s.campaign_id)}" hidden role="dialog" aria-modal="true" aria-label="Iklan" style="position: fixed; inset: 0; z-index: 60; background: rgba(11,11,15,.55); display: flex; align-items: center; justify-content: center; padding: 20px">` +
    `<div style="position: relative; width: ${w}; max-height: 86vh; border-radius: 20px; overflow: hidden; background: #FFFFFF; box-shadow: 0 20px 60px rgba(11,11,15,.35); display: flex; flex-direction: column">` +
    `<span style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px 8px 16px; font-size: 10px; letter-spacing: .08em; color: #5F6B7D"><span>IKLAN · ${esc(s.advertiser ?? "Sponsor")}</span><button type="button" data-ad-close aria-label="Tutup iklan" style="width: 32px; height: 32px; border: 0; border-radius: 999px; background: #F2F4F7; color: #0B0B0F; font-size: 18px; line-height: 1; cursor: pointer">×</button></span>` +
    `<a href="/api/ads/${esc(s.campaign_id)}/click" target="_blank" rel="sponsored noopener" style="display: block; aspect-ratio: ${s.width || 320} / ${s.height || 480}; max-height: 74vh">${creative(s, "cover")}</a>` +
    `</div></div>`
  );
}

/** Iklan layar penuh di antara video Ocean Short (aplikasi), muncul setiap beberapa geseran (enhancer "shorts"). */
export function shortFeedAd(slots: AdSlot[]): string {
  const s = slots.find((x) => x.placement === "feed" && live(x));
  if (!live(s)) return "";
  return (
    `<div data-sh-ad="${esc(s.campaign_id)}" hidden role="region" aria-label="Iklan sponsor" style="position: fixed; inset: 0; z-index: 50; background: #0B0B0F; color: #FFFFFF; transition: transform .3s cubic-bezier(.2,.8,.2,1)">` +
    `<div style="position: absolute; inset: 0">${creative(s, "cover")}</div>` +
    `<div style="position: absolute; left: 0; right: 0; bottom: 0; padding: 80px 20px calc(28px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, rgba(0,0,0,.8)); display: flex; flex-direction: column; gap: 10px">` +
    `<span style="display: flex; align-items: center; gap: 8px"><strong style="font-size: 16px">@${esc(s.advertiser ?? "sponsor")}</strong><span style="padding: 2px 8px; border-radius: 6px; background: rgba(255,255,255,.22); font-size: 11px; font-weight: 500">Sponsor</span></span>` +
    `<a href="/api/ads/${esc(s.campaign_id)}/click" target="_blank" rel="sponsored noopener" style="display: flex; align-items: center; justify-content: center; min-height: 48px; border-radius: 12px; background: #FE2C55; color: #FFFFFF; font-size: 15px; font-weight: 500; text-decoration: none">Pelajari selengkapnya</a>` +
    `<span style="font-size: 12px; opacity: .75; text-align: center">Geser untuk lanjut menonton</span>` +
    `</div></div>`
  );
}

/** Slot khusus (popup & feed) tidak dipasang di kotak iklan desain biasa. */
export const inlineSlots = (slots: AdSlot[]) => slots.filter((s) => s.placement !== "popup" && s.placement !== "feed");
