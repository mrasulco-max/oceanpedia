"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

/**
 * Jurnal Trading (semua jenis akun): catat posisi, tutup posisi, P/L otomatis (termasuk biaya),
 * kelipatan risiko R dari stop loss, win rate, profit factor, kurva ekuitas, filter, dan ekspor CSV.
 * Data tersimpan di database lewat BFF /api/me/journal (token di cookie httpOnly).
 */

export type Asset = { symbol: string; name: string; market: string; currency: string; price: number | null };
type Entry = {
  id: string;
  symbol: string;
  market: string;
  side: "long" | "short";
  currency: string;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  contract_size: number;
  fees: number;
  stop_loss: number | null;
  take_profit: number | null;
  opened_at: string;
  closed_at: string | null;
  strategy: string;
  emotion: string;
  notes: string;
  tags: string[];
  rating: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  r_multiple: number | null;
  hold_hours: number | null;
};
type CurStat = { currency: string; closed: number; net: number; gross_win: number; gross_loss: number; profit_factor: number | null; best: number; worst: number };
type Stats = { total: number; open: number; closed: number; wins: number; losses: number; win_rate: number | null; avg_r: number | null; avg_hold_hours: number | null; currencies: CurStat[]; top_symbols: string[] };
type Form = {
  id?: string;
  symbol: string;
  market: string;
  side: "long" | "short";
  currency: string;
  entry_price: string;
  quantity: string;
  contract_size: string;
  fees: string;
  stop_loss: string;
  take_profit: string;
  opened_at: string;
  closed: boolean;
  exit_price: string;
  closed_at: string;
  strategy: string;
  emotion: string;
  notes: string;
  tags: string;
  rating: number;
};

const BLUE = "linear-gradient(110deg,#2563EB 0%,#4285F4 35%,#63A4FA 55%,#4285F4 75%,#2563EB 100%)";
const MARKETS: [string, string][] = [["saham", "Saham"], ["crypto", "Crypto"], ["forex", "Forex"], ["komoditas", "Komoditas"], ["indeks", "Indeks"], ["lainnya", "Lainnya"]];
const STRATEGIES = ["Breakout", "Pullback", "Reversal", "Swing", "Scalping", "Trend following", "News trading", "Buy the dip"];
const EMOTIONS = ["Tenang", "Percaya diri", "Ragu", "Takut", "Serakah", "FOMO", "Balas dendam", "Lelah"];
const CURRENCIES = ["IDR", "USD", "USDT", "EUR", "SGD"];

