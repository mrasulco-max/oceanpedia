import "server-only";
import { esc as esc0 } from "./bind";
import { rx, SVG } from "./kit";

/**
 * Binder Ocean Pedia Plus + Midtrans: paket (app-25), checkout (app-28), menunggu pembayaran (app-29),
 * berhasil (app-30), bukti bayar email (app-31) & WhatsApp (app-32).
 */

const esc = (s: string) => esc0(s).replace(/\$/g, "&#36;");
export const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const WIB = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...o }).format(new Date(iso));
const day = (iso: string) => WIB(iso, { day: "numeric", month: "short", year: "numeric" });
const time = (iso: string) => WIB(iso, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":");

/** Ganti semua teks persis `>from<`. */
function swap(h: string, from: string, to: string): string {
  return h.split(`>${from}<`).join(`>${esc(to)}<`);
}
function swapOnce(h: string, from: string, to: string): string {
  const i = h.indexOf(`>${from}<`);
  return i < 0 ? h : h.slice(0, i) + `>${esc(to)}<` + h.slice(i + from.length + 2);
}

export interface PlanInfo {
  code: string;
  name: string;
  price_amount: number;
  billing_period: "month" | "year";
  min_seats: number;
  features: string[];
}
export interface BillInfo {
  id: string;
  number: string;
  plan_code: string;
  plan_name: string;
  billing_period: string;
  seats: number;
  subtotal: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  promo_code: string | null;
  status: "draft" | "open" | "paid" | "void";
  issued_at: string;
  paid_at: string | null;
  order_id: string;
  method: string;
  payment_status: string;
  pay_url?: string;
  pay_expires_at: string | null;
  period_end: string | null;
  va_bank?: string;
  va_number?: string;
  bill_key?: string;
  biller_code?: string;
}
export interface SubInfo {
  plan_code: string;
  plan_name: string;
  billing_period: string;
  price_amount: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export const METHOD_NAME: Record<string, string> = {
  qris: "QRIS",
  va_bca: "BCA Virtual Account",
  bca_va: "BCA Virtual Account",
  va_mandiri: "Mandiri Virtual Account",
  echannel: "Mandiri Virtual Account",
  va_bri: "BRI Virtual Account",
  bri_va: "BRI Virtual Account",
  va_bni: "BNI Virtual Account",
  bni_va: "BNI Virtual Account",
  permata_va: "Permata Virtual Account",
  bank_transfer: "Virtual Account",
  gopay: "GoPay",
  shopeepay: "ShopeePay",
  card: "Kartu kredit / debit",
  credit_card: "Kartu kredit / debit",
  other_qris: "QRIS",
  all: "Pilih di halaman pembayaran",
};
const periodLabel = (p: string) => (p === "year" ? "tahunan" : "bulanan");
const baseCode = (code: string) => code.replace(/_yearly$/, "");

// ======================================================================= paket (app-25)
export function bindPlusPlans(html: string, d: { plans: PlanInfo[]; sub: SubInfo | null; tax: number }): string {
  let h = html;
  const by = (c: string) => d.plans.find((p) => p.code === c);
  for (const [code, sample] of [["student", "Rp19.000"], ["essential", "Rp59.000"], ["corporate", "Rp49.000"]] as const) {
    const p = by(code);
    if (p) h = swapOnce(h, sample, rp(p.price_amount));
  }
  const ess = by("essential");
  if (ess) h = h.replace("lalu Rp59.000/bulan.", `lalu ${esc(rp(ess.price_amount))}/bulan.`);
  h = h.replace(/PPN\)/, `PPN ${Math.round(d.tax * 100)}%)`);
  if (d.sub) {
    const until = d.sub.current_period_end ? ` · aktif s.d. ${day(d.sub.current_period_end)}` : "";
    h = h.replace(/<a href="\/plus\/checkout"([^>]*)>Langganan Ocean Pedia Plus Essential<\/a>/, `<a href="/plus/berhasil"$1>Kamu pelanggan Plus ${esc(d.sub.plan_name)}${esc(until)}</a><a href="/ai" data-ai-open style="display: block; margin-top: 10px; text-align: center; padding: 12px 16px; border-radius: 999px; border: 1px solid #BFD6FB; background: #EEF5FF; color: #2F74EB; font-size: 15px; font-weight: 500; text-decoration: none">✦ Buka Asisten AI &amp; analisis chart</a>`);
  } else {
    h = h.replace(/<a href="\/plus\/checkout"([^>]*)>Langganan Ocean Pedia Plus Essential<\/a>/, '<a href="/plus/checkout?plan=essential" data-plus="cta"$1>Langganan Ocean Pedia Plus Essential</a>');
  }
  h = h.replace('onClick="{{ f1 }}"', 'onClick="{{ f1 }}" data-plus="student"');
  h = h.replace("bukti dikirim ke email &amp; WhatsApp.", "bukti dikirim ke email.").replace("bukti dikirim ke email & WhatsApp.", "bukti dikirim ke email.");
  // Pembayaran per periode lewat Midtrans (tanpa debit otomatis).
  h = h.replace(/>Diperpanjang otomatis · batalkan kapan saja</, ">Bayar per periode · tanpa debit otomatis<");
  return h;
}

