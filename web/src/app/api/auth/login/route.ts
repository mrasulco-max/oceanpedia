import { forward, pass, withSession } from "@/lib/auth-session";

/** BFF masuk: akun terverifikasi langsung mendapat sesi; akun baru yang belum konfirmasi OTP mendapat 403. */
export async function POST(req: Request) {
  const { res, data } = await forward(req, "/v1/auth/login");
  return res.ok ? withSession(data) : pass(res, data);
}