/** Angka gaya Indonesia: "9.000,5" / "0,25" / "9000.5" / "0.25". */
function parseNum(s: string): number | null {
  let t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const fmt = (n: number, max = 8) => {
  const a = Math.abs(n);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : max;
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: d }).format(n);
};
const money = (n: number, cur: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))} ${cur}`;
const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dateText = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
/** Satuan per 1 lot (sama dengan API): forex 100.000, emas 100 oz, perak 5.000 oz, lainnya 1. */
const defaultCS = (market: string, symbol: string) => (symbol.startsWith("XAU") ? 100 : symbol.startsWith("XAG") ? 5000 : market === "forex" ? 100000 : 1);
/** Nilai dalam mata uang kuotasi → mata uang P/L (mis. USDJPY dicatat dalam USD: dibagi harga). */
const conv = (symbol: string, currency: string, v: number, price: number) => {
  const s = symbol.replace("/", "");
  return s.length === 6 && price > 0 && currency === s.slice(0, 3) && currency !== s.slice(3) ? v / price : v;
};
/** P/L sebuah posisi pada harga tertentu (selisih × lot × ukuran kontrak − biaya). */
const pnlAt = (e: { symbol: string; currency: string; side: string; entry_price: number; quantity: number; contract_size: number; fees: number }, price: number) =>
  conv(e.symbol, e.currency, (e.side === "short" ? e.entry_price - price : price - e.entry_price) * e.quantity * (e.contract_size || 1), price) - e.fees;
const qtyLabel = (market: string, symbol: string) => (market === "forex" || symbol.startsWith("XAU") || symbol.startsWith("XAG") ? "Lot" : market === "saham" ? "Lembar saham" : "Jumlah (unit)");
const holdText = (h: number) => (h < 1 ? `${Math.round(h * 60)} mnt` : h < 48 ? `${fmt(h, 1)} jam` : `${fmt(h / 24, 1)} hari`);

const emptyForm = (): Form => ({ symbol: "", market: "saham", side: "long", currency: "IDR", entry_price: "", quantity: "", contract_size: "1", fees: "", stop_loss: "", take_profit: "", opened_at: toLocalInput(new Date()), closed: false, exit_price: "", closed_at: toLocalInput(new Date()), strategy: "", emotion: "", notes: "", tags: "", rating: 0 });
const numStr = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

const card: CSSProperties = { background: "#FFFFFF", border: "1px solid #E3EAF4", borderRadius: 20, padding: 16 };
const input: CSSProperties = { width: "100%", minHeight: 46, boxSizing: "border-box", padding: "0 14px", borderRadius: 14, border: "1px solid #E3EAF4", background: "#F6F8FC", fontSize: 15, color: "#0B0B0F", fontFamily: "inherit" };
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500, color: "#374151" };
const pill = (on: boolean): CSSProperties => ({ border: `1px solid ${on ? "#2F74EB" : "#E3EAF4"}`, background: on ? "#EEF5FF" : "#FFFFFF", color: on ? "#1E40AF" : "#374151", borderRadius: 999, padding: "8px 14px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" });

type Res = { ok: boolean; status: number; data: Record<string, unknown> & { detail?: string; title?: string; errors?: Record<string, string> } };
async function call(method: string, url: string, body?: unknown): Promise<Res> {
  try {
    const r = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    const data = r.status === 204 ? {} : ((await r.json().catch(() => ({}))) as Res["data"]);
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: "Koneksi bermasalah. Coba lagi." } };
  }
}

/** Kurva ekuitas: P/L kumulatif posisi yang ditutup (per mata uang). */
function Equity({ items, currency }: { items: Entry[]; currency: string }) {
  const pts = items
    .filter((e) => e.pnl !== null && e.closed_at && e.currency === currency)
    .sort((a, b) => +new Date(a.closed_at!) - +new Date(b.closed_at!));
  if (pts.length < 2) return <p style={{ margin: 0, fontSize: 13, color: "#5F6B7D" }}>Kurva ekuitas tampil setelah minimal 2 posisi {currency} ditutup.</p>;
  let acc = 0;
  const ys = [0, ...pts.map((e) => (acc += e.pnl!))];
  const W = 640, H = 160, P = 10;
  const hi = Math.max(...ys), lo = Math.min(...ys), span = hi - lo || 1;
  const x = (i: number) => P + (i / (ys.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + ((hi - v) / span) * (H - 2 * P);
  const d = ys.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const up = ys[ys.length - 1]! >= 0;
  const col = up ? "#16A34A" : "#DC2626";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Kurva ekuitas ${currency}`} style={{ width: "100%", height: "auto" }}>
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="#CBD5E1" strokeDasharray="4 4" />
      <path d={`${d} L${x(ys.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill={col} opacity={0.08} />
      <path d={d} fill="none" stroke={col} strokeWidth={2.2} strokeLinejoin="round" />
    </svg>
  );
}

export default function JournalApp({ firstName, assets }: { firstName: string; assets: Asset[] }) {
  const [items, setItems] = useState<Entry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"all" | "open" | "closed">("all");
  const [q, setQ] = useState("");
  const [mkt, setMkt] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<{ e: Entry; price: string; at: string } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [cur, setCur] = useState("");
  const bySym = useMemo(() => new Map(assets.map((a) => [a.symbol, a])), [assets]);

  const flash = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(""), 3200);
  };
  const load = useCallback(async () => {
    const r = await call("GET", "/api/me/journal");
    setLoading(false);
    if (r.status === 401) return location.assign("/masuk?next=%2Fjurnal");
    if (!r.ok) return setErr(r.data.detail || r.data.title || "Jurnal gagal dimuat.");
    setErr("");
    setItems((r.data.data as Entry[]) ?? []);
    setStats((r.data.stats as Stats) ?? null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (stats?.currencies.length && !stats.currencies.some((c) => c.currency === cur)) setCur(stats.currencies[0]!.currency);
  }, [stats, cur]);

  const shown = items.filter(
    (e) =>
      (tab === "all" || (tab === "open" ? e.exit_price === null : e.exit_price !== null)) &&
      (!mkt || e.market === mkt) &&
      (!q || e.symbol.includes(q.toUpperCase()) || e.strategy.toLowerCase().includes(q.toLowerCase()) || e.tags.some((t) => t.toLowerCase().includes(q.toLowerCase()))),
  );

  const unreal = (e: Entry): number | null => {
    const p = bySym.get(e.symbol)?.price;
    if (e.exit_price !== null || !p) return null;
    return pnlAt(e, p);
  };

  const edit = (e: Entry) => {
    setErrors({});
    setForm({
      id: e.id,
      symbol: e.symbol,
      market: e.market,
      side: e.side,
      currency: e.currency,
      entry_price: numStr(e.entry_price),
      quantity: numStr(e.quantity),
      contract_size: numStr(e.contract_size || 1),
      fees: e.fees ? numStr(e.fees) : "",
      stop_loss: numStr(e.stop_loss),
      take_profit: numStr(e.take_profit),
      opened_at: toLocalInput(e.opened_at),
      closed: e.exit_price !== null,
      exit_price: numStr(e.exit_price),
      closed_at: toLocalInput(e.closed_at ?? new Date()),
      strategy: e.strategy,
      emotion: e.emotion,
      notes: e.notes,
      tags: e.tags.join(", "),
      rating: e.rating ?? 0,
    });
  };

  const payload = (f: Form) => ({
    symbol: f.symbol.trim().toUpperCase(),
    market: f.market,
    side: f.side,
    currency: f.currency,
    entry_price: parseNum(f.entry_price) ?? 0,
    quantity: parseNum(f.quantity) ?? 0,
    contract_size: parseNum(f.contract_size) || defaultCS(f.market, f.symbol.trim().toUpperCase()),
    fees: parseNum(f.fees) ?? 0,
    stop_loss: parseNum(f.stop_loss),
    take_profit: parseNum(f.take_profit),
    opened_at: new Date(f.opened_at).toISOString(),
    exit_price: f.closed ? parseNum(f.exit_price) : null,
    closed_at: f.closed ? new Date(f.closed_at).toISOString() : "",
    strategy: f.strategy,
    emotion: f.emotion,
    notes: f.notes,
    tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
    rating: f.rating || null,
  });

  const save = async () => {
    if (!form || busy) return;
    const local: Record<string, string> = {};
    if (!form.symbol.trim()) local.symbol = "Isi kode aset.";
    if (!(parseNum(form.entry_price) ?? 0)) local.entry_price = "Isi harga masuk.";
    if (!(parseNum(form.quantity) ?? 0)) local.quantity = "Isi jumlah (lot/unit).";
    if (form.closed && !(parseNum(form.exit_price) ?? 0)) local.exit_price = "Isi harga keluar.";
    if (Object.keys(local).length) return setErrors(local);
    setBusy(true);
    const r = await call(form.id ? "PUT" : "POST", form.id ? `/api/me/journal/${form.id}` : "/api/me/journal", payload(form));
    setBusy(false);
    if (r.status === 401) return location.assign("/masuk?next=%2Fjurnal");
    if (!r.ok) {
      setErrors(r.data.errors ?? {});
      return flash(r.data.errors ? "Periksa kembali isian yang ditandai." : r.data.detail || r.data.title || "Gagal menyimpan.");
    }
    setForm(null);
    flash(form.id ? "Catatan diperbarui." : "Transaksi dicatat ke jurnal.");
    void load();
  };

  const closePos = async () => {
    if (!closing || busy) return;
    const price = parseNum(closing.price);
    if (!price) return flash("Isi harga keluar.");
    const e = closing.e;
    setBusy(true);
    // Hanya kolom yang diterima API (API menolak kolom tak dikenal).
    const r = await call("PUT", `/api/me/journal/${e.id}`, {
      symbol: e.symbol,
      market: e.market,
      side: e.side,
      currency: e.currency,
      entry_price: e.entry_price,
      quantity: e.quantity,
      contract_size: e.contract_size || 1,
      fees: e.fees,
      stop_loss: e.stop_loss,
      take_profit: e.take_profit,
      opened_at: e.opened_at,
      exit_price: price,
      closed_at: new Date(closing.at).toISOString(),
      strategy: e.strategy,
      emotion: e.emotion,
      notes: e.notes,
      tags: e.tags,
      rating: e.rating,
    });
    setBusy(false);
    if (!r.ok) return flash(Object.values(r.data.errors ?? {})[0] || r.data.detail || "Gagal menutup posisi.");
    setClosing(null);
    const pnl = (r.data as unknown as Entry).pnl;
    flash(pnl !== null && pnl !== undefined ? `Posisi ditutup: ${money(pnl, e.currency)}` : "Posisi ditutup.");
    void load();
  };

  const remove = async (e: Entry) => {
    if (armed !== e.id) {
      setArmed(e.id);
      window.setTimeout(() => setArmed((a) => (a === e.id ? null : a)), 4000);
      return;
    }
    const r = await call("DELETE", `/api/me/journal/${e.id}`);
    if (!r.ok && r.status !== 404) return flash(r.data.detail || "Gagal menghapus.");
    setArmed(null);
    flash("Catatan dihapus.");
    void load();
  };

  const exportCsv = () => {
    const head = ["Tanggal masuk", "Tanggal keluar", "Aset", "Pasar", "Posisi", "Mata uang", "Harga masuk", "Harga keluar", "Jumlah", "Biaya", "Stop loss", "Take profit", "P/L", "P/L %", "R", "Strategi", "Emosi", "Rating", "Tag", "Catatan"];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = items.map((e) => [e.opened_at, e.closed_at ?? "", e.symbol, e.market, e.side, e.currency, e.entry_price, e.exit_price ?? "", e.quantity, e.fees, e.stop_loss ?? "", e.take_profit ?? "", e.pnl ?? "", e.pnl_pct ?? "", e.r_multiple ?? "", e.strategy, e.emotion, e.rating ?? "", e.tags.join(" "), e.notes]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `jurnal-trading-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pickSymbol = (v: string) => {
    if (!form) return;
    const s = v.toUpperCase();
    const a = bySym.get(s);
    const market = a?.market ?? form.market;
    // Pasangan USDxxx dicatat dalam USD (P/L dikonversi otomatis).
    const currency = a ? (a.market === "forex" && s.startsWith("USD") ? "USD" : a.currency) : form.currency;
    setForm({ ...form, symbol: s, market, currency, contract_size: numStr(defaultCS(market, s)), ...(a && !form.entry_price && a.price ? { entry_price: numStr(a.price) } : {}) });
  };

  const cs = stats?.currencies.find((c) => c.currency === cur);
  const f = form;
  const fe = (k: string) => (errors[k] ? <span style={{ color: "#B42318", fontSize: 12, fontWeight: 400 }}>{errors[k]}</span> : null);

  return (
    <main style={{ minHeight: "100dvh", background: "#F6F8FC", fontFamily: "Roboto, Arial, sans-serif", color: "#0B0B0F" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 12, padding: "max(10px, env(safe-area-inset-top)) 16px 10px", background: "#FFFFFF", borderBottom: "1px solid #E3EAF4" }}>
        <Link href="/akun" aria-label="Kembali ke profil" style={{ width: 40, height: 40, flex: "none", borderRadius: 999, border: "1px solid #E3EAF4", display: "flex", alignItems: "center", justifyContent: "center", color: "#0B0B0F", textDecoration: "none", fontSize: 18 }}>
          ‹
        </Link>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <strong style={{ fontSize: 18 }}>Jurnal Trading</strong>
          <span style={{ fontSize: 12, color: "#5F6B7D" }}>Catatan pribadi · hanya kamu yang bisa melihat</span>
        </span>
        <button type="button" onClick={exportCsv} disabled={!items.length} style={{ ...pill(false), display: items.length ? undefined : "none" }}>
          Ekspor CSV
        </button>
      </header>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "16px 16px 120px", display: "flex", flexDirection: "column", gap: 16 }}>
        <section style={{ ...card, background: BLUE, color: "#fff", border: 0, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <span style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 4 }}>
            <strong style={{ fontSize: 20 }}>Halo, {firstName}.</strong>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "#E6EEFF" }}>Catat setiap transaksi, evaluasi strategi & emosi, dan lihat win rate serta P/L kamu berkembang.</span>
          </span>
          <button type="button" onClick={() => { setErrors({}); setForm(emptyForm()); }} style={{ border: 0, background: "#FFFFFF", color: "#1E40AF", borderRadius: 999, padding: "12px 18px", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            + Catat transaksi
          </button>
        </section>

        {err ? <div style={{ ...card, background: "#FEF4F4", borderColor: "#F5C2C2", color: "#991B1B" }}>{err} <button type="button" onClick={() => void load()} style={pill(false)}>Coba lagi</button></div> : null}

        {stats && stats.total > 0 ? (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              {[
                ["Total transaksi", String(stats.total), `${stats.open} terbuka · ${stats.closed} ditutup`],
                ["Win rate", stats.win_rate === null ? "–" : `${fmt(stats.win_rate, 1)}%`, `${stats.wins} profit · ${stats.losses} loss`],
                ["P/L bersih", cs ? money(cs.net, cs.currency) : "–", cs ? `${cs.closed} posisi ditutup` : "Belum ada posisi ditutup"],
                ["Profit factor", cs?.profit_factor ? fmt(cs.profit_factor, 2) : "–", "Total profit ÷ total loss"],
                ["Rata-rata R", stats.avg_r === null ? "–" : `${stats.avg_r > 0 ? "+" : ""}${fmt(stats.avg_r, 2)}R`, "Dari posisi ber-stop loss"],
                ["Rata-rata durasi", stats.avg_hold_hours === null ? "–" : holdText(stats.avg_hold_hours), stats.top_symbols.length ? `Sering: ${stats.top_symbols.slice(0, 3).join(", ")}` : ""],
              ].map(([k, v, s]) => (
                <div key={k} style={{ ...card, padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#5F6B7D" }}>{k}</span>
                  <strong style={{ fontSize: 20, fontFamily: "'Roboto Mono', monospace", color: k === "P/L bersih" && cs ? (cs.net >= 0 ? "#15803D" : "#B42318") : "#0B0B0F", wordBreak: "break-word" }}>{v}</strong>
                  <span style={{ fontSize: 12, color: "#9AA6B8" }}>{s}</span>
                </div>
              ))}
            </section>
            {stats.currencies.length ? (
              <section style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 16, flex: 1 }}>Kurva ekuitas</strong>
                  {stats.currencies.map((c) => (
                    <button key={c.currency} type="button" onClick={() => setCur(c.currency)} style={pill(c.currency === cur)}>
                      {c.currency}
                    </button>
                  ))}
                </div>
                <Equity items={items} currency={cur} />
                {cs ? (
                  <span style={{ fontSize: 12, color: "#5F6B7D" }}>
                    Terbaik {money(cs.best, cs.currency)} · Terburuk {money(cs.worst, cs.currency)}
                  </span>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        <section style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {([["all", "Semua"], ["open", "Terbuka"], ["closed", "Ditutup"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={pill(tab === k)}>
              {l}
            </button>
          ))}
          <select value={mkt} onChange={(e) => setMkt(e.target.value)} aria-label="Saring pasar" style={{ ...input, width: "auto", minHeight: 38, borderRadius: 999 }}>
            <option value="">Semua pasar</option>
            {MARKETS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari aset, strategi, tag…" aria-label="Cari catatan" style={{ ...input, flex: "1 1 180px", width: "auto", minHeight: 38, borderRadius: 999 }} />
        </section>

        {loading ? <p style={{ color: "#5F6B7D" }}>Memuat jurnal…</p> : null}
        {!loading && !err && !items.length ? (
          <section style={{ ...card, textAlign: "center", padding: 28, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 34 }}>📒</span>
            <strong style={{ fontSize: 18 }}>Jurnal kamu masih kosong</strong>
            <span style={{ fontSize: 14, color: "#5F6B7D", maxWidth: 420, lineHeight: 1.5 }}>Mulai catat transaksi pertamamu: aset, harga masuk, jumlah, stop loss, dan alasan masuk. P/L dan statistik dihitung otomatis.</span>
            <button type="button" onClick={() => { setErrors({}); setForm(emptyForm()); }} style={{ border: 0, background: "#2F74EB", color: "#fff", borderRadius: 999, padding: "12px 18px", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              + Catat transaksi pertama
            </button>
          </section>
        ) : null}
        {!loading && items.length > 0 && !shown.length ? <p style={{ color: "#5F6B7D", margin: 0 }}>Tidak ada catatan yang cocok dengan filter.</p> : null}

        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map((e) => {
            const u = unreal(e);
            const p = e.pnl ?? u;
            const live = bySym.get(e.symbol)?.price;
            return (
              <article key={e.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 17 }}>{e.symbol}</strong>
                      <span style={{ fontSize: 12, fontWeight: 500, padding: "3px 8px", borderRadius: 999, background: e.side === "long" ? "#DCF5E4" : "#FDE2E2", color: e.side === "long" ? "#166534" : "#991B1B" }}>{e.side === "long" ? "Long / Beli" : "Short / Jual"}</span>
                      <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: "#F1F5F9", color: "#475569" }}>{MARKETS.find(([v]) => v === e.market)?.[1] ?? e.market}</span>
                      <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: e.exit_price === null ? "#FEF3C7" : "#EEF5FF", color: e.exit_price === null ? "#854D0E" : "#1E40AF" }}>{e.exit_price === null ? "Terbuka" : "Ditutup"}</span>
                    </span>
                    <span style={{ fontSize: 13, color: "#5F6B7D" }}>
                      {dateText(e.opened_at)}
                      {e.closed_at ? ` → ${dateText(e.closed_at)}` : ""}
                      {e.hold_hours !== null ? ` · ${holdText(e.hold_hours)}` : ""}
                    </span>
                  </span>
                  {p !== null ? (
                    <span style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 2 }}>
                      <strong style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 17, color: p >= 0 ? "#15803D" : "#B42318" }}>{money(p, e.currency)}</strong>
                      <span style={{ fontSize: 12, color: "#5F6B7D" }}>
                        {e.pnl === null ? "Belum terealisasi (harga terkini)" : `${e.pnl_pct !== null ? `${e.pnl_pct > 0 ? "+" : ""}${fmt(e.pnl_pct, 2)}%` : ""}${e.r_multiple !== null ? ` · ${e.r_multiple > 0 ? "+" : ""}${fmt(e.r_multiple, 2)}R` : ""}`}
                      </span>
                    </span>
                  ) : null}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, fontSize: 13 }}>
                  {[
                    ["Masuk", fmt(e.entry_price)],
                    ["Keluar", e.exit_price !== null ? fmt(e.exit_price) : live ? `${fmt(live)} (kini)` : "–"],
                    [qtyLabel(e.market, e.symbol), (e.contract_size || 1) !== 1 ? `${fmt(e.quantity)} × ${fmt(e.contract_size)}` : fmt(e.quantity)],
                    ["Stop loss", e.stop_loss !== null ? fmt(e.stop_loss) : "–"],
                    ["Take profit", e.take_profit !== null ? fmt(e.take_profit) : "–"],
                    ["Biaya", e.fees ? fmt(e.fees) : "–"],
                  ].map(([k, v]) => (
                    <span key={k} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", borderRadius: 12, background: "#F6F8FC" }}>
                      <span style={{ color: "#5F6B7D", fontSize: 11 }}>{k}</span>
                      <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{v}</span>
                    </span>
                  ))}
                </div>
                {e.strategy || e.emotion || e.rating || e.tags.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
                    {e.strategy ? <span style={{ padding: "3px 8px", borderRadius: 999, background: "#EEF5FF", color: "#1E40AF" }}>Strategi: {e.strategy}</span> : null}
                    {e.emotion ? <span style={{ padding: "3px 8px", borderRadius: 999, background: "#F5F3FF", color: "#5B21B6" }}>Emosi: {e.emotion}</span> : null}
                    {e.rating ? <span style={{ padding: "3px 8px", borderRadius: 999, background: "#FFF7E6", color: "#92400E" }}>{"★".repeat(e.rating)}{"☆".repeat(5 - e.rating)}</span> : null}
                    {e.tags.map((t) => (
                      <span key={t} style={{ padding: "3px 8px", borderRadius: 999, background: "#F1F5F9", color: "#475569" }}>#{t}</span>
                    ))}
                  </div>
                ) : null}
                {e.notes ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#374151", whiteSpace: "pre-wrap" }}>{e.notes}</p> : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {e.exit_price === null ? (
                    <button type="button" onClick={() => setClosing({ e, price: live ? numStr(live) : "", at: toLocalInput(new Date()) })} style={{ ...pill(true), fontWeight: 500 }}>
                      Tutup posisi
                    </button>
                  ) : null}
                  <button type="button" onClick={() => edit(e)} style={pill(false)}>
                    Ubah
                  </button>
                  <button type="button" onClick={() => void remove(e)} style={{ ...pill(false), color: "#B42318", borderColor: armed === e.id ? "#B42318" : "#E3EAF4" }}>
                    {armed === e.id ? "Yakin hapus?" : "Hapus"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {f ? (
        <div role="dialog" aria-modal="true" aria-label={f.id ? "Ubah catatan" : "Catat transaksi"} onClick={(ev) => ev.target === ev.currentTarget && setForm(null)} style={{ position: "fixed", inset: 0, zIndex: 20, background: "rgba(11,11,15,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              void save();
            }}
            style={{ width: "100%", maxWidth: 640, maxHeight: "92dvh", overflowY: "auto", background: "#FFFFFF", borderRadius: "24px 24px 0 0", padding: "18px 18px max(18px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 14, boxSizing: "border-box" }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <strong style={{ flex: 1, fontSize: 18 }}>{f.id ? "Ubah catatan" : "Catat transaksi"}</strong>
              <button type="button" aria-label="Tutup" onClick={() => setForm(null)} style={{ border: 0, background: "#F6F8FC", width: 36, height: 36, borderRadius: 999, cursor: "pointer", fontSize: 18 }}>
                ×
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              <label style={label}>
                Aset {fe("symbol")}
                <input list="jurnal-aset" value={f.symbol} onChange={(ev) => pickSymbol(ev.target.value)} placeholder="BBCA, BTCUSD, XAUUSD…" autoCapitalize="characters" maxLength={20} style={input} />
              </label>
              <label style={label}>
                Pasar
                <select value={f.market} onChange={(ev) => setForm({ ...f, market: ev.target.value, contract_size: numStr(defaultCS(ev.target.value, f.symbol.trim().toUpperCase())) })} style={input}>
                  {MARKETS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label style={label}>
                Mata uang {fe("currency")}
                <select value={f.currency} onChange={(ev) => setForm({ ...f, currency: ev.target.value })} style={input}>
                  {[...new Set([...CURRENCIES, f.currency])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <datalist id="jurnal-aset">
              {assets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.name}
                </option>
              ))}
            </datalist>
            <div style={{ display: "flex", gap: 8 }}>
              {(["long", "short"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setForm({ ...f, side: s })} style={{ ...pill(f.side === s), flex: 1, padding: "12px 14px", fontWeight: 500, ...(f.side === s ? { background: s === "long" ? "#DCF5E4" : "#FDE2E2", borderColor: s === "long" ? "#16A34A" : "#DC2626", color: s === "long" ? "#166534" : "#991B1B" } : {}) }}>
                  {s === "long" ? "Long / Beli" : "Short / Jual"}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              {(
                [
                  ["entry_price", "Harga masuk"],
                  ["quantity", qtyLabel(f.market, f.symbol.trim().toUpperCase())],
                  ["contract_size", "Ukuran kontrak per lot"],
                  ["stop_loss", "Stop loss (opsional)"],
                  ["take_profit", "Take profit (opsional)"],
                  ["fees", "Biaya / komisi"],
                ] as [keyof Form & ("entry_price" | "quantity" | "contract_size" | "stop_loss" | "take_profit" | "fees"), string][]
              ).map(([k, l]) => (
                <label key={k} style={label}>
                  {l} {fe(k)}
                  <input inputMode="decimal" value={f[k]} onChange={(ev) => setForm({ ...f, [k]: ev.target.value })} placeholder="0" style={input} />
                </label>
              ))}
              <label style={label}>
                Waktu masuk {fe("opened_at")}
                <input type="datetime-local" value={f.opened_at} onChange={(ev) => setForm({ ...f, opened_at: ev.target.value })} style={input} />
              </label>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, cursor: "pointer" }}>
              <input type="checkbox" checked={f.closed} onChange={(ev) => setForm({ ...f, closed: ev.target.checked })} style={{ width: 20, height: 20 }} />
              Posisi sudah ditutup
            </label>
            {f.closed ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                <label style={label}>
                  Harga keluar {fe("exit_price")}
                  <input inputMode="decimal" value={f.exit_price} onChange={(ev) => setForm({ ...f, exit_price: ev.target.value })} placeholder="0" style={input} />
                </label>
                <label style={label}>
                  Waktu keluar {fe("closed_at")}
                  <input type="datetime-local" value={f.closed_at} onChange={(ev) => setForm({ ...f, closed_at: ev.target.value })} style={input} />
                </label>
              </div>
            ) : null}
            {(() => {
              const sym = f.symbol.trim().toUpperCase();
              const base = { symbol: sym, currency: f.currency, side: f.side, entry_price: parseNum(f.entry_price) ?? 0, quantity: parseNum(f.quantity) ?? 0, contract_size: parseNum(f.contract_size) || defaultCS(f.market, sym), fees: parseNum(f.fees) ?? 0 };
              if (!base.entry_price || !base.quantity) return null;
              const tp = parseNum(f.take_profit), sl = parseNum(f.stop_loss), ex = f.closed ? parseNum(f.exit_price) : null;
              const rows: [string, number][] = [];
              if (ex) rows.push(["P/L di harga keluar", pnlAt(base, ex)]);
              if (tp) rows.push(["Potensi profit di take profit", pnlAt(base, tp)]);
              if (sl) rows.push(["Risiko di stop loss", pnlAt(base, sl)]);
              if (!rows.length) return null;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 12, borderRadius: 14, background: "#F6F8FC", fontSize: 14 }}>
                  {rows.map(([k, v]) => (
                    <span key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: "#5F6B7D" }}>{k}</span>
                      <strong style={{ fontFamily: "'Roboto Mono', monospace", color: v >= 0 ? "#15803D" : "#B42318" }}>{money(v, f.currency)}</strong>
                    </span>
                  ))}
                  {tp && sl && Math.abs(pnlAt(base, sl)) > 0 ? <span style={{ fontSize: 12, color: "#5F6B7D" }}>Rasio risk/reward 1 : {fmt(Math.abs(pnlAt(base, tp) / pnlAt(base, sl)), 2)}</span> : null}
                  <span style={{ fontSize: 11, color: "#9AA6B8" }}>Rumus: selisih harga × {qtyLabel(f.market, sym).toLowerCase()} × ukuran kontrak − biaya.</span>
                </div>
              );
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              <label style={label}>
                Strategi / setup
                <input list="jurnal-strategi" value={f.strategy} onChange={(ev) => setForm({ ...f, strategy: ev.target.value })} maxLength={80} placeholder="mis. Breakout" style={input} />
              </label>
              <label style={label}>
                Emosi saat masuk
                <select value={f.emotion} onChange={(ev) => setForm({ ...f, emotion: ev.target.value })} style={input}>
                  <option value="">—</option>
                  {[...new Set([...EMOTIONS, ...(f.emotion ? [f.emotion] : [])])].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label style={label}>
                Tag (pisahkan koma) {fe("tags")}
                <input value={f.tags} onChange={(ev) => setForm({ ...f, tags: ev.target.value })} placeholder="swing, dividen" style={input} />
              </label>
            </div>
            <datalist id="jurnal-strategi">
              {STRATEGIES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#374151", marginRight: 6 }}>Nilai eksekusi</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} bintang`} onClick={() => setForm({ ...f, rating: f.rating === n ? 0 : n })} style={{ border: 0, background: "transparent", fontSize: 24, cursor: "pointer", color: n <= f.rating ? "#F59E0B" : "#CBD5E1", padding: 2 }}>
                  ★
                </button>
              ))}
            </div>
            <label style={label}>
              Catatan & evaluasi
              <textarea value={f.notes} onChange={(ev) => setForm({ ...f, notes: ev.target.value })} maxLength={4000} rows={4} placeholder="Alasan masuk, apa yang berjalan baik, apa yang perlu diperbaiki…" style={{ ...input, padding: 12, minHeight: 96, resize: "vertical" }} />
            </label>
            <button type="submit" disabled={busy} style={{ minHeight: 52, border: 0, borderRadius: 16, background: BLUE, color: "#fff", fontSize: 16, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
              {busy ? "Menyimpan…" : f.id ? "Simpan perubahan" : "Simpan ke jurnal"}
            </button>
          </form>
        </div>
      ) : null}

      {closing ? (
        <div role="dialog" aria-modal="true" aria-label="Tutup posisi" onClick={(ev) => ev.target === ev.currentTarget && setClosing(null)} style={{ position: "fixed", inset: 0, zIndex: 20, background: "rgba(11,11,15,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 480, background: "#FFFFFF", borderRadius: "24px 24px 0 0", padding: "18px 18px max(18px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 14 }}>
            <strong style={{ fontSize: 18 }}>Tutup posisi {closing.e.symbol}</strong>
            <span style={{ fontSize: 13, color: "#5F6B7D" }}>
              {closing.e.side === "long" ? "Long" : "Short"} {fmt(closing.e.quantity)} {qtyLabel(closing.e.market, closing.e.symbol).toLowerCase()} @ {fmt(closing.e.entry_price)} {closing.e.currency}
            </span>
            <label style={label}>
              Harga keluar
              <input inputMode="decimal" value={closing.price} onChange={(ev) => setClosing({ ...closing, price: ev.target.value })} autoFocus style={input} />
            </label>
            <label style={label}>
              Waktu keluar
              <input type="datetime-local" value={closing.at} onChange={(ev) => setClosing({ ...closing, at: ev.target.value })} style={input} />
            </label>
            {(() => {
              const px = parseNum(closing.price);
              if (!px) return null;
              const e = closing.e;
              const pnl = pnlAt(e, px);
              return <span style={{ fontFamily: "'Roboto Mono', monospace", color: pnl >= 0 ? "#15803D" : "#B42318" }}>Perkiraan P/L: {money(pnl, e.currency)}</span>;
            })()}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setClosing(null)} style={{ ...pill(false), flex: 1, padding: "12px 14px" }}>
                Batal
              </button>
              <button type="button" onClick={() => void closePos()} disabled={busy} style={{ flex: 1, border: 0, borderRadius: 999, background: "#2F74EB", color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                {busy ? "Menyimpan…" : "Tutup posisi"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: "max(20px, env(safe-area-inset-bottom))", transform: "translateX(-50%)", zIndex: 30, background: "#0B0B0F", color: "#fff", borderRadius: 999, padding: "10px 16px", fontSize: 14, maxWidth: "90vw" }}>
          {toast}
        </div>
      ) : null}
    </main>
  );
}