// ======================================================================= checkout (app-28)
export interface CheckoutCfg {
  monthly: { code: string; name: string; price: number; seats: number };
  yearly: { code: string; price: number } | null;
  tax: number;
  promo: { code: string; first: number } | null;
  loggedIn: boolean;
}
export function bindCheckout(html: string, cfg: CheckoutCfg, me: { email: string; phone: string | null; features: string[] }): string {
  let h = html;
  const m = cfg.monthly;
  h = swapOnce(h, "Ocean Pedia Plus Essential", `Ocean Pedia Plus ${m.name}`);
  if (me.features.length) h = swapOnce(h, "Tanpa iklan · price alert tanpa batas · Analisis AI", me.features.slice(0, 3).join(" · "));
  h = h.replace(/(<span style="font-size: 12px; color: #5F6B7D">)Rp59\.000\/bulan(<\/span>)/, `$1${esc(rp(m.price * m.seats))}/bulan${m.seats > 1 ? ` (${m.seats} akun)` : ""}$2`);
  if (cfg.yearly) {
    h = h.replace(/(<span style="font-size: 12px; color: #5F6B7D">)Rp590\.000\/tahun(<\/span>)/, `$1${esc(rp(cfg.yearly.price))}/tahun$2`);
    const save = Math.round((1 - cfg.yearly.price / (m.price * 12)) * 100);
    h = h.replace(/>Hemat 17%</, `>Hemat ${save}%<`);
  } else {
    h = h.replace(/<button role="tab" aria-selected="\{\{ p\.i1\.pr \}\}"[\s\S]*?<\/button>/, "");
  }
  // OVO & DANA tidak tersedia di Midtrans Snap → disembunyikan.
  for (const i of [5, 6]) h = h.replace(rx(`<button[^>]*onClick="\\{\\{ m\\.i${i}\\.pick \\}\\}"(?:(?!</button>)[\\s\\S])*</button>`), "");
  if (!cfg.promo) h = h.replace(/<div[^>]*>(?:(?!<div)[\s\S])*?<strong style="font-family: 'Roboto Mono', monospace; font-size: 14px; font-weight: 500">PLUSBARU<\/strong>(?:(?!<\/button>)[\s\S])*?<\/button><\/div>/, "");
  // Angka dihitung ulang enhancer dari harga paket nyata (logika desain memakai harga contoh).
  for (const k of ["planLbl", "base", "disc", "subtotal", "tax", "total", "renewTxt", "promoTxt", "methodName"]) h = h.split(`{{ ${k} }}`).join(`<span data-ck="${k}">{{ ${k} }}</span>`);
  h = h.replace(/>PPN 11%</, `>PPN ${Math.round(cfg.tax * 100)}%<`);
  h = h.replace(/>Promo PLUSBARU · bulan pertama</, `>Promo ${esc(cfg.promo?.code ?? "")} · bulan pertama<`);
  h = swapOnce(h, "nadia.putri@email.com", me.email || "Email akun");
  // Bukti bayar dikirim lewat email (kanal WhatsApp belum aktif).
  void me.phone;
  h = h.replace(/<button[^>]*onClick="\{\{ n\.i1\.pick \}\}"(?:(?!<\/button>)[\s\S])*<\/button>/, "");
  h = h.replace(rx(`<a href="/plus/menunggu-pembayaran"([^>]*)>(${SVG})Bayar sekarang</a>`), `<a href="#" data-plus="pay" data-logged="${cfg.loggedIn ? 1 : 0}"$1>$2Bayar sekarang</a>`);
  return h;
}

