/**
 * Preferensi tampilan per perangkat disalin dari preferensi akun (database) ke cookie "ob_prefs"
 * agar server bisa merender tanpa kedip: tema, kurangi animasi, video otomatis, ukuran huruf artikel,
 * bahasa antarmuka, format angka, dan zona waktu.
 * Format: t=light|dark|system&m=0|1&a=0|1&f=0..3&l=id|en&n=id|en|space&z=Asia/Jakarta|Asia/Makassar|Asia/Jayapura
 */
export type FontSize = 0 | 1 | 2 | 3; // kecil, sedang, besar, sangat besar
export type NumberFormat = "id" | "en" | "space";
export type Zone = "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura";
export type DisplayPrefs = {
  theme: "light" | "dark" | "system";
  reduceMotion: boolean;
  autoplay: boolean;
  font: FontSize;
  lang: "id" | "en";
  num: NumberFormat;
  zone: Zone;
};
export const DEFAULT_DISPLAY: DisplayPrefs = { theme: "light", reduceMotion: false, autoplay: true, font: 1, lang: "id", num: "id", zone: "Asia/Jakarta" };
export const FONT_KEYS = ["s", "m", "l", "xl"] as const;
export const ZONES: Zone[] = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"];
export const ZONE_LABEL: Record<Zone, string> = { "Asia/Jakarta": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };
export const ZONE_SHIFT: Record<Zone, number> = { "Asia/Jakarta": 0, "Asia/Makassar": 1, "Asia/Jayapura": 2 };

/** Nilai preferensi akun "font_size" (urutan sama dengan FontSize). */
export const FONT_PREFS = ["small", "medium", "large", "xlarge"] as const;
const fontOf = (v: unknown): FontSize => {
  const i = typeof v === "number" ? v : Math.max(FONT_KEYS.indexOf(String(v) as (typeof FONT_KEYS)[number]), FONT_PREFS.indexOf(String(v) as (typeof FONT_PREFS)[number]));
  return (i >= 0 && i <= 3 ? i : 1) as FontSize;
};
const zoneOf = (v: unknown): Zone => (ZONES.includes(v as Zone) ? (v as Zone) : "Asia/Jakarta");
const numOf = (v: unknown): NumberFormat => (v === "en" || v === "space" ? v : "id");

export function parseDisplay(raw: string | undefined | null): DisplayPrefs {
  const p = new URLSearchParams(raw ?? "");
  const t = p.get("t");
  return {
    theme: t === "dark" || t === "system" ? t : "light",
    reduceMotion: p.get("m") === "1",
    autoplay: p.get("a") !== "0",
    font: fontOf(Number(p.get("f") ?? 1)),
    lang: p.get("l") === "en" ? "en" : "id",
    num: numOf(p.get("n")),
    zone: zoneOf(p.get("z")),
  };
}
export function encodeDisplay(d: DisplayPrefs): string {
  return `t=${d.theme}&m=${d.reduceMotion ? 1 : 0}&a=${d.autoplay ? 1 : 0}&f=${d.font}&l=${d.lang}&n=${d.num}&z=${encodeURIComponent(d.zone)}`;
}
/** Dari preferensi akun (users.preferences). */
export function displayFromPrefs(p: Record<string, unknown>): DisplayPrefs {
  const t = p.theme;
  return {
    theme: t === "dark" || t === "system" ? t : "light",
    reduceMotion: p.reduce_motion === true,
    autoplay: p.autoplay_video !== false,
    font: fontOf(p.font_size ?? 1),
    lang: p.language === "en" ? "en" : "id",
    num: numOf(p.number_format),
    zone: zoneOf(p.timezone),
  };
}
/** Preferensi perangkat saat ini (peramban). */
export function currentDisplay(): DisplayPrefs {
  try {
    const m = /(?:^|;\s*)ob_prefs=([^;]*)/.exec(document.cookie);
    return parseDisplay(m ? decodeURIComponent(m[1]!) : "");
  } catch {
    return { ...DEFAULT_DISPLAY };
  }
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
  el.dataset.font = FONT_KEYS[d.font];
  el.lang = d.lang;
}

/** Video otomatis "hanya saat Wi-Fi": tidak diputar pada data seluler atau mode hemat data. */
export function onMeteredConnection(): boolean {
  try {
    const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean; effectiveType?: string } }).connection;
    if (!c) return false;
    return !!c.saveData || c.type === "cellular" || c.effectiveType === "2g" || c.effectiveType === "slow-2g";
  } catch {
    return false;
  }
}

/** Gabungkan preferensi akun yang ada di objek (kunci lain tetap dari perangkat ini). */
export function mergeDisplay(base: DisplayPrefs, p: Record<string, unknown>): DisplayPrefs {
  const d = displayFromPrefs(p);
  return {
    theme: "theme" in p ? d.theme : base.theme,
    reduceMotion: "reduce_motion" in p ? d.reduceMotion : base.reduceMotion,
    autoplay: "autoplay_video" in p ? d.autoplay : base.autoplay,
    font: "font_size" in p ? d.font : base.font,
    lang: "language" in p ? d.lang : base.lang,
    num: "number_format" in p ? d.num : base.num,
    zone: "timezone" in p ? d.zone : base.zone,
  };
}
