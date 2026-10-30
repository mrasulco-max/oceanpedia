// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = {"u": {"u1": [true, false, false], "u2": [true, false, false], "u3": [true, false, false]}, "o": {}, "sheet": null, "toast": "", "toastOn": false, "cnp": 0}; }
  componentWillUnmount() { clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  hook(k, i, on) {
  }

  renderVals() {
    const S = this.state, v = {};
    const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const U = {"u1": {"n": 3, "single": true, "a": [["position: relative; overflow: hidden; min-height: 44px; border-radius: 14px; border: 1.5px solid #4285F4; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: #0B0B0F", "position: relative; overflow: hidden; min-height: 44px; border-radius: 14px; border: 1px solid #E3EAF4; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: #0B0B0F"], ["position: relative; display: flex; color: #2F74EB", "position: relative; display: flex; color: #5F6B7D"]], "t": null, "say": null}, "u2": {"n": 3, "single": true, "a": [["position: relative; overflow: hidden; min-height: 44px; border-radius: 14px; border: 1.5px solid #4285F4; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: #0B0B0F", "position: relative; overflow: hidden; min-height: 44px; border-radius: 14px; border: 1px solid #E3EAF4; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: #0B0B0F"], ["position: relative; display: flex; color: #2F74EB", "position: relative; display: flex; color: #5F6B7D"]], "t": null, "say": null}, "u3": {"n": 3, "single": true, "a": [["position: relative; overflow: hidden; min-height: 44px; border-radius: 14px; border: 1.5px solid #4285F4; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: #0B0B0F", "position: relative; overflow: hidden; min-height: 44px; border-radius: 14px; border: 1px solid #E3EAF4; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: #0B0B0F"], ["position: relative; display: flex; color: #2F74EB", "position: relative; display: flex; color: #5F6B7D"]], "t": null, "say": null}};
    for (const k in U) {
      const u = U[k], st = S.u[k], o = {};
      for (let i = 0; i < u.n; i++) {
        const on = !!st[i], m = { on: on, off: !on, pr: on ? 'true' : 'false' };
        m.pick = (e) => {
          stop(e);
          const nx = u.single ? st.map((_, j) => j === i) : st.map((b, j) => (j === i ? !b : b));
          this.setState({ u: Object.assign({}, this.state.u, { [k]: nx }) });
          this.hook(k, i, nx[i]);
          if (u.say) { const msg = u.say[nx[i] ? 0 : 1]; if (msg) this.say(msg); }
        };
        u.a.forEach((p, j) => { m['a' + j] = on ? p[0] : p[1]; });
        if (u.t) m.t = on ? u.t[0] : u.t[1];
        o['m' + i] = m;
      }
      v[k] = o;
    }
    const sh = S.sheet;
    v.backdrop = sh ? 'opacity: 1' : 'opacity: 0; pointer-events: none';
    v.close = (e) => { stop(e); this.setState({ sheet: null }); };
    for (const k of []) {
      v['sh_' + k] = sh === k ? 'transform: translateY(0)' : 'transform: translateY(105%); pointer-events: none';
      v['open_' + k] = (e) => { stop(e); this.setState({ sheet: k }); };
    }
    const O = {};
    for (const k in O) {
      const o = O[k], cur = S.o[k], ov = { val: o.items[cur[0]] };
      o.items.forEach((it, i) => {
        const on = cur.indexOf(i) >= 0;
        ov['i' + i] = {
          pr: on ? 'true' : 'false',
          mark: on ? 'background: #2F74EB; border: 0' : 'background: #FFFFFF; border: 1.5px solid #C9D3E1; color: transparent',
          pick: (e) => {
            stop(e);
            if (o.multi) { const nx = on ? cur.filter((x) => x !== i) : cur.concat([i]); this.setState({ o: Object.assign({}, this.state.o, { [k]: nx }) }); }
            else { this.setState({ o: Object.assign({}, this.state.o, { [k]: [i] }), sheet: null }); this.say(o.msg.replace('%s', it)); }
          }
        };
      });
      ov.done = (e) => { stop(e); this.setState({ sheet: null }); this.say(o.msg.replace('%s', String(cur.length))); };
      v['op_' + k] = ov;
    }
    { const N = 6, i = S.cnp; v.cnp = { pv: i === 0 ? 'opacity: .35; pointer-events: none' : 'opacity: 1', nx: i === N - 1 ? 'opacity: .35; pointer-events: none' : 'opacity: 1' };
      for (let k = 0; k < N; k++) v.cnp['d' + k] = k === i ? 'width: 18px; background: #2F74EB' : 'width: 6px; background: #C9D3E1';
      const go = (e, d) => { stop(e); const t = e.currentTarget.closest('section').querySelector('.cnp-track'); const j = Math.max(0, Math.min(N - 1, i + d)); t.scrollTo({ left: j * 318, behavior: 'smooth' }); this.setState({ cnp: j }); };
      v.cnpPrev = (e) => go(e, -1); v.cnpNext = (e) => go(e, 1);
      v.cnpScroll = (e) => { const el = e.currentTarget; const j = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 ? N - 1 : Math.round(el.scrollLeft / 318); if (j !== this.state.cnp) this.setState({ cnp: j }); }; }
    v.toast = S.toast;
    v.toastSt = S.toastOn ? 'opacity: 1; transform: translate(-50%, 0)' : 'opacity: 0; transform: translate(-50%, 12px); pointer-events: none';
    v.t4 = (e) => { stop(e); this.say("Membuka situs pengiklan…"); };
    return v;
  }
}

export default Component;
