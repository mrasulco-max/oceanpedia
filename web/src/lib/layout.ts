import "server-only";
import { headers } from "next/headers";
import { LAYOUT_HEADER } from "./device";
import type { Layout } from "./types";

/** getLayout dibaca server component untuk memilih UI website atau UI app. */
export async function getLayout(): Promise<Layout> {
  const h = await headers();
  return h.get(LAYOUT_HEADER) === "app" ? "app" : "web";
}
