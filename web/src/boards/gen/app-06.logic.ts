// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
// @ts-nocheck
/* eslint-disable */
import { DCLogic } from "@/dc/runtime";

class Component extends DCLogic {
  constructor(props) { super(props); this.state = {"u": {"u1": [false]}, "o": {"font": [1]}, "sheet": null, "toast": "", "toastOn": false, "bj": 0, "showBack": false, "prog": 0, "react": null, "cs": 0}; this.lastY = 0; }
  componentWillUnmount() { clearTimeout(this._tt); }
  say(t) { clearTimeout(this._tt); this.setState({ toast: t, toastOn: true }); this._tt = setTimeout(() => this.setState({ toastOn: false }), 2200); }
  hook(k, i, on) {
  }
  onScroll(e) {
    const el = e.currentTarget, y = el.scrollTop, max = Math.max(1, el.scrollHeight - el.clientHeight);
    const prog = Math.min(100, Math.max(0, Math.round((y / max) * 100)));
    const dy = y - this.lastY; let showBack = this.state.showBack;
    if (Math.abs(dy) >= 4) { this.lastY = y; showBack = dy > 0 && y > 120; }
    if (prog !== this.state.prog || showBack !== this.state.showBack) this.setState({ prog: prog, showBack: showBack });
  }

  renderVals() {
    const S = this.state, v = {};
    const stop = (e) => { if (e && e.preventDefault) { e.preventDefault(); e.stopPropagation(); } };
    const U = {"u1": {"n": 1, "single": false, "a": [["width: 40px; height: 40px; border-radius: 999px; ; ; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; background: #E5EFFF; color: #2F74EB; border-color: #BFD6FB", "width: 40px; height: 40px; border-radius: 999px; background: rgba(255,255,255,.22); color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700"]], "t": null, "say": ["Disimpan ke Tersimpan", "Dihapus dari Tersimpan"]}};
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
    for (const k of ["font", "share", "like", "comment"]) {
      v['sh_' + k] = sh === k ? 'transform: translateY(0)' : 'transform: translateY(105%); pointer-events: none';
      v['open_' + k] = (e) => { stop(e); this.setState({ sheet: k }); };
    }
    const O = {"font": {"items": ["Kecil", "Sedang", "Besar", "Sangat besar"], "msg": "Ukuran teks: %s", "multi": false}};
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
    { const N = 4, i = S.bj; v.bj = { pv: i === 0 ? 'opacity: .35; pointer-events: none' : 'opacity: 1', nx: i === N - 1 ? 'opacity: .35; pointer-events: none' : 'opacity: 1' };
      for (let k = 0; k < N; k++) v.bj['d' + k] = k === i ? 'width: 22px; background: #2F74EB' : 'width: 6px; background: #D6DEEA';
      const go = (e, d) => { stop(e); const t = e.currentTarget.closest('section').querySelector('.bj-track'); const j = Math.max(0, Math.min(N - 1, i + d)); t.scrollTo({ left: j * t.clientWidth, behavior: 'smooth' }); this.setState({ bj: j }); };
      v.bjPrev = (e) => go(e, -1); v.bjNext = (e) => go(e, 1);
      v.bjScroll = (e) => { const el = e.currentTarget, j = Math.round(el.scrollLeft / el.clientWidth); if (j !== this.state.bj) this.setState({ bj: j }); }; }
    v.toast = S.toast;
    v.toastSt = S.toastOn ? 'opacity: 1; transform: translate(-50%, 0)' : 'opacity: 0; transform: translate(-50%, 12px); pointer-events: none';
    v.f2 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Membuka WhatsApp…"); };
    v.f3 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Membuka Telegram…"); };
    v.f4 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Membuka X…"); };
    v.f5 = (e) => { stop(e); this.setState({ sheet: null }); this.say("Tautan disalin"); };
    v.f6 = (e) => { stop(e); this.setState({ sheet: null }); this.say('Komentar terkirim'); };
    v.onScroll = (e) => this.onScroll(e);
    v.backStyle = S.showBack ? 'max-width: 130px; opacity: 1; padding: 0 16px 0 12px; margin-right: 0' : 'max-width: 0; opacity: 0; padding: 0; margin-right: -10px; pointer-events: none';
    v.prog = S.prog; v.progTxt = S.prog + '%'; v.progOff = (119.4 * (1 - S.prog / 100)).toFixed(1);
    { const base = [28, 6, 9, 2], rc = S.react; v.rx = {}; base.forEach((n, k) => { v.rx['r' + k] = { count: n + (rc === k ? 1 : 0), pr: rc === k ? 'true' : 'false', st: rc === k ? 'border: 2px solid #2F74EB' : 'border: 1px solid #E3EAF4', pick: (e) => { stop(e); this.setState({ react: rc === k ? null : k }); } }; }); v.totalReact = base.reduce((a, b) => a + b, 0) + (rc === null ? 0 : 1); }
    v.cs = {}; [0, 1].forEach((i) => { const on = S.cs === i; v.cs['i' + i] = { pr: on ? 'true' : 'false', st: on ? 'border: 0; background: #2F74EB; color: #FFFFFF; font-weight: 700' : 'border: 1px solid #E3EAF4; background: #FFFFFF; color: #0B0B0F; font-weight: 500', pick: (e) => { stop(e); this.setState({ cs: i }); } }; });
    return v;
  }
}

export default Component;
