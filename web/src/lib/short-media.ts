/**
 * Sumber video Ocean Short: berkas langsung (unggahan Blob / CDN) atau tautan platform
 * (YouTube & YouTube Shorts, TikTok, Instagram Reels, Vimeo, Facebook, Google Drive, Dailymotion)
 * yang diputar lewat pemutar resmi platform tersebut (iframe).
 */
export type ShortMedia =
  | { kind: "file"; src: string; poster: string | null; type: string | null }
  | { kind: "embed"; src: string; poster: string | null; provider: string; portrait: boolean }
  | { kind: "none"; poster: string | null };

/** Ekstensi → MIME untuk berkas video yang umum. */
export const VIDEO_EXT: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime", qt: "video/quicktime", webm: "video/webm", ogv: "video/ogg", ogg: "video/ogg",
  "3gp": "video/3gpp", "3g2": "video/3gpp2", mkv: "video/x-matroska", avi: "video/x-msvideo", mpeg: "video/mpeg", mpg: "video/mpeg", ts: "video/mp2t", m3u8: "application/vnd.apple.mpegurl",
};

const IMG_RE = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

function parse(u: string): URL | null {
  try {
    const x = new URL(u.trim());
    return x.protocol === "https:" || x.protocol === "http:" ? x : null;
  } catch {
    return null;
  }
}

/** Tautan platform → URL pemutar iframe (null bila bukan tautan platform yang dikenal). */
export function embedOf(raw: string): { src: string; provider: string; portrait: boolean; thumb: string | null } | null {
  const u = parse(raw);
  if (!u) return null;
  const host = u.hostname.replace(/^(www|m|mobile)\./, "");
  const seg = u.pathname.split("/").filter(Boolean);
  const id = (s: string | undefined | null) => (s && /^[\w-]{4,64}$/.test(s) ? s : null);
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    const v = host === "youtu.be" ? id(seg[0]) : seg[0] === "shorts" || seg[0] === "embed" || seg[0] === "live" ? id(seg[1]) : id(u.searchParams.get("v"));
    if (!v) return null;
    return { src: `https://www.youtube-nocookie.com/embed/${v}?playsinline=1&rel=0&modestbranding=1`, provider: "YouTube", portrait: seg[0] === "shorts", thumb: `https://i.ytimg.com/vi/${v}/hqdefault.jpg` };
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const i = seg.indexOf("video");
    const v = i >= 0 ? seg[i + 1] : seg[0] === "embed" ? seg[seg.length - 1] : null;
    if (!v || !/^\d{6,25}$/.test(v)) return null;
    return { src: `https://www.tiktok.com/player/v1/${v}?description=0&music_info=0&rel=0`, provider: "TikTok", portrait: true, thumb: null };
  }
  if (host === "instagram.com") {
    const i = seg.findIndex((s) => s === "reel" || s === "reels" || s === "p" || s === "tv");
    const v = i >= 0 ? id(seg[i + 1]) : null;
    if (!v) return null;
    return { src: `https://www.instagram.com/reel/${v}/embed/`, provider: "Instagram", portrait: true, thumb: null };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const v = seg.find((s) => /^\d{5,12}$/.test(s));
    if (!v) return null;
    return { src: `https://player.vimeo.com/video/${v}?playsinline=1`, provider: "Vimeo", portrait: false, thumb: null };
  }
  if (host === "facebook.com" || host === "fb.watch") {
    return { src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.toString())}&show_text=false`, provider: "Facebook", portrait: seg.includes("reel"), thumb: null };
  }
  if (host === "drive.google.com") {
    const i = seg.indexOf("d");
    const v = i >= 0 ? seg[i + 1] : u.searchParams.get("id");
    if (!v || !/^[\w-]{10,80}$/.test(v)) return null;
    return { src: `https://drive.google.com/file/d/${v}/preview`, provider: "Google Drive", portrait: false, thumb: null };
  }
  if (host === "dailymotion.com" || host === "dai.ly") {
    const v = host === "dai.ly" ? id(seg[0]) : seg[0] === "video" ? id(seg[1]) : null;
    if (!v) return null;
    return { src: `https://www.dailymotion.com/embed/video/${v}`, provider: "Dailymotion", portrait: false, thumb: null };
  }
  return null;
}

export function shortMedia(video: string | null | undefined, cover: string | null | undefined): ShortMedia {
  const v = (video ?? "").trim();
  const c0 = (cover ?? "").trim();
  // Sampul hanya dipakai bila berupa gambar (bukan tautan halaman/video yang tertempel di kolom sampul).
  const c = c0 && c0 !== v && (IMG_RE.test(c0) || c0.startsWith("/") || /\/v1\/media\//.test(c0) || /blob\.vercel-storage\.com/.test(c0) || /i\.ytimg\.com/.test(c0)) && !embedOf(c0) ? c0 : null;
  if (!v) return { kind: "none", poster: c };
  const e = embedOf(v);
  if (e) return { kind: "embed", src: e.src, provider: e.provider, portrait: e.portrait, poster: c ?? e.thumb };
  const u = parse(v);
  if (!u && !v.startsWith("/")) return { kind: "none", poster: c };
  const ext = (u?.pathname ?? v).split(".").pop()?.toLowerCase() ?? "";
  return { kind: "file", src: v, poster: c, type: VIDEO_EXT[ext] ?? null };
}
