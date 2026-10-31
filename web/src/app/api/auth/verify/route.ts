import { forward, pass, withSession } from "@/lib/auth-session";

/** BFF verifikasi OTP: kode benar → akun aktif & langsung masuk. */
export async function POST(req: Request) {
  const { res, data } = await forward(req, "/v1/auth/verify");
  return res.ok ? withSession(data) : pass(res, data);
}
