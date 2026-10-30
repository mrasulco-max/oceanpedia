"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }) });
    setBusy(false);
    if (!res.ok) {
      const p = (await res.json().catch(() => ({}))) as { detail?: string };
      setError(p.detail ?? "Gagal masuk. Coba lagi.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      {error && <p className="form-error" role="alert">{error}</p>}
      <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
      <label className="field">Kata sandi<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
      <button type="submit" className="btn grad" style={{ height: 52 }} disabled={busy}>{busy ? "Memproses…" : "Masuk"}</button>
    </form>
  );
}
