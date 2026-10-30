import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

/**
 * BFF panel redaksi: meneruskan permintaan ke API Go /v1/admin/* dengan token dari cookie httpOnly,
 * sehingga token tidak pernah terlihat oleh JavaScript di browser.
 * Setelah perubahan berhasil, cache data publik dibersihkan agar berita baru langsung tampil.
 */
async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!path.every((p) => /^[\w-]+$/.test(p))) return NextResponse.json({ title: "Path tidak valid" }, { status: 400 });
  const token = (await cookies()).get("ob_at")?.value;
  if (!token) {
    return NextResponse.json({ type: "about:blank", title: "Perlu masuk", status: 401, detail: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
  }
  const url = `${BASE}/v1/admin/${path.join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) headers["X-Forwarded-For"] = fwd;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    cache: "no-store",
  });
  if (hasBody && res.ok) revalidateTag("api");
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT };
