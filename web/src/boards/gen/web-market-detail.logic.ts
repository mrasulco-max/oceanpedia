// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = { tf: 6, dt: 0, rg: 6, bt: 0, rp: 0, wl: 0, star: true, sym: false, toast: '', toastOn: false }; }
  componentWillUnmount() { clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  renderVals() {
    const S = this.state, v = {};
    const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const grp = (key, n, on, off, cb) => { const o = {}; for (let i = 0; i < n; i++) { const a = S[key] === i; o['i' + i] = { on: a, pr: a ? 'true' : 'false', st: a ? on : off, pick: (e) => { stop(e); this.setState({ [key]: i }); if (cb) cb(i); } }; } return o; };
    const TF = ['1m', '5m', '15m', '30m', '1J', '4J', '1D', '1W', '1M'];
    v.tf = grp('tf', 9, 'background: #0B0B0F; color: #FFFFFF; font-weight: 700', 'background: transparent; color: #5F6B7D; font-weight: 500');
    v.tfLbl = TF[S.tf];
    v.dt = grp('dt', 14, 'background: #E8F0FE; color: #2F74EB', 'background: transparent; color: #0B0B0F');
    v.rg = grp('rg', 9, 'background: #E8F0FE; color: #2F74EB; font-weight: 700', 'background: transparent; color: #5F6B7D; font-weight: 500');
    v.bt = grp('bt', 5, 'color: #0B0B0F; font-weight: 700; box-shadow: inset 0 -2px 0 #2F74EB', 'color: #5F6B7D; font-weight: 500; box-shadow: inset 0 -2px 0 transparent');
    v.rp = grp('rp', 4, 'background: #E8F0FE; color: #2F74EB', 'background: transparent; color: #5F6B7D');
    v.wl = grp('wl', 11, 'background: #E8F0FE', 'background: transparent');
    v.star = (e) => { stop(e); const nx = !S.star; this.setState({ star: nx }); this.say(nx ? 'BBCA disimpan ke watchlist' : 'BBCA dihapus dari watchlist'); };
    v.starPr = S.star ? 'true' : 'false'; v.starSt = S.star ? 'color: #F59E0B' : 'color: #5F6B7D';
    v.openSym = (e) => { stop(e); this.setState({ sym: true }); };
    v.closeSym = (e) => { stop(e); this.setState({ sym: false }); };
    v.symSt = S.sym ? 'opacity: 1' : 'opacity: 0; pointer-events: none';
    v.mkAlert = (e) => { stop(e); this.say('Alert dibuat: BBCA naik ke 10.400'); };
    v.snap = (e) => { stop(e); this.say('Gambar grafik disalin'); };
    v.share = (e) => { stop(e); this.say('Tautan grafik BBCA disalin'); };
    v.toast = S.toast; v.toastSt = S.toastOn ? 'opacity: 1; transform: translate(-50%, 0)' : 'opacity: 0; transform: translate(-50%, 12px); pointer-events: none';
    return v;
  }
}

export default Component;
