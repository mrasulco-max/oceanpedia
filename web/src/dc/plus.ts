/**
 * Enhancer Ocean Pedia Plus ("plus"): pilih paket, checkout Midtrans Snap, menunggu & cek status
 * pembayaran, invoice. Semua lewat BFF /api/v1/billing/* — server key Midtrans hanya ada di API.
 */
import type { Cleanup, Env } from "./enhancers";
import { toast } from "./toast";

type Cfg = {
  monthly: { code: string; name: string; price: number; seats: number };
  yearly: { code: string; price: number } | null;
  tax: number;
  promo: { code: string; first: number } | null;
  loggedIn: boolean;
  doku?: boolean;
};
type Provider = "midtrans" | "doku";
const PAY_HOST = /^https:\/\/(app\.midtrans\.com|app\.sandbox\.midtrans\.com|([a-z0-9-]+\.)*doku\.com)\//;
type St = { period?: number; promo?: boolean; method?: number };
const METHODS = ["qris", "va_bca", "va_mandiri", "va_bri", "gopay", "ovo", "dana", "card"];
const NAMES = ["QRIS", "BCA Virtual Account", "Mandiri Virtual Account", "BRI Virtual Account", "GoPay", "OVO", "DANA", "Kartu kredit / debit"];
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const dayFmt = (d: Date) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" }).format(d);

async function post(url: string, body: unknown = {}) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown> & { detail?: string; title?: string; errors?: Record<string, string> };
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: "Koneksi bermasalah. Coba lagi." } as Record<string, unknown> & { detail?: string; title?: string; errors?: Record<string, string> } };
  }
}
const why = (d: { detail?: string; title?: string; errors?: Record<string, string> }, fb: string) => (d.errors && Object.values(d.errors)[0]) || d.detail || d.title || fb;

