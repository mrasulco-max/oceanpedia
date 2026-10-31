import { forward, pass } from "@/lib/auth-session";

/** BFF daftar: akun dibuat lalu kode OTP dikirim ke email (belum ada sesi sebelum OTP dikonfirmasi). */
export async function POST(req: Request) {
  const { res, data } = await forward(req, "/v1/auth/register");
  return pass(res, data);
}
