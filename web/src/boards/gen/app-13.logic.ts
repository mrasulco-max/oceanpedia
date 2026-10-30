// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = {"u": {"u1": [true, false, false, false], "u2": [true, false, false], "u3": [true, false, true], "u4": [true], "u5": [true], "u6": [false], "u7": [false, true, false, false]}, "o": {}, "sheet": null, "toast": "", "toastOn": false, "tp": 10400}; }
  componentWillUnmount() { clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  hook(k, i, on) {
    if (k === "u7") { this.setState({ tp: [10330, 10400, 10625, 10950][i] }); }
  }
  fmt(n) { return n.toLocaleString('id-ID'); }

  renderVals() {
    const S = this.state, v = {};
    const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const U = {"u1": {"n": 4, "single": true, "a": [["position: relative; min-height: 86px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border-radius: 18px; border: 2px solid #4285F4; background: #F2F7FF; color: #2F74EB; font-size: 12px; font-weight: 500", "position: relative; min-height: 86px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border-radius: 18px; border: 1px solid #E3EAF4; background: #FFFFFF; color: #0B0B0F; font-size: 12px; font-weight: 500"], ["width: 38px; height: 38px; border-radius: 12px; background: #DCEBFF; display: flex; align-items: center; justify-content: center", "width: 38px; height: 38px; border-radius: 12px; background: #F6F8FC; display: flex; align-items: center; justify-content: center"]], "t": null, "say": null}, "u2": {"n": 3, "single": true, "a": [["flex: 1; min-height: 38px; border-radius: 12px; border: 1.5px solid #4285F4; background: #F2F7FF; color: #2F74EB; font-size: 13px; font-weight: 500", "flex: 1; min-height: 38px; border-radius: 12px; border: 1px solid #E3EAF4; background: #FFFFFF; color: #0B0B0F; font-size: 13px; font-weight: 500"]], "t": null, "say": null}, "u3": {"n": 3, "single": false, "a": [["position: relative; flex: none; width: 140px; scroll-snap-align: start; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; border-radius: 18px; border: 2px solid #4285F4; background: #F2F7FF; text-align: left", "position: relative; flex: none; width: 140px; scroll-snap-align: start; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; border-radius: 18px; border: 1px solid #E3EAF4; background: #FFFFFF; text-align: left"], ["", ""], ["", ""]], "t": null, "say": null}, "u4": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Aktifkan alert BTC aktif", "Aktifkan alert BTC nonaktif"]}, "u5": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Aktifkan alert XAU aktif", "Aktifkan alert XAU nonaktif"]}, "u6": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Aktifkan alert TLKM aktif", "Aktifkan alert TLKM nonaktif"]}, "u7": {"n": 4, "single": true, "a": [["flex: 1; min-height: 38px; border-radius: 12px; border: 1.5px solid #4285F4; background: #F2F7FF; color: #2F74EB; font-size: 13px; font-weight: 500", "flex: 1; min-height: 38px; border-radius: 12px; border: 1px solid #E3EAF4; background: #FFFFFF; color: #0B0B0F; font-size: 13px; font-weight: 500"]], "t": null, "say": null}};
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
    for (const k of ["plus"]) {
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
    v.tpDown = (e) => { stop(e); this.setState({ tp: Math.max(25, this.state.tp - 25) }); };
    v.tpUp = (e) => { stop(e); this.setState({ tp: this.state.tp + 25 }); };
    v.t8 = (e) => { stop(e); this.say("Geser kartu alert ke kiri untuk menghapus"); };
    { const b = 10125, d = S.tp - b, p = (d / b * 100).toFixed(2).replace('.', ','); v.tp = this.fmt(S.tp); v.tpd = (d >= 0 ? '▲ +' : '▼ −') + p.replace('-', '') + '% · ' + (d >= 0 ? '+' : '−') + this.fmt(Math.abs(d)); v.tpc = d >= 0 ? '#16A34A' : '#DC2626'; }
    return v;
  }
}

export default Component;
