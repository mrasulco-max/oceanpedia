// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = { toast: '', toastOn: false }; }
  componentWillUnmount() { clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  renderVals() {
    const S = this.state, v = {}; const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    v.inv = (e) => { stop(e); this.say('Membuka invoice PDF'); };
    v.open = (e) => { stop(e); this.say('Membuka aplikasi Ocean Pedia'); };
    v.send = (e) => { stop(e); this.say('Pesan terkirim ke Ocean Pedia'); };
    v.toast = S.toast; v.toastSt = S.toastOn ? 'opacity: 1; transform: translate(-50%, 0)' : 'opacity: 0; transform: translate(-50%, 12px); pointer-events: none';
    return v;
  }
}

export default Component;
