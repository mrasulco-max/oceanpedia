"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export const field: CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 48, borderRadius: 14, border: "1px solid #E3EAF4", background: "#F6F8FC", padding: "12px 14px", fontSize: 15, fontFamily: "inherit", color: "#0B0B0F", outline: "none" };
export const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500, color: "#374151" };
export const btn = (bg: string, fg = "#FFFFFF", border = bg): CSSProperties => ({ flex: 1, minHeight: 50, border: `1px solid ${border}`, borderRadius: 14, background: bg, color: fg, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" });

export interface Problem {
  title?: string;
  detail?: string;
  errors?: Record<string, string>;
}

/** Panggil API redaksi lewat BFF (/api/admin/*) — token tetap di cookie httpOnly. */
export async function adminCall<T>(method: string, path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; problem: Problem }> {
  try {
    const r = await fetch(`/api/admin/${path}`, {
      method,
      headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await r.json().catch(() => ({}))) as T & Problem;
    return r.ok ? { ok: true, data } : { ok: false, status: r.status, problem: data };
  } catch {
    return { ok: false, status: 0, problem: { detail: "Koneksi bermasalah. Coba lagi." } };
  }
}

export const problemText = (p: Problem) => (p.errors && Object.values(p.errors)[0]) || p.detail || p.title || "Gagal menyimpan. Coba lagi.";

export function Shell({ title, back = "/", children, dark = false }: { title: string; back?: string; children: ReactNode; dark?: boolean }) {
  return (
    <main style={{ minHeight: "100dvh", background: dark ? "#0B0B0F" : "#F6F8FC", fontFamily: "Roboto, Arial, sans-serif", color: dark ? "#FFFFFF" : "#0B0B0F" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 12, padding: "max(10px, env(safe-area-inset-top)) 16px 10px", background: dark ? "#0B0B0F" : "#FFFFFF", borderBottom: `1px solid ${dark ? "#22252E" : "#E3EAF4"}` }}>
        <Link href={back} aria-label="Kembali" style={{ width: 40, height: 40, flex: "none", borderRadius: 999, border: `1px solid ${dark ? "#2C303A" : "#E3EAF4"}`, display: "flex", alignItems: "center", justifyContent: "center", color: "inherit", textDecoration: "none", fontSize: 20 }}>
          ‹
        </Link>
        <strong style={{ fontSize: 18 }}>{title}</strong>
      </header>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px calc(40px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </main>
  );
}

export function Notice({ msg }: { msg: { t: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <div role="status" style={{ padding: "12px 14px", borderRadius: 14, background: msg.ok ? "#E7F6EC" : "#FEF4F4", color: msg.ok ? "#166534" : "#991B1B", fontSize: 14 }}>
      {msg.t}
    </div>
  );
}

/** Pilih ticker market terkait dari daftar instrumen (chip + saran). */
export function SymbolPicker({ instruments, value, onChange, max }: { instruments: { symbol: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; max: number }) {
  const list = "ob-tulis-symbols";
  const add = (raw: string) => {
    const s = raw.trim().toUpperCase();
    if (!s || value.includes(s) || value.length >= max) return false;
    if (!instruments.some((i) => i.symbol === s)) return false;
    onChange([...value, s]);
    return true;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {value.map((s) => (
            <button key={s} type="button" onClick={() => onChange(value.filter((x) => x !== s))} aria-label={`Hapus ${s}`} style={{ border: 0, borderRadius: 999, padding: "6px 12px", background: "#E5ECFF", color: "#1E40AF", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              #{s} ×
            </button>
          ))}
        </div>
      ) : null}
      {value.length < max ? (
        <input
          list={list}
          placeholder="Ketik ticker, mis. BTCUSD, AAPL, XAUUSD"
          autoCapitalize="characters"
          style={field}
          onChange={(e) => {
            if (add(e.currentTarget.value)) e.currentTarget.value = "";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (add(e.currentTarget.value)) e.currentTarget.value = "";
            }
          }}
        />
      ) : null}
      <datalist id={list}>
        {instruments.map((i) => (
          <option key={i.symbol} value={i.symbol}>
            {i.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}
