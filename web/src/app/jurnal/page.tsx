import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api, safe } from "@/lib/api";
import { currentUser } from "@/lib/session";
import JournalApp, { type Asset } from "./JournalApp";

export const metadata: Metadata = { title: "Jurnal Trading", robots: { index: false } };
export const dynamic = "force-dynamic";

const MARKET: Record<string, string> = { equity: "saham", crypto: "crypto", forex: "forex", commodity: "komoditas", index: "indeks" };

/** Jurnal Trading: tersedia untuk semua jenis akun yang sudah masuk (Gratis, Plus, staf). */
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect(`/masuk?next=${encodeURIComponent("/jurnal")}`);
  const ins = await safe(api.instruments(), { data: [] });
  const list = ins.data ?? [];
  const quotes = list.length ? await safe(api.quotes(list.map((i) => i.symbol)), { data: [] }) : { data: [] };
  const price = new Map((quotes.data ?? []).filter((q) => q.quote).map((q) => [q.instrument.symbol, q.quote!.price]));
  const assets: Asset[] = list.map((i) => ({ symbol: i.symbol, name: i.name, market: MARKET[i.asset_class] ?? "lainnya", currency: i.currency, price: price.get(i.symbol) ?? null }));
  return <JournalApp firstName={(user.full_name || "").split(/\s+/)[0] || "kamu"} assets={assets} />;
}
