import { cookies } from "next/headers";
import { forward, pass, withSession } from "@/lib/auth-session";

/**
 * BFF masuk: akun terverifikasi langsung mendapat sesi; akun baru yang belum konfirmasi OTP mendapat 403.
 * Staf dengan verifikasi 2 langkah mendapat 403 "two-factor-required" + challenge, kecuali perangkat ini
 * tepercaya (cookie httpOnly ob_td dari verifikasi sebelumnya).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const device = (await cookies()).get("ob_td")?.value;
  const fwd = new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "", "user-agent": req.headers.get("user-agent") ?? "" }, body: JSON.stringify({ email: body.email, password: body.password, ...(device ? { device } : {}) }) });
  const { res, data } = await forward(fwd, "/v1/auth/login");
  return res.ok ? withSession(data) : pass(res, data);
}