// ======================================================================= menunggu pembayaran (app-29)
export function bindWaiting(html: string, b: BillInfo): string {
  let h = html;
  const raw = b;
  const total = rp(b.total);
  if (b.pay_expires_at) h = h.replace(/>Selesaikan sebelum [^<]*</, `>Selesaikan sebelum ${esc(day(b.pay_expires_at))}, ${esc(time(b.pay_expires_at))} WIB<`);
  const method = METHOD_NAME[b.method] ?? "Virtual Account";
  const va = raw.va_number ?? (raw.bill_key ? `${raw.biller_code} / ${raw.bill_key}` : "");
  h = swap(h, "BCA Virtual Account", va ? METHOD_NAME[`${raw.va_bank}_va`] ?? method : method);
  h = swapOnce(h, "BCA", (raw.va_bank ?? b.method.replace(/^va_/, "")).toUpperCase().slice(0, 7) || "VA");
  h = swap(h, "3901 0812 3456 7890", va ? va.replace(/(\d{4})(?=\d)/g, "$1 ") : "Dibuat setelah memilih metode");
  h = swap(h, "Rp10.989", total);
  h = swapOnce(h, "Essential bulanan · promo PLUSBARU · termasuk PPN", `${b.plan_name} ${periodLabel(b.billing_period)}${b.promo_code ? ` · promo ${b.promo_code}` : ""} · termasuk PPN`);
  // Cara bayar khusus BCA hanya relevan untuk VA BCA.
  if (!(raw.va_bank === "bca" || b.method === "va_bca")) {
    h = h.replace(/(<h2[^>]*>Cara bayar<\/h2>)[\s\S]*?(<p[^>]*>Setelah pembayaran diterima)/, (_m, head: string, tail: string) => `${head}<p style="margin: 8px 0 16px; font-size: 14px; line-height: 1.5; color: #5F6B7D">Ikuti instruksi di halaman pembayaran Midtrans untuk ${esc(method)}. Status di sini diperbarui otomatis setelah pembayaran diterima.</p>${tail}`);
  }
  h = h.replace('onClick="{{ copyVa }}"', `onClick="{{ copyVa }}" data-copy="${esc(va.replace(/\s/g, ""))}"`).replace('onClick="{{ copyAmt }}"', `onClick="{{ copyAmt }}" data-copy="${b.total}"`);
  h = h.replace(/<a href="\/plus\/berhasil"([^>]*)>([\s\S]*?)Cek status pembayaran<\/a>/, `<a href="#" data-plus="check" data-inv="${b.id}"$1>$2Cek status pembayaran</a>`);
  const plan = baseCode(b.plan_code);
  h = h.split('href="/plus/checkout"').join(`href="/plus/checkout?plan=${encodeURIComponent(plan)}"`);
  if (b.pay_url && b.status === "open") {
    h = h.replace(/(<a href="#" data-plus="check")/, `<a href="${esc(b.pay_url)}" data-plus="continue" style="display: flex; align-items: center; justify-content: center; min-height: 52px; margin-bottom: 10px; border-radius: 16px; background: #0B0B0F; color: #FFFFFF; font-size: 15px; font-weight: 500">Lanjutkan pembayaran</a>$1`);
  }
  h = h.replace(/ke <strong([^>]*)>email<\/strong> dan <strong[^>]*>WhatsApp<\/strong> kamu\./, "ke <strong$1>email</strong> kamu.");
  if (b.status === "void") h = h.replace(/>Menunggu pembayaran</, ">Pembayaran dibatalkan / kedaluwarsa<");
  return h;
}