export function plus(host: HTMLElement, { router, ctx }: Env): Cleanup {
  const offs: (() => void)[] = [];
  const cfg: Cfg | null = ctx.plus ? (JSON.parse(ctx.plus) as Cfg) : null;
  let st: St = ctx.state ? (JSON.parse(ctx.state) as St) : {};
  let busy = false;
  let chosen: Provider = "midtrans";
  // GoPay hanya lewat Midtrans; OVO & DANA hanya lewat DOKU.
  const provider = (): Provider => {
    if (!cfg?.doku) return "midtrans";
    const m = METHODS[st.method ?? 0];
    return m === "gopay" ? "midtrans" : m === "ovo" || m === "dana" ? "doku" : chosen;
  };
  const paintProvider = () => {
    const p = provider();
    host.querySelectorAll<HTMLElement>("[data-pay-provider]").forEach((b) => {
      const on = b.dataset.payProvider === p;
      b.setAttribute("aria-checked", String(on));
      b.style.borderColor = on ? "#2F74EB" : "#E3EAF4";
      b.style.background = on ? "#EEF5FF" : "#FFFFFF";
    });
  };

  // ---------------------------------------------------------------- checkout: angka dari harga nyata
  const calc = () => {
    if (!cfg) return null;
    const yearly = (st.period ?? 0) === 1 && cfg.yearly;
    const base = yearly ? cfg.yearly!.price : cfg.monthly.price * cfg.monthly.seats;
    const promoOn = !!(st.promo && cfg.promo && !yearly);
    const disc = promoOn ? base - cfg.promo!.first : 0;
    const sub = base - disc;
    const tax = Math.round(sub * cfg.tax);
    return { yearly, base, disc, sub, tax, total: sub + tax, promoOn, code: yearly ? cfg.yearly!.code : cfg.monthly.code };
  };
  const paint = () => {
    const c = calc();
    if (!c || !cfg) return;
    const end = new Date();
    if (c.yearly) end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    const set = (k: string, v: string) => host.querySelectorAll<HTMLElement>(`[data-ck="${k}"]`).forEach((el) => el.textContent !== v && (el.textContent = v));
    set("planLbl", `${cfg.monthly.name} · ${c.yearly ? "tahunan" : "bulanan"}${cfg.monthly.seats > 1 && !c.yearly ? ` · ${cfg.monthly.seats} akun` : ""}`);
    set("base", rp(c.base));
    set("disc", `−${rp(c.disc)}`);
    set("subtotal", rp(c.sub));
    set("tax", rp(c.tax));
    set("total", rp(c.total));
    set("renewTxt", `Aktif hingga ${dayFmt(end)}. Tanpa debit otomatis — perpanjang kapan saja dari halaman Plus.`);
    set("promoTxt", !cfg.promo ? "" : c.promoOn ? `Diterapkan · bulan pertama ${rp(cfg.promo.first)}` : c.yearly ? "Hanya untuk paket bulanan" : `Bulan pertama ${rp(cfg.promo.first)}`);
    set("methodName", `${NAMES[st.method ?? 0] ?? "QRIS"}${cfg.doku ? ` · ${provider() === "doku" ? "DOKU" : "Midtrans"}` : ""}`);
    paintProvider();
    // Baris diskon disembunyikan bila promo tidak berlaku.
    host.querySelectorAll<HTMLElement>('[data-ck="disc"]').forEach((el) => {
      const row = el.parentElement;
      if (row) row.style.display = c.promoOn ? "" : "none";
    });
  };

  const onState = (e: Event) => {
    st = ((e as CustomEvent).detail ?? {}) as St;
    paint();
  };
  host.addEventListener("dc:state", onState);
  offs.push(() => host.removeEventListener("dc:state", onState));
  paint();

  // ---------------------------------------------------------------- menunggu pembayaran: cek status berkala
  const check = async (manual: boolean) => {
    if (!ctx.inv || busy) return;
    busy = true;
    try {
      const r = await post(`/api/v1/billing/invoices/${ctx.inv}/refresh`);
      if (r.status === 401) {
        router.push(`/masuk?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }
      const status = r.data.status as string | undefined;
      if (status === "paid") {
        toast(host, "Pembayaran diterima. Plus aktif!", "ok");
        router.push(`/plus/berhasil?inv=${ctx.inv}`);
      } else if (status === "void") {
        toast(host, "Pembayaran dibatalkan atau kedaluwarsa. Silakan buat pesanan baru.");
        router.refresh();
      } else if (manual) {
        toast(host, r.ok ? "Belum ada pembayaran masuk. Status dicek otomatis." : why(r.data, "Gagal mengecek status."), r.ok ? "ok" : "error");
      }
    } finally {
      busy = false;
    }
  };
  if (ctx.inv && ctx.invStatus === "open" && location.pathname === "/plus/menunggu-pembayaran") {
    const iv = window.setInterval(() => void check(false), 10000);
    offs.push(() => window.clearInterval(iv));
    void check(false);
  }

  // ---------------------------------------------------------------- klik
  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t || !host.contains(t)) return;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const pay = t.closest<HTMLElement>('[data-plus="pay"]');
    if (pay && cfg) {
      stop();
      if (pay.dataset.logged !== "1") {
        router.push(`/masuk?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }
      const c = calc()!;
      if (busy) return;
      busy = true;
      pay.setAttribute("aria-busy", "true");
      void (async () => {
        try {
          const r = await post("/api/v1/billing/checkout", { plan_code: c.code, seats: cfg.monthly.seats, promo_code: c.promoOn ? cfg.promo!.code : "", method: METHODS[st.method ?? 0] ?? "all", provider: provider() });
          if (r.status === 401) {
            router.push(`/masuk?next=${encodeURIComponent(location.pathname + location.search)}`);
            return;
          }
          if (!r.ok) {
            toast(host, why(r.data, "Pembayaran belum dapat dibuat."));
            return;
          }
          const inv = (r.data.invoice as { id: string }).id;
          const url = r.data.pay_url as string | undefined;
          if (url && PAY_HOST.test(url)) {
            toast(host, `Mengarahkan ke halaman pembayaran aman ${r.data.provider === "doku" ? "DOKU" : "Midtrans"}…`, "ok");
            window.location.assign(url);
          } else {
            router.push(`/plus/menunggu-pembayaran?inv=${inv}`);
          }
        } finally {
          busy = false;
          pay.removeAttribute("aria-busy");
        }
      })();
      return;
    }
    const pv = t.closest<HTMLElement>("[data-pay-provider]");
    if (pv) {
      stop();
      const want = pv.dataset.payProvider as Provider;
      const m = METHODS[st.method ?? 0];
      if ((want === "midtrans" && (m === "ovo" || m === "dana")) || (want === "doku" && m === "gopay")) {
        toast(host, want === "doku" ? "GoPay hanya tersedia lewat Midtrans." : `${NAMES[st.method ?? 0]} hanya tersedia lewat DOKU.`);
        return;
      }
      chosen = want;
      paint();
      return;
    }
    const chk = t.closest('[data-plus="check"]');
    if (chk) {
      stop();
      void check(true);
      return;
    }
    const cp = t.closest<HTMLElement>("[data-copy]");
    if (cp && cp.dataset.copy) {
      void navigator.clipboard?.writeText(cp.dataset.copy).catch(() => undefined);
      return;
    }
    const inv = t.closest<HTMLElement>('[data-plus="invoice"]');
    if (inv) {
      stop();
      router.push(`/plus/email?inv=${inv.dataset.inv}`);
      return;
    }
    if (t.closest('[data-plus="student"]')) {
      stop();
      router.push("/plus/checkout?plan=student");
    }
  };
  host.addEventListener("click", onClick, true);
  offs.push(() => host.removeEventListener("click", onClick, true));

  // ---------------------------------------------------------------- halaman paket: pilihan paket → tombol langganan
  const onChange = (e: Event) => {
    const r = e.target instanceof HTMLInputElement && e.target.name === "plan" ? e.target : null;
    if (!r) return;
    const cta = host.querySelector<HTMLAnchorElement>('[data-plus="cta"]');
    const name = r.value === "student" ? "Student" : r.value === "corporate" ? "Corporate" : "Essential";
    if (cta) {
      cta.setAttribute("href", `/plus/checkout?plan=${r.value}`);
      cta.textContent = `Langganan Ocean Pedia Plus ${name}`;
    }
    host.querySelectorAll<HTMLInputElement>('input[name="plan"]').forEach((x) => {
      const lab = x.closest("label");
      if (!lab) return;
      lab.style.border = x.checked ? "2px solid #4285F4" : "1px solid #E3EAF4";
      lab.style.background = x.checked ? "#F2F7FF" : "#FFFFFF";
      const dot = x.nextElementSibling instanceof HTMLElement ? x.nextElementSibling : null;
      if (dot) dot.style.border = x.checked ? "7px solid #4285F4" : "2px solid #C4CDDA";
    });
  };
  host.addEventListener("change", onChange);
  offs.push(() => host.removeEventListener("change", onChange));

  return () => offs.forEach((f) => f());
}
