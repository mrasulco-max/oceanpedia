// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = {"u": {"u1": [false, false, false, false, false, false, true, false, false], "u2": [true, false, false, false, false], "u3": [false, true, false]}, "o": {"ctype": [0], "ind": [0, 4]}, "sheet": null, "toast": "", "toastOn": false}; }
  componentWillUnmount() { clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  hook(k, i, on) {
  }

  renderVals() {
    const S = this.state, v = {};
    const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const U = {"u1": {"n": 9, "single": true, "a": [["flex: none; min-width: 36px; height: 32px; padding: 0 9px; border-radius: 10px; border: 0; background: #0B0B0F; color: #FFFFFF; font-size: 12px; font-weight: 700", "flex: none; min-width: 36px; height: 32px; padding: 0 9px; border-radius: 10px; border: 0; background: transparent; color: #5F6B7D; font-size: 12px; font-weight: 500"]], "t": null, "say": null}, "u2": {"n": 5, "single": true, "a": [["flex: none; padding-bottom: 10px; font-size: 14px; font-weight: 700; color: #0B0B0F; border-bottom: 3px solid #4285F4", "flex: none; padding-bottom: 10px; font-size: 14px; font-weight: 500; color: #5F6B7D; border-bottom: 3px solid transparent"]], "t": null, "say": null}, "u3": {"n": 3, "single": true, "a": [["flex: 1; min-height: 36px; border-radius: 999px; border: 0; background: #FFFFFF; outline: 1px solid #E3EAF4; color: #0B0B0F; font-size: 13px; font-weight: 500", "flex: 1; min-height: 36px; border-radius: 999px; border: 0; background: transparent; color: #5F6B7D; font-size: 13px; font-weight: 500"]], "t": null, "say": null}};
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
    for (const k of ["share", "ctype", "ind"]) {
      v['sh_' + k] = sh === k ? 'transform: translateY(0)' : 'transform: translateY(105%); pointer-events: none';
      v['open_' + k] = (e) => { stop(e); this.setState({ sheet: k }); };
    }
    const O = {"ctype": {"items": ["Candlestick", "Garis", "Area", "Heikin Ashi"], "msg": "Grafik: %s", "multi": false}, "ind": {"items": ["Moving Average (MA 20)", "RSI (14)", "MACD", "Bollinger Bands", "Volume"], "msg": "%s indikator diterapkan", "multi": true}};
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
    v.f4 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Membuka WhatsApp…"); };
    v.f5 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Membuka Telegram…"); };
    v.f6 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Membuka X…"); };
    v.f7 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Tautan disalin"); };
    v.t8 = (e) => { stop(e); this.say("Putar ponsel untuk grafik layar penuh"); };
    return v;
  }
}

export default Component;