// ======================================================================= berhasil (app-30)
export function bindPaid(html: string, b: BillInfo, me: { name: string; email: string; phone: string | null }): string {
  let h = html;
  const first = me.name.split(/\s+/)[0] || "kamu";
  h = h.replace(/>, Nadia\.</, `>, ${esc(first)}.<`);
  h = h.replace(/>Semua fitur Essential sudah aktif\.</, `>Semua fitur ${esc(b.plan_name)} sudah aktif.<`);
  h = swap(h, "Rp10.989", rp(b.total));
  h = swap(h, "INV/OP/2026/10/000482", b.number);
  const paid = b.paid_at ?? b.issued_at;
  h = swap(h, "30 Okt 2026 · 04:16 WIB", `${day(paid)} · ${time(paid)} WIB`);
  h = swap(h, "BCA Virtual Account", METHOD_NAME[b.method] ?? b.method.toUpperCase());
  h = swap(h, "Plus Essential · bulanan", `Plus ${b.plan_name} · ${periodLabel(b.billing_period)}`);
  if (b.period_end) h = swap(h, "30 Okt – 30 Nov 2026", `${day(paid)} – ${day(b.period_end)}`);
  h = swap(h, "Termasuk PPN 11%", `Termasuk PPN ${Math.round(b.tax_rate * 100)}%`);
  h = swap(h, "Rp1.089", rp(b.tax_amount));
  h = swap(h, "Perpanjangan berikutnya", "Berlaku hingga");
  if (b.period_end) h = swap(h, "30 Nov 2026 · Rp65.490", day(b.period_end));
  h = h.replace(/<a href="\/plus\/whatsapp"(?:(?!<\/a>)[\s\S])*<\/a>/, "");
  h = h.replace(/>nadia\.putri@email\.com · 04:16</, `>${esc(me.email)} · ${esc(time(paid))}<`);
  h = h.replace(/>\+62 812-\*\*\*\*-7890 · 04:16</, `>${esc(me.phone ? me.phone.replace(/(\+\d{2})(\d{3})\d+(\d{4})/, "$1 $2-****-$3") : "Nomor belum ditambahkan")} · ${esc(time(paid))}<`);
  h = h.split('href="/plus/email"').join(`href="/plus/email?inv=${b.id}"`).split('href="/plus/whatsapp"').join(`href="/plus/whatsapp?inv=${b.id}"`);
  h = h.replace('onClick="{{ dl }}"', `onClick="{{ dl }}" data-plus="invoice" data-inv="${b.id}"`);
  if (b.status !== "paid") h = h.replace(/>Pembayaran berhasil</, b.status === "open" ? ">Menunggu pembayaran<" : ">Pembayaran tidak berhasil<");
  return h;
}

// ======================================================================= bukti bayar (app-31 email, app-32 WhatsApp)
export function bindReceipt(html: string, b: BillInfo, me: { name: string; email: string }): string {
  let h = html;
  const first = me.name.split(/\s+/)[0] || "kamu";
  const paid = b.paid_at ?? b.issued_at;
  h = h.replace(/Hai Nadia,/g, `Hai ${esc(first)},`);
  h = swap(h, "INV/OP/2026/10/000482", b.number);
  h = swap(h, "Invoice-INV-OP-2026-10-000482.pdf", `Invoice-${b.order_id || b.number.replace(/\//g, "-")}.pdf`);
  h = swap(h, "Invoice-000482.pdf", `Invoice-${b.number.split("/").pop()}.pdf`);
  h = swap(h, "Plus Essential · bulanan", `Plus ${b.plan_name} · ${periodLabel(b.billing_period)}`);
  h = swap(h, "📦 Plus Essential · bulanan", `📦 Plus ${b.plan_name} · ${periodLabel(b.billing_period)}`);
  h = swap(h, "Akses Plus Essential kamu sudah aktif", `Akses Plus ${b.plan_name} kamu sudah aktif`);
  if (b.period_end) {
    h = swap(h, "30 Okt – 30 Nov 2026", `${day(paid)} – ${day(b.period_end)}`);
    h = swap(h, "📅 Aktif 30 Okt – 30 Nov 2026", `📅 Aktif ${day(paid)} – ${day(b.period_end)}`);
    h = h.replace(/Langganan diperpanjang otomatis 30 Nov 2026 \(Rp65\.490\)\. Kelola atau batalkan di Akun › Langganan\./, `Langganan berlaku hingga ${esc(day(b.period_end))}. Perpanjang kapan saja dari halaman Plus; kami ingatkan sebelum masa aktif berakhir.`);
  }
  h = swap(h, "BCA Virtual Account", METHOD_NAME[b.method] ?? b.method.toUpperCase());
  h = swap(h, "💳 BCA Virtual Account", `💳 ${METHOD_NAME[b.method] ?? b.method.toUpperCase()}`);
  h = swap(h, "PPN 11%", `PPN ${Math.round(b.tax_rate * 100)}%`);
  h = swap(h, "Rp1.089", rp(b.tax_amount));
  h = swap(h, "Rp10.989", rp(b.total));
  h = swap(h, "· 04:16", `· ${time(paid)}`).split(">04:16<").join(`>${esc(time(paid))}<`);
  h = h.replace(/email nadia\.putri@email\.com/, `email ${esc(me.email)}`);
  h = h.split('href="/plus/berhasil"').join(`href="/plus/berhasil?inv=${b.id}"`);
  return h;
}
