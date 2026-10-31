"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { DCLogic, fill, morph, synth, type Handler } from "./runtime";
import { runEnhancer, type EnhancerId } from "./enhancers";

export interface BoardProps {
  /** Template HTML yang sudah diisi data nyata di server. */
  tpl: string;
  css: string;
  kind: "web" | "app" | "admin";
  /** Perilaku tambahan (mis. login sungguhan) yang dipasang setelah board tampil. */
  enhance?: EnhancerId[];
  /** Data untuk enhancer (mis. tujuan setelah login). */
  ctx?: Record<string, string>;
}

type LogicCtor = new (props: Record<string, unknown>) => DCLogic;

/** Lebar minimum kanvas desain desktop; di bawah ini board diperkecil proporsional. */
const WEB_MIN = 1280;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function DCBoard({ Logic, tpl, css, kind, enhance, ctx }: BoardProps & { Logic: LogicCtor }) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);
  const fnsRef = useRef<Handler[]>([]);

  // Render awal (juga di server → HTML lengkap untuk SEO & tampil cepat).
  const { comp, first } = useMemo(() => {
    const c = new Logic({});
    // State awal dari server (mis. preferensi tersimpan) menggantikan nilai contoh desain.
    if (ctx?.state) {
      try {
        const init = JSON.parse(ctx.state) as Record<string, unknown>;
        const cur = c.state as Record<string, unknown>;
        for (const [k, v] of Object.entries(init)) {
          cur[k] = v && typeof v === "object" && !Array.isArray(v) && cur[k] && typeof cur[k] === "object" ? { ...(cur[k] as object), ...(v as object) } : v;
        }
      } catch {
        /* abaikan state rusak */
      }
    }
    const r = fill(tpl, c.renderVals());
    fnsRef.current = r.fns;
    return { comp: c, first: r.html };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skala untuk layar yang lebih sempit dari kanvas desktop.
  useIsoLayoutEffect(() => {
    // Aplikasi menyesuaikan sendiri; panel admin responsif (tata letak HP/tablet dari desain), tidak diperkecil.
    if (kind !== "web") return;
    const el = scaleRef.current;
    if (!el) return;
    const fit = () => {
      const vw = document.documentElement.clientWidth;
      const z = vw < WEB_MIN ? vw / WEB_MIN : 1;
      el.style.zoom = z === 1 ? "" : String(z);
      el.style.width = z === 1 ? "" : `${WEB_MIN}px`;
      if (kind === "web") el.style.height = `${window.innerHeight / z}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [kind]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    comp.__render = () => {
      const r = fill(tpl, comp.renderVals());
      fnsRef.current = r.fns;
      morph(host, r.html);
      // Enhancer dapat mengikuti perubahan state desain (mis. menyimpan preferensi).
      host.dispatchEvent(new CustomEvent("dc:state", { detail: comp.state }));
    };

    const dispatch = (type: string) => (e: Event) => {
      const st = { stopped: false };
      let el = e.target instanceof Element ? e.target : null;
      while (el && el !== host.parentElement && !st.stopped) {
        const idx = el.getAttribute(`data-ev-${type}`);
        if (idx !== null) {
          const f = fnsRef.current[Number(idx)];
          if (f) f(synth(e, el, st));
          if (type === "scroll") break; // scroll tidak menggelembung
        }
        el = el.parentElement;
      }
      if (type === "click") navigate(e as MouseEvent);
    };

    // Tautan internal → navigasi SPA; "#" kosong → tidak melompat ke atas.
    const navigate = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a") : null;
      if (!a || !host.contains(a)) return;
      const href = a.getAttribute("href") ?? "";
      if (href === "#" || href === "") {
        e.preventDefault();
        return;
      }
      if (href.startsWith("/") && !href.startsWith("//") && a.target !== "_blank") {
        e.preventDefault();
        router.push(href);
      }
    };

    const onClick = dispatch("click");
    const onInput = dispatch("change");
    const onScroll = dispatch("scroll");
    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("scroll", onScroll, true);

    // Render ulang di klien (mis. nilai yang bergantung waktu) lalu lifecycle desain.
    comp.__render();
    (comp as unknown as { componentDidMount?: () => void }).componentDidMount?.();
    const cleanups = (enhance ?? []).map((id) => runEnhancer(id, host, { router, ctx: ctx ?? {} }));

    return () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("input", onInput);
      host.removeEventListener("scroll", onScroll, true);
      cleanups.forEach((c) => c?.());
      (comp as unknown as { componentWillUnmount?: () => void }).componentWillUnmount?.();
      comp.__render = null;
    };
  }, [comp, tpl, router, enhance, ctx]);

  const board = <div ref={hostRef} className="dc-host" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: first }} />;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {kind === "app" ? (
        <div className="dc-frame-app">
          <div className="dc-app">{board}</div>
        </div>
      ) : kind === "web" ? (
        <div className="dc-frame-web">
          <div ref={scaleRef} className="dc-web">
            {board}
          </div>
        </div>
      ) : (
        <div ref={scaleRef} className="dc-admin">
          {board}
        </div>
      )}
    </>
  );
}
