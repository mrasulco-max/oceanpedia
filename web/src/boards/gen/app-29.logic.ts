// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = { left: 3599, open: 0, toast: '', toastOn: false }; }
  componentDidMount() { this._iv = setInterval(() => this.setState({ left: Math.max(0, this.state.left - 1) }), 1000); }
  componentWillUnmount() { clearInterval(this._iv); clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  renderVals() {
    const S = this.state, v = {}; const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const p = (n) => String(n).padStart(2, '0');
    v.hh = p(Math.floor(S.left / 3600)); v.mm = p(Math.floor(S.left % 3600 / 60)); v.ss = p(S.left % 60);
    v.copyVa = (e) => { stop(e); this.say('Nomor virtual account disalin'); };
    v.copyAmt = (e) => { stop(e); this.say('Total pembayaran disalin'); };
    v.a = {}; [0, 1, 2].forEach((i) => { const on = S.open === i; v.a['i' + i] = { open: on, ex: on ? 'true' : 'false', rot: on ? 'transform: rotate(180deg)' : 'transform: rotate(0deg)', pick: (e) => { stop(e); this.setState({ open: on ? -1 : i }); } }; });
    v.toast = S.toast; v.toastSt = S.toastOn ? 'opacity: 1; transform: translate(-50%, 0)' : 'opacity: 0; transform: translate(-50%, 12px); pointer-events: none';
    return v;
  }
}

export default Component;
