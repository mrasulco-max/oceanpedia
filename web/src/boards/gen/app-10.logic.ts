// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = {"u": {"u1": [false, false, true, false, false, false, false], "u2": [true, false, false, false], "u3": [false], "u4": [false], "u5": [false], "u6": [true], "u7": [true], "u8": [true], "u9": [true]}, "o": {"impact": [0]}, "sheet": null, "toast": "", "toastOn": false}; }
  componentWillUnmount() { clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  hook(k, i, on) {
  }

  renderVals() {
    const S = this.state, v = {};
    const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const U = {"u1": {"n": 7, "single": true, "a": [["ob-anim", ""], ["flex: none; width: 46px; min-height: 64px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-radius: 16px; border: 0; background: linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%); color: #FFFFFF", "flex: none; width: 46px; min-height: 64px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-radius: 16px; border: 1px solid #E3EAF4; background: #FFFFFF; color: #0B0B0F"]], "t": null, "say": null}, "u2": {"n": 4, "single": true, "a": [["flex: none; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1.5px solid #4285F4; background: #EEF5FF; color: #2F74EB; font-size: 13px; font-weight: 500", "flex: none; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid #E3EAF4; background: #FFFFFF; color: #0B0B0F; font-size: 13px; font-weight: 500"]], "t": null, "say": null}, "u3": {"n": 1, "single": false, "a": [["flex: none; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1.5px solid #4285F4; background: #EEF5FF; color: #2F74EB; font-size: 13px; font-weight: 500", "flex: none; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid #E3EAF4; background: #FFFFFF; color: #0B0B0F; font-size: 13px; font-weight: 500"]], "t": null, "say": ["Hanya dampak tinggi", "Semua tingkat dampak"]}, "u4": {"n": 1, "single": false, "a": [["flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #E5EFFF; color: #2F74EB; display: flex; align-items: center; justify-content: center", "flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #F6F8FC; color: #9AA6B8; display: flex; align-items: center; justify-content: center"]], "t": null, "say": ["Pengingat aktif · 15 menit sebelum rilis", "Pengingat dimatikan"]}, "u5": {"n": 1, "single": false, "a": [["flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #E5EFFF; color: #2F74EB; display: flex; align-items: center; justify-content: center", "flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #F6F8FC; color: #9AA6B8; display: flex; align-items: center; justify-content: center"]], "t": null, "say": ["Pengingat aktif · 15 menit sebelum rilis", "Pengingat dimatikan"]}, "u6": {"n": 1, "single": false, "a": [["flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #E5EFFF; color: #2F74EB; display: flex; align-items: center; justify-content: center", "flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #F6F8FC; color: #9AA6B8; display: flex; align-items: center; justify-content: center"]], "t": null, "say": ["Pengingat aktif · 15 menit sebelum rilis", "Pengingat dimatikan"]}, "u7": {"n": 1, "single": false, "a": [["flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #E5EFFF; color: #2F74EB; display: flex; align-items: center; justify-content: center", "flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #F6F8FC; color: #9AA6B8; display: flex; align-items: center; justify-content: center"]], "t": null, "say": ["Pengingat aktif · 15 menit sebelum rilis", "Pengingat dimatikan"]}, "u8": {"n": 1, "single": false, "a": [["flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #E5EFFF; color: #2F74EB; display: flex; align-items: center; justify-content: center", "flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #F6F8FC; color: #9AA6B8; display: flex; align-items: center; justify-content: center"]], "t": null, "say": ["Pengingat aktif · 15 menit sebelum rilis", "Pengingat dimatikan"]}, "u9": {"n": 1, "single": false, "a": [["flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #E5EFFF; color: #2F74EB; display: flex; align-items: center; justify-content: center", "flex: none; width: 34px; height: 34px; border-radius: 999px; border: 0; background: #F6F8FC; color: #9AA6B8; display: flex; align-items: center; justify-content: center"]], "t": null, "say": ["Pengingat aktif · 15 menit sebelum rilis", "Pengingat dimatikan"]}};
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
    for (const k of ["impact"]) {
      v['sh_' + k] = sh === k ? 'transform: translateY(0)' : 'transform: translateY(105%); pointer-events: none';
      v['open_' + k] = (e) => { stop(e); this.setState({ sheet: k }); };
    }
    const O = {"impact": {"items": ["Semua dampak", "Dampak tinggi", "Dampak sedang", "Dampak rendah"], "msg": "Filter: %s", "multi": false}};
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
    return v;
  }
}

export default Component;
