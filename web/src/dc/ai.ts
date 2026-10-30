/**
 * Enhancer "ai": Analisis AI yang hidup di halaman.
 *  - [data-ai-fill="article:<slug>" | "market:<SYM>"]: bila analisis belum siap saat halaman dibuat,
 *    browser menunggu hasilnya lalu menampilkannya (halaman Analisis AI dimuat ulang agar lengkap).
 *  - Tanya AI (halaman Analisis AI): chip & kolom pertanyaan → POST /api/ai/ask, jawaban tampil sebagai percakapan.
 */
import type { Cleanup, Env } from "./enhancers";

const el = (tag: string, style: string, text = "") => {
  const e = document.createElement(tag);
  e.setAttribute("style", style);
  e.textContent = text;
  return e;
};

export function ai(host: HTMLElement, { router }: Env): Cleanup {
  let disposed = false;
  const timers: number[] = [];

  // ---------------------------------------------------------------- melengkapi analisis yang belum siap
  const pending = [...host.querySelectorAll<HTMLElement>("[data-ai-fill]")];
  const groups = new Map<string, HTMLElement[]>();
  for (const p of pending) groups.set(p.dataset.aiFill!, [...(groups.get(p.dataset.aiFill!) ?? []), p]);
  groups.forEach((els, key) => {
    const [kind, id] = key.split(":") as [string, string];
    const url = kind === "article" ? `/api/ai/article?slug=${encodeURIComponent(id)}` : `/api/ai/market?symbol=${encodeURIComponent(id)}`;
    let tries = 0;
    const attempt = async () => {
      if (disposed) return;
      tries++;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { inti?: string };
          if (j.inti && !disposed) {
            if (host.querySelector("[data-ai-chat]")) {
              router.refresh(); // halaman Analisis AI: muat ulang agar poin, sentimen & aset ikut tampil
              return;
            }
            for (const e of els) e.replaceWith(document.createTextNode(j.inti));
            return;
          }
        }
      } catch {
        /* coba lagi */
      }
      if (tries < 6) timers.push(window.setTimeout(attempt, 4000));
      else for (const e of els) e.textContent = "Analisis AI belum tersedia. Coba muat ulang sebentar lagi.";
    };
    void attempt();
  });

  // ---------------------------------------------------------------- Tanya AI
  const chat = host.querySelector<HTMLElement>("[data-ai-chat]");
  if (!chat) {
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
    };
  }
  const slug = chat.dataset.aiAskSlug || "";
  const symbol = chat.dataset.aiAskSymbol || "";
  let busy = false;

  const scrollDown = () => {
    const sc = chat.closest<HTMLElement>(".ob-scroll");
    if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" });
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    busy = true;
    if (!chat.childElementCount) chat.style.marginTop = "14px";
    chat.appendChild(el("div", "align-self: flex-end; max-width: 85%; padding: 10px 14px; border-radius: 18px 18px 4px 18px; background: #2F74EB; color: #FFFFFF; font-size: 14px; line-height: 1.45", q));
    const ans = el("div", "align-self: flex-start; max-width: 92%; padding: 12px 14px; border-radius: 18px 18px 18px 4px; background: #F2F7FF; border: 1px solid #C9DBFB; color: #0B0B0F; font-size: 14px; line-height: 1.55; white-space: pre-wrap", "AI sedang menjawab…");
    chat.appendChild(ans);
    scrollDown();
    try {
      const r = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slug ? { slug, question: q } : { symbol, question: q }),
      });
      const j = (await r.json().catch(() => ({}))) as { answer?: string; detail?: string; title?: string };
      if (r.ok && j.answer) ans.textContent = j.answer;
      else if (r.status === 401) {
        ans.textContent = "Masuk dulu untuk bertanya ke AI. ";
        const a = el("a", "color: #2F74EB; font-weight: 500", "Masuk");
        a.setAttribute("href", `/masuk?next=${encodeURIComponent(location.pathname + location.search)}`);
        ans.appendChild(a);
      } else ans.textContent = j.detail || j.title || "AI sedang sibuk. Coba lagi sebentar lagi.";
    } catch {
      ans.textContent = "Koneksi terputus. Coba lagi.";
    } finally {
      busy = false;
      scrollDown();
    }
  };

  const input = () => host.querySelector<HTMLInputElement>('[aria-label="Tanya AI"] input');
  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    const chip = t?.closest<HTMLElement>("[data-ai-chip]");
    const send = t?.closest<HTMLElement>('[aria-label="Tanya AI"] button[aria-label="Kirim"]');
    if (!chip && !send) return;
    e.preventDefault();
    e.stopPropagation(); // ganti perilaku contoh di desain (toast) dengan pertanyaan sungguhan
    if (chip) void ask(chip.textContent ?? "");
    else {
      const i = input();
      const v = i?.value ?? "";
      if (!v.trim()) return;
      if (i) i.value = "";
      void ask(v);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    const i = e.target instanceof HTMLInputElement ? e.target : null;
    if (e.key !== "Enter" || !i || !i.closest('[aria-label="Tanya AI"]')) return;
    e.preventDefault();
    const v = i.value;
    i.value = "";
    void ask(v);
  };
  host.addEventListener("click", onClick, true);
  host.addEventListener("keydown", onKey, true);
  return () => {
    disposed = true;
    timers.forEach(clearTimeout);
    host.removeEventListener("click", onClick, true);
    host.removeEventListener("keydown", onKey, true);
  };
}
