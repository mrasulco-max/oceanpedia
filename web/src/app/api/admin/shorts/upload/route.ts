import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

/** Jenis & ukuran berkas yang boleh diunggah langsung dari panel redaksi ke Vercel Blob. */
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_VIDEO = 200 * 1024 * 1024; // 200 MB

const problem = (status: number, title: string, detail: string) =>
  NextResponse.json({ type: "about:blank", title, status, detail }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Unggah video Ocean Short (klien → Vercel Blob langsung, tanpa melewati batas 4,5 MB fungsi server).
 * Rute ini hanya menerbitkan token unggah sekali pakai untuk staf redaksi yang boleh mengelola Short;
 * BLOB_READ_WRITE_TOKEN tetap di server dan tidak pernah dikirim ke peramban.
 */
export async function POST(req: NextRequest) {
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return problem(400, "Permintaan tidak valid", "Body JSON tidak terbaca.");
  }
  if (body?.type === "blob.generate-client-token") {
    const token = (await cookies()).get("ob_at")?.value;
    if (!token) return problem(401, "Perlu masuk", "Sesi berakhir. Silakan masuk lagi.");
    // Izin sama dengan daftar Short di panel redaksi (staf yang boleh mengelola Ocean Short).
    const who = await fetch(`${BASE}/v1/admin/shorts?limit=1`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" }).catch(() => null);
    if (!who) return problem(502, "API tidak terjangkau", "Coba lagi sebentar lagi.");
    if (who.status === 401) return problem(401, "Perlu masuk", "Sesi berakhir. Silakan masuk lagi.");
    if (!who.ok) return problem(403, "Tidak diizinkan", "Akun ini tidak boleh mengunggah video Short.");
  } else if (body?.type !== "blob.upload-completed") {
    return problem(400, "Permintaan tidak valid", "Jenis permintaan unggah tidak dikenal.");
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return problem(503, "Penyimpanan video belum aktif", "BLOB_READ_WRITE_TOKEN belum diatur di server.");
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^shorts\/[\w.-]+$/.test(pathname)) throw new Error("Nama berkas tidak valid.");
        return { allowedContentTypes: VIDEO_TYPES, maximumSizeInBytes: MAX_VIDEO, addRandomSuffix: true };
      },
      // URL video disimpan oleh formulir Short; tidak ada yang perlu dicatat di sini.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return problem(400, "Unggah ditolak", err instanceof Error ? err.message : "Gagal menyiapkan unggahan.");
  }
}
