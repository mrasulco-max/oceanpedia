import { forward, pass, withSession } from "@/lib/auth-session";

/** BFF atur ulang kata sandi dengan kode OTP; berhasil → langsung masuk. */
export async function POST(req: Request) {
  const { res, data } = await forward(req, "/v1/auth/password/reset");
  return res.ok ? withSession(data) : pass(res, data);
}
