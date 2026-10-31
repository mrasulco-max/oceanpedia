import { forward, pass } from "@/lib/auth-session";

/** BFF kirim (ulang) kode OTP ke email: konfirmasi akun, masuk dengan kode, atau lupa kata sandi. */
export async function POST(req: Request) {
  const { res, data } = await forward(req, "/v1/auth/otp");
  return pass(res, data);
}
