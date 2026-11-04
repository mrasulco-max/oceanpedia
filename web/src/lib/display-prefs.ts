/**
 * Preferensi tampilan per perangkat (tema, kurangi animasi, putar video otomatis) disalin dari
 * preferensi akun (database) ke cookie "ob_prefs" agar server bisa merender tema tanpa kedip.
 * Format: t=light|dark|system&m=0|1&a=0|1
 */
export type DisplayPrefs = { theme: "light" | "dark" | "system"; reduceMotion: boolean; autoplay: boolean };
export const DEFAULT_DISPLAY: DisplayPrefs = { theme: "light", reduceMotion: false, autoplay: true };

export function parseDisplay(raw: string | undefined | null): DisplayPrefs {
  const p = new URLSearchParams(raw ?? "");
  const t = p.get("t");
  return {
    theme: t === "dark" || t === "system" ? t : "light",
    reduceMotion: p.get("m") === "1",
    autoplay: p.get("a") !== "0",
  };
}
export function encodeDisplay(d: DisplayPrefs): string {
  return `t=${d.theme}&m=${d.reduceMotion ? 1 : 0}&a=${d.autoplay ? 1 : 0}`;
}
/** Dari preferensi akun (users.preferences). */
export function displayFromPrefs(p: Record<string, unknown>): DisplayPrefs {
  const t = p.theme;
  return {
    theme: t === "dark" || t === "system" ? t : "light",
    reduceMotion: p.reduce_motion === true,
    autoplay: p.autoplay_video !== false,
  };
}
/** Peramban: simpan cookie & terapkan langsung ke <html>. */
export function applyDisplay(d: DisplayPrefs): void {
  try {
    document.cookie = `ob_prefs=${encodeURIComponent(encodeDisplay(d))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    /* cookie diblokir */
  }
  const el = document.documentElement;
  el.dataset.theme = d.theme;
  if (d.reduceMotion) el.dataset.motion = "reduce";
  else delete el.dataset.motion;
}
