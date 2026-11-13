import "server-only";
import { closeOf } from "./kit";

/**
 * Navigasi bawah aplikasi (satu sumber untuk semua board app): Beranda · Market · Cari · Kalender · Akun.
 * Watchlist dipindah ke menu Akun. Penulis/editor (izin content.write) mendapat tombol "+" untuk
 * menulis artikel atau mengunggah Ocean Short langsung dari aplikasi.
 */
const ICON_ATTR = 'width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const TABS: { href: string; label: string; match: (p: string) => boolean; icon: string }[] = [
  {
    href: "/",
    label: "Beranda",
    match: (p) => p === "/",
    icon: '<g fill="currentColor" stroke="none" opacity=".18"><rect x="3.5" y="3.5" width="7.5" height="9" rx="2.8"/><rect x="13" y="11.5" width="7.5" height="9" rx="2.8"/></g><rect x="3.5" y="3.5" width="7.5" height="9" rx="2.8"/><rect x="13" y="3.5" width="7.5" height="6" rx="2.8"/><rect x="13" y="11.5" width="7.5" height="9" rx="2.8"/><rect x="3.5" y="14.5" width="7.5" height="6" rx="2.8"/>',
  },
  {
    href: "/market",
    label: "Market",
    match: (p) => p === "/market" || p.startsWith("/market/") || p === "/screener",
    icon: '<g fill="currentColor" stroke="none" opacity=".18"><path d="M3.5 17l5.5-5.5 4 4 7.5-7.5V20H3.5z"/></g><path d="M3.5 17l5.5-5.5 4 4 7.5-7.5"/><path d="M15 8h5.5v5.5"/>',
  },
  {
    href: "/cari",
    label: "Cari",
    match: (p) => p === "/cari",
    icon: '<g fill="currentColor" stroke="none" opacity=".18"><circle cx="11" cy="11" r="7"/></g><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.9-3.9"/>',
  },
  {
    href: "/kalender",
    label: "Kalender",
    match: (p) => p === "/kalender",
    icon: '<g fill="currentColor" stroke="none" opacity=".18"><path d="M3.5 9.5V8a3.5 3.5 0 0 1 3.5-3.5h10A3.5 3.5 0 0 1 20.5 8v1.5z"/></g><rect x="3.5" y="4.5" width="17" height="16" rx="4"/><path d="M3.5 9.5h17M8 2.8v3.4M16 2.8v3.4"/><circle cx="8.5" cy="14" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r=".9" fill="currentColor" stroke="none"/><circle cx="15.5" cy="14" r=".9" fill="currentColor" stroke="none"/>',
  },
  {
    href: "/akun",
    label: "Akun",
    match: (p) => p === "/akun" || p === "/pengaturan" || p === "/watchlist" || p === "/tersimpan",
    icon: '<g fill="currentColor" stroke="none" opacity=".18"><circle cx="12" cy="8" r="4"/><path d="M4.8 20.5c.7-3.8 3.6-6 7.2-6s6.5 2.2 7.2 6z"/></g><circle cx="12" cy="8" r="4"/><path d="M4.8 20.5c.7-3.8 3.6-6 7.2-6s6.5 2.2 7.2 6"/>',
  },
];

export function appNav(path: string): string {
  const items = TABS.map((t) => {
    const on = t.match(path);
    return `<a href="${t.href}"${on ? ' aria-current="page"' : ""} style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 6px; min-height: 52px; text-decoration: none"><span style="width: 56px; height: 30px; border-radius: 999px; background: ${on ? "#E8F0FE" : "transparent"}; color: ${on ? "#2F74EB" : "#8A94A6"}; display: flex; align-items: center; justify-content: center"><svg ${ICON_ATTR} stroke-width="${on ? 2 : 1.8}">${t.icon}</svg></span><span style="font-size: 11px; font-weight: ${on ? 700 : 500}; color: ${on ? "#0B0B0F" : "#5F6B7D"}">${t.label}</span></a>`;
  }).join("");
  return `<nav aria-label="Navigasi aplikasi" style="position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; background: #FFFFFF; border-top: 1px solid #E3EAF4; padding: 4px 8px calc(20px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(5, 1fr)">${items}</nav>`;
}

