// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = {"u": {"u1": [true, false, false], "u6": [false], "u7": [false]}, "o": {}, "sheet": null, "toast": "", "toastOn": false}; }
  componentWillUnmount() { clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  hook(k, i, on) {
  }

  renderVals() {
    const S = this.state, v = {};
    const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const U = {"u1": {"n": 3, "single": true, "a": [["ob-anim", ""], ["flex: 1; height: 42px; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 999px; border: 0; background: linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%); color: #FFFFFF; font-size: 14px; font-weight: 700", "flex: 1; height: 42px; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 999px; border: 1px solid #E3EAF4; background: #FFFFFF; color: #0B0B0F; font-size: 14px; font-weight: 500"], ["font-size: 11px; font-weight: 500; padding: 2px 7px; border-radius: 999px; background: rgba(255,255,255,.22); color: #FFFFFF", "font-size: 11px; font-weight: 500; padding: 2px 7px; border-radius: 999px; background: #F6F8FC; color: #5F6B7D"]], "t": null, "say": null}, "u6": {"n": 1, "single": false, "a": [["min-height: 48px; width: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 20px; border-radius: 999px; background: #FFFFFF; color: #2F74EB; font-size: 15px; font-weight: 500; border: 1.5px solid #BFD6FB", "min-height: 48px; width: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 20px; border-radius: 999px; background: linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%); color: #FFFFFF; font-size: 15px; font-weight: 500"]], "t": ["Mengikuti", "Ikuti"], "say": ["Kamu mengikuti", "Berhenti mengikuti"]}, "u7": {"n": 1, "single": false, "a": [["width: 48px; height: 48px; border-radius: 999px; border: 1.5px solid #E3EAF4; ; display: flex; align-items: center; justify-content: center; background: #E5EFFF; color: #2F74EB; border-color: #BFD6FB", "width: 48px; height: 48px; border-radius: 999px; border: 1.5px solid #E3EAF4; color: #0B0B0F; display: flex; align-items: center; justify-content: center"]], "t": null, "say": ["Notifikasi tulisan baru aktif", "Notifikasi dimatikan"]}};
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
    for (const k of ["share"]) {
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
    v.toast = S.toast;
    v.toastSt = S.toastOn ? 'opacity: 1; transform: translate(-50%, 0)' : 'opacity: 0; transform: translate(-50%, 12px); pointer-events: none';
    v.f2 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Membuka WhatsApp…"); };
    v.f3 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Membuka Telegram…"); };
    v.f4 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Membuka X…"); };
    v.f5 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Tautan disalin"); };
    return v;
  }
}

export default Component;
