/**
 * Enhancer bagikan ("share"): tombol WhatsApp/Telegram/X/Salin tautan di lembar bagikan aplikasi dan
 * tombol Bagikan/Salin tautan web membuka kanal sungguhan dengan tautan halaman yang sedang dibuka.
 */
import type { Cleanup, Env } from "./enhancers";
import { toast } from "./toast";

export function share(host: HTMLElement, { ctx }: Env): Cleanup {
  // Selalu domain yang sedang dibuka pengunjung (path kanonis dari server).
  const url = location.origin + (ctx.sharePath || location.pathname);
  const title = ctx.shareTitle || document.title;
  const text = title.replace(/ · OceanBird$| \| OceanBird$/, "");
  const copy = () =>
    navigator.clipboard?.writeText(url).then(
      () => toast(host, "Tautan disalin.", "ok"),
      () => toast(host, url),
    ) ?? toast(host, url);
  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-share]") : null;
    if (!t || !host.contains(t)) return;
    const ch = t.dataset.share!;
    const links: Record<string, string> = {
      wa: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
      tg: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    };
    if (links[ch]) {
      // Lembar desain tetap ditutup oleh handler desain; kanal dibuka di tab baru.
      window.open(links[ch], "_blank", "noopener,noreferrer");
      return;
    }
    if (ch === "copy") {
      if (t.tagName === "A") e.preventDefault();
      void copy();
      return;
    }
    if (ch === "native") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof navigator.share === "function") void navigator.share({ title: text, url }).catch(() => undefined);
      else void copy();
    }
  };
  host.addEventListener("click", onClick, true);
  return () => host.removeEventListener("click", onClick, true);
}
