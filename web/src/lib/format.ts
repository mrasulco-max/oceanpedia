const TZ = "Asia/Jakarta";
const LOCALE = "id-ID";

export function formatNumber(n: number, digits = 2): string {
  const d = Math.abs(n) >= 1000 ? 0 : digits;
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

export function formatPrice(n: number, currency: string): string {
  const digits = currency === "IDR" && n >= 100 ? 0 : 2;
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function formatIDR(n: number): string {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export function formatPct(n: number): string {
  const s = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(n);
  return s.replace("-", "−") + "%";
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) + " WIB";
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatToday(d = new Date()): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** relativeTime: "12 mnt lalu", "3 jam lalu", "kemarin", atau tanggal. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 172800) return "kemarin";
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
}

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}
