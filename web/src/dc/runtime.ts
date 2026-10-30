/**
 * Runtime artboard desain.
 *
 * Setiap artboard terdiri dari template HTML berlubang ({{ path }}, <sc-if>, onClick="{{ fn }}")
 * dan kelas logika (state + renderVals). Runtime ini:
 *   1. menghitung nilai lewat renderVals(),
 *   2. mengisi template menjadi HTML,
 *   3. memperbarui DOM secara minimal (morph) agar transisi CSS, posisi scroll, dan fokus input tetap terjaga.
 * Event ditangani lewat delegasi di elemen host (lihat DCBoard).
 */

export type Vals = Record<string, unknown>;
export type Handler = (e: SyntheticEvt) => void;

export interface SyntheticEvt {
  target: EventTarget | null;
  currentTarget: Element;
  nativeEvent: Event;
  preventDefault(): void;
  stopPropagation(): void;
}

export class DCLogic<S extends Record<string, unknown> = Record<string, unknown>> {
  props: Record<string, unknown>;
  state: S = {} as S;
  /** Dipasang oleh DCBoard; dipanggil setiap state berubah. */
  __render: (() => void) | null = null;

  constructor(props?: Record<string, unknown>) {
    this.props = props ?? {};
  }

  setState(patch: Partial<S> | ((s: S) => Partial<S>)): void {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = Object.assign({}, this.state, p);
    this.__render?.();
  }

  forceUpdate(): void {
    this.__render?.();
  }

  renderVals(): Vals {
    return {};
  }
}

function get(v: Vals, path: string): unknown {
  const p = path.trim();
  if (p === "true") return true;
  if (p === "false") return false;
  return p.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), v);
}

const RE_IF = /<sc-if value="\{\{([^}]*)\}\}"[^>]*>([\s\S]*?)<\/sc-if>/g;
const RE_EVT = /\son([A-Z]\w*)="\{\{([^}]*)\}\}"/g;
const RE_HOLE = /\{\{([^}]*)\}\}/g;

/** Mengisi template dengan nilai dari renderVals. Handler event dikumpulkan ke `fns`. */
export function fill(tpl: string, v: Vals): { html: string; fns: Handler[] } {
  const fns: Handler[] = [];
  let h = tpl.replace(RE_IF, (_m, p: string, body: string) => (get(v, p) ? body : ""));
  h = h.replace(RE_EVT, (_m, ev: string, p: string) => {
    const f = get(v, p);
    if (typeof f !== "function") return "";
    fns.push(f as Handler);
    return ` data-ev-${ev.toLowerCase()}="${fns.length - 1}"`;
  });
  h = h.replace(RE_HOLE, (_m, p: string) => {
    const x = get(v, p);
    return x === undefined || x === null || typeof x === "function" ? "" : String(x);
  });
  return { html: h, fns };
}

// ---------------------------------------------------------------------------
// Morph DOM: memperbarui `from` agar sama dengan `to` tanpa membuat ulang node yang tidak berubah.
// ---------------------------------------------------------------------------

function syncAttrs(from: Element, to: Element): void {
  const toAttrs = to.attributes;
  for (let i = 0; i < toAttrs.length; i++) {
    const a = toAttrs[i]!;
    if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  }
  const fromAttrs = from.attributes;
  for (let i = fromAttrs.length - 1; i >= 0; i--) {
    const a = fromAttrs[i]!;
    if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
  }
  if (from instanceof HTMLInputElement || from instanceof HTMLTextAreaElement) {
    const want = to.getAttribute("value") ?? (to instanceof HTMLTextAreaElement ? to.value : "");
    if (to.hasAttribute("value") && from.value !== want && document.activeElement !== from) from.value = want;
    if (from instanceof HTMLInputElement && to instanceof HTMLInputElement) from.checked = to.hasAttribute("checked");
  }
}

function sameKind(a: Node, b: Node): boolean {
  return a.nodeType === b.nodeType && a.nodeName === b.nodeName;
}

function morphChildren(from: Node, to: Node): void {
  let f = from.firstChild;
  let t = to.firstChild;
  while (t) {
    const nextT = t.nextSibling;
    if (!f) {
      from.appendChild(t);
    } else if (sameKind(f, t)) {
      if (f.nodeType === Node.ELEMENT_NODE) {
        // <style> & <svg> kecil: bandingkan cepat lewat outerHTML.
        syncAttrs(f as Element, t as Element);
        if ((f as Element).tagName === "STYLE") {
          if (f.textContent !== t.textContent) f.textContent = t.textContent;
        } else {
          morphChildren(f, t);
        }
      } else if (f.nodeValue !== t.nodeValue) {
        f.nodeValue = t.nodeValue;
      }
      f = f.nextSibling;
    } else {
      const old = f;
      f = f.nextSibling;
      from.replaceChild(t, old);
    }
    t = nextT;
  }
  while (f) {
    const n = f.nextSibling;
    from.removeChild(f);
    f = n;
  }
}

export function morph(host: Element, html: string): void {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  morphChildren(host, tpl.content);
}

/** Membuat event sintetis bergaya React (currentTarget = elemen pemilik handler). */
export function synth(e: Event, el: Element, state: { stopped: boolean }): SyntheticEvt {
  return {
    target: e.target,
    currentTarget: el,
    nativeEvent: e,
    preventDefault: () => e.preventDefault(),
    stopPropagation: () => {
      state.stopped = true;
      e.stopPropagation();
    },
  };
}
