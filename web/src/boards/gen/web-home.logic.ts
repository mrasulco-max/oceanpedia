// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = { ht: 0, ft: 0, ov: 0, tr: 0 }; }
  renderVals() {
    const S = this.state, v = {};
    const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const tabs = (key, n, on, off) => { const o = {}; for (let i = 0; i < n; i++) { const a = S[key] === i; o['i' + i] = { on: a, pr: a ? 'true' : 'false', st: a ? on : off, pick: (e) => { stop(e); this.setState({ [key]: i }); } }; } return o; };
    v.ht = tabs('ht', 2, 'color: #2F74EB; font-weight: 700; box-shadow: inset 0 -2px 0 #2F74EB', 'color: #5F6B7D; font-weight: 500; box-shadow: inset 0 -2px 0 transparent');
    v.ft = tabs('ft', 5, 'background: #2F74EB; color: #FFFFFF; font-weight: 700', 'background: transparent; color: #5F6B7D; font-weight: 500');
    v.ov = tabs('ov', 3, 'background: #FFFFFF; color: #0B0B0F; font-weight: 700', 'background: transparent; color: #C9D5EA; font-weight: 500');
    const N = 3, i = S.tr;
    v.tr = { pv: i === 0 ? 'opacity: .35; pointer-events: none' : 'opacity: 1', nx: i >= N ? 'opacity: .35; pointer-events: none' : 'opacity: 1' };
    const go = (e, d) => { stop(e); const t = e.currentTarget.closest('div').parentElement.parentElement.querySelector('.tr-track'); const j = Math.max(0, Math.min(N, i + d)); t.scrollTo({ left: j * 200, behavior: 'smooth' }); this.setState({ tr: j }); };
    v.trPrev = (e) => go(e, -1); v.trNext = (e) => go(e, 1);
    v.trScroll = (e) => { const el = e.currentTarget; const j = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 ? N : Math.round(el.scrollLeft / 200); if (j !== this.state.tr) this.setState({ tr: j }); };
    return v;
  }
}

export default Component;
