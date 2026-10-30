// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = { period: 0, method: 1, promo: true, notif: [true, true] }; }
  renderVals() {
    const S = this.state, v = {}; const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const rp = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');
    const names = ["QRIS", "BCA Virtual Account", "Mandiri Virtual Account", "BRI Virtual Account", "GoPay", "OVO", "DANA", "Kartu kredit / debit"];
    const base = S.period === 0 ? 59000 : 590000;
    const disc = S.promo && S.period === 0 ? 49100 : 0;
    const sub = base - disc, tax = Math.round(sub * 0.11), total = sub + tax;
    v.planLbl = S.period === 0 ? 'Essential · bulanan' : 'Essential · tahunan';
    v.base = rp(base); v.disc = '−' + rp(disc); v.subtotal = rp(sub); v.tax = rp(tax); v.total = rp(total);
    v.promoOn = disc > 0;
    v.promoTxt = S.promo ? (S.period === 0 ? 'Diterapkan · bulan pertama Rp9.900' : 'Hanya untuk paket bulanan') : 'Bulan pertama Rp9.900';
    v.promoBtn = S.promo ? 'Hapus' : 'Pakai';
    v.togglePromo = (e) => { stop(e); this.setState({ promo: !S.promo }); };
    v.renewTxt = S.period === 0 ? 'Diperpanjang otomatis 30 Nov 2026 sebesar Rp65.490 (termasuk PPN). Batalkan kapan saja.' : 'Diperpanjang otomatis 30 Okt 2027 sebesar Rp654.900 (termasuk PPN). Batalkan kapan saja.';
    v.methodName = names[S.method];
    v.p = {}; [0, 1].forEach((i) => { const on = S.period === i; v.p['i' + i] = { pr: on ? 'true' : 'false', st: on ? 'border: 2px solid #2F74EB; background: #F3F8FF' : 'border: 1px solid #E3EAF4', pick: (e) => { stop(e); this.setState({ period: i }); } }; });
    v.m = {}; names.forEach((n, i) => { const on = S.method === i; v.m['i' + i] = { pr: on ? 'true' : 'false', st: on ? 'border: 2px solid #2F74EB; background: #F3F8FF' : 'border: 1px solid #E3EAF4', dot: on ? 'border: 7px solid #2F74EB' : 'border: 2px solid #C4CDDA', pick: (e) => { stop(e); this.setState({ method: i }); } }; });
    v.n = {}; [0, 1].forEach((i) => { const on = S.notif[i]; v.n['i' + i] = { pr: on ? 'true' : 'false', box: on ? 'background: #2F74EB; border: 0' : 'background: #FFFFFF; border: 1.5px solid #C9D3E1; color: transparent', pick: (e) => { stop(e); const nx = S.notif.slice(); nx[i] = !nx[i]; this.setState({ notif: nx }); } }; });
    return v;
  }
}

export default Component;
