import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { API_BASE, withSession } from "@/lib/auth-session";
import { sessionHash } from "@/lib/me";

/**
 * BFF akun pembaca: /api/me/* → API Go /v1/me/* dengan token dari cookie httpOnly.
 * Ganti kata sandi mengembalikan sesi baru → cookie diperbarui.
 */
async function proxy(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  if (!path.every((p) => /^[\w-]+$/.test(p))) return NextResponse.json({ title: "Path tidak valid" }, { status: 400 });
  const jar = await cookies();
  const token = jar.get("ob_at")?.value;
  if (!token) return NextResponse.json({ type: "about:blank", title: "Perlu masuk", status: 401, detail: "Sesi berakhir. Silakan masuk lagi." }, { status: 401 });
  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE";
  // Unggahan foto (multipart) diteruskan apa adanya; selain itu JSON.
  const ctype = req.headers.get("content-type") ?? "";
  const multipart = hasBody && ctype.startsWith("multipart/form-data");
  if (multipart && Number(req.headers.get("content-length") ?? 0) > 4_400_000)
    return NextResponse.json({ title: "Terlalu besar", status: 413, detail: "Ukuran foto maksimal 4 MB." }, { status: 413 });
  const res = await fetch(`${API_BASE}/v1/me${path.length ? `/${path.join("/")}` : ""}${req.nextUrl.search}`, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-Session-Hash": sessionHash(jar.get("ob_rt")?.value),
      "User-Agent": req.headers.get("user-agent") ?? "",
      "X-Forwarded-For": req.headers.get("x-forwarded-for") ?? "",
      ...(hasBody ? { "Content-Type": multipart ? ctype : "application/json" } : {}),
    },
    body: hasBody ? (multipart ? await req.arrayBuffer() : await req.text()) : undefined,
    cache: "no-store",
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && typeof data.access_token === "string") return withSession(data);
  return NextResponse.json(data, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