/** Tombol "+" (penulis/editor): lembar pilihan Artikel atau Short, tanpa JavaScript (details/summary). */
export function createFab(raised = false): string {
  const bottom = raised ? "calc(156px + env(safe-area-inset-bottom))" : "calc(92px + env(safe-area-inset-bottom))";
  const opt = (href: string, title: string, sub: string, icon: string) =>
    `<a href="${href}" style="display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 16px; background: #F6F8FC; color: #0B0B0F; text-decoration: none"><span style="flex: none; width: 44px; height: 44px; border-radius: 14px; background: #E5ECFF; color: #2F74EB; display: flex; align-items: center; justify-content: center"><svg ${ICON_ATTR} stroke-width="1.9">${icon}</svg></span><span style="display: flex; flex-direction: column; gap: 2px"><strong style="font-size: 15px; font-weight: 500">${title}</strong><span style="font-size: 12px; color: #5F6B7D">${sub}</span></span></a>`;
  return (
    `<details data-create-fab style="position: fixed; right: 16px; bottom: ${bottom}; z-index: 45">` +
    `<style>[data-create-fab]>summary{list-style:none}[data-create-fab]>summary::-webkit-details-marker{display:none}[data-create-fab][open]>summary{transform:rotate(45deg)}</style>` +
    `<summary aria-label="Buat konten" style="width: 56px; height: 56px; border-radius: 18px; background: #0B0B0F; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 30px; line-height: 1; cursor: pointer; box-shadow: 0 8px 24px rgba(11,11,15,.3); transition: transform .2s">+</summary>` +
    `<div role="menu" style="position: fixed; left: 0; right: 0; bottom: 0; z-index: 46; padding: 20px 20px calc(24px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; background: #FFFFFF; box-shadow: 0 -12px 40px rgba(11,11,15,.18); display: flex; flex-direction: column; gap: 10px">` +
    `<span style="align-self: center; width: 40px; height: 4px; border-radius: 999px; background: #D5DCE6"></span>` +
    `<strong style="font-size: 17px; font-weight: 700; margin: 4px 0">Buat konten</strong>` +
    opt("/tulis/artikel", "Tulis artikel", "Gambar, judul, deskripsi, dan market terkait", '<path d="M5 4.5h10l4 4v11H5z"/><path d="M8.5 11h7M8.5 14.5h7M8.5 7.5h3"/>') +
    opt("/tulis/short", "Unggah Ocean Short", "Video vertikal pendek ala TikTok", '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M10.5 9.5v5l4-2.5z" fill="currentColor"/>') +
    `</div></details>`
  );
}

/**
 * Ganti navigasi bawah desain dengan navigasi bersama. Halaman Kalender (tanpa nav di desain)
 * ikut mendapat navigasi karena kini menjadi tab utama.
 */
export function bindAppNav(html: string, path: string, canWrite: boolean): string {
  let h = html.replace(/<nav aria-label="Navigasi aplikasi"[\s\S]*?<\/nav>/, () => appNav(path));
  const hasNav = h.includes('aria-label="Navigasi aplikasi"');
  if (!hasNav && path === "/kalender") {
    // Posisi top area gulir bisa sudah diubah hideFakeStatusBar (calc(...)), jadi cocokkan bagian lainnya.
    const sig = /(<div class="ob-scroll" style="position: absolute; top: [^;]+; left: 0; right: 0; bottom: 0; overflow-y: auto; padding: 0 20px )40px/;
    const scroller = h.search(sig);
    if (scroller >= 0) {
      h = h.replace(sig, "$1120px");
      const end = closeOf(h, scroller);
      h = h.slice(0, end) + appNav(path) + h.slice(end);
    }
  }
  if (canWrite && h.includes('aria-label="Navigasi aplikasi"')) h += createFab(h.includes("data-ai-fab"));
  return h;
}
