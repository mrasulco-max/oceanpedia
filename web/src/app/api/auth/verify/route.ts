import { forward, pass, withSession } from "@/lib/auth-session";

/** BFF verifikasi OTP: kode benar → akun aktif & langsung masuk. Verifikasi 2 langkah staf bisa menandai perangkat tepercaya (30 hari). */
export async function POST(req: Request) {
  const { res, data } = await forward(req, "/v1/auth/verify");
  if (!res.ok) return pass(res, data);
  const out = withSession(data);
  // Masuk dengan kode cadangan: teruskan sisa kode agar pengguna diingatkan membuat kode baru.
  const left = res.headers.get("x-recovery-codes-left");
  if (left && /^\d+$/.test(left)) out.headers.set("x-recovery-codes-left", left);
  const device = data.device_token;
  if (typeof device === "string" && device) {
    out.cookies.set("ob_td", device, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth", maxAge: 60 * 60 * 24 * 30 });
  }
  return out;
}
