// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = {"u": {"u1": [true, false, false], "u2": [false], "u3": [true], "u4": [true], "u5": [true], "u6": [true], "u7": [true], "u8": [false]}, "o": {"quiet": [2], "lang": [0], "tz": [0], "num": [0], "tfa": [0]}, "sheet": null, "toast": "", "toastOn": false}; }
  componentWillUnmount() { clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  hook(k, i, on) {
  }

  renderVals() {
    const S = this.state, v = {};
    const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const U = {"u1": {"n": 3, "single": true, "a": [["ob-anim", ""], ["flex: 1; min-height: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 12px; border: 0; background: linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%); color: #FFFFFF; font-size: 13px; font-weight: 500", "flex: 1; min-height: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 12px; border: 0; background: transparent; color: #0B0B0F; font-size: 13px; font-weight: 500"]], "t": null, "say": null}, "u2": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Kurangi animasi aktif", "Kurangi animasi nonaktif"]}, "u3": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Putar video otomatis aktif", "Putar video otomatis nonaktif"]}, "u4": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Breaking news aktif", "Breaking news nonaktif"]}, "u5": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Price alert aktif", "Price alert nonaktif"]}, "u6": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Topik yang diikuti aktif", "Topik yang diikuti nonaktif"]}, "u7": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Ringkasan pagi aktif", "Ringkasan pagi nonaktif"]}, "u8": {"n": 1, "single": false, "a": [["flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end", "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start"]], "t": null, "say": ["Balasan komentar aktif", "Balasan komentar nonaktif"]}};
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
    for (const k of ["quiet", "lang", "tz", "num", "pwd", "tfa", "dev", "cache"]) {
      v['sh_' + k] = sh === k ? 'transform: translateY(0)' : 'transform: translateY(105%); pointer-events: none';
      v['open_' + k] = (e) => { stop(e); this.setState({ sheet: k }); };
    }
    const O = {"quiet": {"items": ["Nonaktif", "21:00 – 06:00", "22:00 – 06:00", "23:00 – 07:00"], "msg": "Jam tenang: %s", "multi": false}, "lang": {"items": ["Bahasa Indonesia", "English"], "msg": "Bahasa: %s", "multi": false}, "tz": {"items": ["WIB (UTC+7)", "WITA (UTC+8)", "WIT (UTC+9)"], "msg": "Zona waktu: %s", "multi": false}, "num": {"items": ["1.234,56 · Rp", "1,234.56 · Rp", "1 234,56 · Rp"], "msg": "Format angka: %s", "multi": false}, "tfa": {"items": ["Aktif lewat SMS", "Aktif lewat aplikasi autentikator", "Nonaktif"], "msg": "Verifikasi 2 langkah: %s", "multi": false}};
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
    v.f9 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Kata sandi berhasil diubah"); };
    v.f10 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Cache dihapus · 48 MB dikosongkan"); };
    return v;
  }
}

export default Component;
