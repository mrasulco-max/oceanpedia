import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import PrivacyApp from "./PrivacyApp";

export const metadata: Metadata = { title: "Privasi & data", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Privasi & data (UU PDP): unduh semua data pribadi dan hapus akun secara mandiri. */
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect(`/masuk?next=${encodeURIComponent("/akun/data")}`);
  return <PrivacyApp email={user.email} staff={!!user.role && user.role !== "reader"} />;
}
