#!/usr/bin/env python3
"""
Generator: mengubah artboard desain (design/boards/*.dc.html) menjadi modul Next.js.

Setiap artboard menghasilkan:
  src/boards/gen/<id>.tpl.ts     — template HTML + CSS (dipakai server, lalu dikirim ke klien sebagai prop)
  src/boards/gen/<id>.logic.ts   — kelas logika interaksi (state, handler) persis dari desain
  src/boards/gen/<id>.tsx        — komponen klien yang menjalankan logika di atas template
Ditambah:
  src/boards/gen/registry.ts     — pemuat board per id (import dinamis → code splitting per halaman)
  src/boards/gen/routes.ts       — tabel rute → board web / app / admin

Jalankan ulang setiap kali desain berubah:  python3 scripts/gen_boards.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "boards"
OUT = ROOT / "src" / "boards" / "gen"
META = json.loads((ROOT / "design" / "boards.json").read_text())

# ---------------------------------------------------------------------------
# Rute. path → (board web, board app). Admin hanya punya satu board (desktop).
# Segmen [x] = parameter dinamis; `sample` = nilai contoh untuk tautan di desain.
# ---------------------------------------------------------------------------
ROUTES: list[dict] = [
    {"path": "/", "web": "Artboard-hh6l", "app": "Artboard-app-05"},
    {"path": "/berita/[slug]", "web": "Artboard-hh6l-v23n", "app": "Artboard-app-06", "sample": {"slug": "ihsg-menguat-ditopang-saham-perbankan"}},
    {"path": "/kategori/[slug]", "web": "Artboard-hh6l-v23n-1gu5", "app": "Artboard-app-07", "sample": {"slug": "saham"}},
    {"path": "/market", "web": "Artboard-hh6l-v23n-1gu5-04on", "app": "Artboard-app-08"},
    {"path": "/market/[symbol]", "web": "Artboard-hh6l-v23n-1gu5-04on-83f0-ipck", "app": "Artboard-app-09", "sample": {"symbol": "BBCA"}},
    {"path": "/kalender", "web": "Artboard-hh6l-v23n-1gu5-04on-83f0", "app": "Artboard-app-10"},
    {"path": "/cari", "web": "Artboard-hh6l-v23n-1gu5-04on-83f0-ipck-g7o2", "app": "Artboard-app-11"},
    {"path": "/watchlist", "web": "Artboard-web-watchlist", "app": "Artboard-app-12"},
    {"path": "/alert", "app": "Artboard-app-13"},
    {"path": "/notifikasi", "app": "Artboard-app-14"},
    {"path": "/live", "web": "Artboard-web-live", "app": "Artboard-app-15"},
    {"path": "/short", "web": "Artboard-web-short", "app": "Artboard-app-16"},
    {"path": "/tersimpan", "app": "Artboard-app-17"},
    {"path": "/penulis/[slug]", "web": "Artboard-web-penulis", "app": "Artboard-app-18", "sample": {"slug": "maya-lestari"}},
    {"path": "/topik/[slug]", "web": "Artboard-web-topik", "app": "Artboard-app-19", "sample": {"slug": "ihsg"}},
    {"path": "/akun", "web": "Artboard-web-akun", "app": "Artboard-app-20"},
    {"path": "/pengaturan", "app": "Artboard-app-21"},
    {"path": "/legal", "web": "Artboard-web-legal", "app": "Artboard-app-22"},
    {"path": "/offline", "web": "Artboard-web-error", "app": "Artboard-app-23"},
    {"path": "/masuk", "web": "Artboard-web-login", "app": "Artboard-app-03"},
    {"path": "/daftar", "web": "Artboard-web-login", "app": "Artboard-app-24"},
    {"path": "/verifikasi", "app": "Artboard-app-04"},
    {"path": "/selamat-datang", "app": "Artboard-app-02"},
    {"path": "/splash", "app": "Artboard-app-01"},
    {"path": "/plus", "app": "Artboard-app-25"},
    {"path": "/plus/baca", "app": "Artboard-app-26"},
    {"path": "/plus/analisis", "app": "Artboard-app-27"},
    {"path": "/plus/checkout", "app": "Artboard-app-28"},
    {"path": "/plus/menunggu-pembayaran", "app": "Artboard-app-29"},
    {"path": "/plus/berhasil", "app": "Artboard-app-30"},
    {"path": "/plus/email", "app": "Artboard-app-31"},
    {"path": "/plus/whatsapp", "app": "Artboard-app-32"},
    {"path": "/screener", "web": "Artboard-web-screener"},
    {"path": "/newsletter", "web": "Artboard-web-newsletter"},
    {"path": "/tentang", "web": "Artboard-web-tentang"},
    {"path": "/iklan", "web": "Artboard-web-iklan"},
    {"path": "/bantuan", "web": "Artboard-web-bantuan"},
    # Panel admin
    {"path": "/admin", "admin": "A-Overview"},
    {"path": "/admin/konten", "admin": "A-Content"},
    {"path": "/admin/tulis", "admin": "A-Editor"},
    {"path": "/admin/versi", "admin": "A-Versions"},
    {"path": "/admin/live", "admin": "A-Live"},
    {"path": "/admin/kategori", "admin": "A-Categories"},
    {"path": "/admin/kategori/form", "admin": "A-CategoryForm"},
    {"path": "/admin/komentar", "admin": "A-Comments"},
    {"path": "/admin/media", "admin": "A-Media"},
    {"path": "/admin/pasar", "admin": "A-Market"},
    {"path": "/admin/simbol", "admin": "A-Symbol"},
    {"path": "/admin/iklan", "admin": "A-Ads"},
    {"path": "/admin/newsletter", "admin": "A-Newsletter"},
    {"path": "/admin/notifikasi", "admin": "A-Notif"},
    {"path": "/admin/laporan", "admin": "A-Reports"},
    {"path": "/admin/pengguna", "admin": "A-Users"},
    {"path": "/admin/role", "admin": "A-Roles"},
    {"path": "/admin/aktivitas", "admin": "A-Activity"},
    {"path": "/admin/cari", "admin": "A-Search"},
    {"path": "/admin/cari/hasil", "admin": "A-SearchResults"},
    {"path": "/admin/pengaturan", "admin": "A-Settings"},
    {"path": "/admin/kondisi", "admin": "A-SysStates"},
    {"path": "/admin/mockup", "admin": "A-Mockup"},
    {"path": "/admin/masuk", "admin": "A-Login", "public": True},
    {"path": "/admin/masuk/verifikasi", "admin": "A-Login2FA", "public": True},
    {"path": "/admin/masuk/sesi-berakhir", "admin": "A-LoginExpired", "public": True},
    {"path": "/admin/masuk/lupa", "admin": "A-LoginForgot", "public": True},
    {"path": "/admin/masuk/cek-email", "admin": "A-LoginForgotSent", "public": True},
    {"path": "/admin/masuk/terkunci", "admin": "A-LoginLocked", "public": True},
    {"path": "/admin/masuk/sandi-baru", "admin": "A-LoginReset", "public": True},
]

BLOBS = {
    "/_blob/3d351840be016b65eff3af94ab1c93b3": "/logo.png",
    "/_blob/14898ae951d3707a50c83320e9d1bc14": "/img/news-1.jpg",
    "/_blob/137ba7963f45a93d3ea3b33914ac95ec": "/img/news-2.jpg",
}


def board_id(name: str) -> str:
    """Nama file desain → id pendek yang aman untuk nama modul."""
    n = name.replace(".dc.html", "")
    special = {
        "Artboard-hh6l": "web-home",
        "Artboard-hh6l-v23n": "web-berita",
        "Artboard-hh6l-v23n-1gu5": "web-kategori",
        "Artboard-hh6l-v23n-1gu5-04on": "web-market",
        "Artboard-hh6l-v23n-1gu5-04on-83f0": "web-kalender",
        "Artboard-hh6l-v23n-1gu5-04on-83f0-ipck": "web-market-detail",
        "Artboard-hh6l-v23n-1gu5-04on-83f0-ipck-g7o2": "web-cari",
    }
    if n in special:
        return special[n]
    if n.startswith("Artboard-app-"):
        return "app-" + n[len("Artboard-app-"):]
    if n.startswith("Artboard-web-"):
        return "web-" + n[len("Artboard-web-"):]
    if n.startswith("A-"):
        return "admin-" + re.sub(r"(?<!^)(?=[A-Z0-9])", "-", n[2:]).lower()
    raise SystemExit(f"board tak dikenal: {name}")


def sample_path(route: dict) -> str:
    p = route["path"]
    for k, v in route.get("sample", {}).items():
        p = p.replace(f"[{k}]", v)
    return p


# Board → URL contoh (untuk menulis ulang tautan antar-artboard).
LINK: dict[str, str] = {}
for r in ROUTES:
    for kind in ("web", "app", "admin"):
        b = r.get(kind)
        if b and b not in LINK:
            LINK[b] = sample_path(r)


def rewrite_links(html: str) -> str:
    def rep(m: re.Match) -> str:
        target, frag = m.group(1), m.group(2) or ""
        if target not in LINK:
            raise SystemExit(f"tautan ke board tanpa rute: {target}")
        return f'href="{LINK[target]}{frag}"'

    return re.sub(r'href="((?:Artboard|A)-[\w-]+)\.dc\.html(#[\w-]+)?"', rep, html)


ROOT_APP = "position: relative; width: 390px; height: 844px;"
ROOT_WEB = "position: relative; width: 1440px; height: 900px;"


def convert(name: str) -> dict:
    s = (SRC / name).read_text()
    helmet = re.search(r"<helmet>(.*?)</helmet>", s, re.S)
    css = "\n".join(re.findall(r"<style>(.*?)</style>", helmet.group(1), re.S)) if helmet else ""
    body = s[s.find("</helmet>") + len("</helmet>") : s.find("</x-dc>")] if helmet else s[s.find("<x-dc>") + 6 : s.find("</x-dc>")]
    js_m = re.search(r"<script type=\"text/x-dc\" data-dc-script[^>]*>(.*?)</script>", s, re.S)
    body = re.sub(r"<script type=\"text/x-dc\".*?</script>", "", body, flags=re.S).strip()
    logic = js_m.group(1).strip() if js_m else "class Component extends DCLogic { renderVals() { return {}; } }"
    if "class Component extends DCLogic" not in logic:
        raise SystemExit(f"{name}: kelas logika tidak ditemukan")

    for k, v in BLOBS.items():
        body = body.replace(k, v)
    if "/_blob/" in body:
        raise SystemExit(f"{name}: aset blob tak dikenal")
    body = rewrite_links(body)

    kind = "admin" if name.startswith("A-") else ("app" if name.startswith("Artboard-app-") else "web")
    # Board app & web: kanvas tetap → isi seluruh viewport (lihat DCBoard untuk bingkai & skala).
    if kind == "app":
        assert ROOT_APP in body, name
        body = body.replace(ROOT_APP, "position: relative; width: 100%; height: 100%;", 1)
    elif kind == "web":
        assert ROOT_WEB in body, name
        body = body.replace(ROOT_WEB, "position: relative; width: 100%; height: 100%;", 1)

    # CSS global desain mengunci html/body (board menggulir di dalam kontainernya sendiri).
    # Untuk admin, dokumen yang menggulir.
    return {"id": board_id(name), "file": name, "kind": kind, "html": body, "css": css, "logic": logic,
            "title": META[name]["title"]}


# ---------------------------------------------------------------------------
# Patch fungsional di atas desain (tanpa mengubah gaya): pilihan timeframe lengkap pada
# Detail Market — 1m, 5m, 15m, 30m, 1J, 4J, 1D, 1W, 1M — dan atribut data-tf / data-range
# yang dibaca enhancer grafik TradingView.
# ---------------------------------------------------------------------------
TF_ALL = ["1m", "5m", "15m", "30m", "1J", "4J", "1D", "1W", "1M"]
RANGE_TV = {"1H": "1D", "5H": "5D", "1B": "1M", "3B": "3M", "6B": "6M", "YTD": "YTD", "1T": "12M", "5T": "60M", "Semua": "ALL"}


def patch_web_detail(b: dict) -> None:
    h, js = b["html"], b["logic"]
    first = re.search(r'<button aria-pressed="\{\{ tf\.i0\.pr \}\}"[^>]*>1m</button>', h)
    last = re.search(r'<button aria-pressed="\{\{ tf\.i7\.pr \}\}"[^>]*>1M</button>', h)
    assert first and last, "tombol timeframe web tidak ditemukan"
    tpl = first.group(0)
    new = "".join(
        tpl.replace("tf.i0.", f"tf.i{i}.").replace(">1m<", f">{lbl}<").replace("<button ", f'<button data-tf="{lbl}" ', 1)
        for i, lbl in enumerate(TF_ALL)
    )
    h = h[: first.start()] + new + h[last.end():]
    for lbl, rng in RANGE_TV.items():
        h = re.sub(rf'(<button )(aria-pressed="\{{\{{ rg\.i\d\.pr \}}\}}"[^>]*>{re.escape(lbl)}</button>)', rf'\1data-range="{rng}" \2', h, count=1)
    assert "const TF = ['1m', '5m', '15m', '1J', '4J', '1D', '1W', '1M'];" in js
    js = js.replace("const TF = ['1m', '5m', '15m', '1J', '4J', '1D', '1W', '1M'];", "const TF = " + json.dumps(TF_ALL).replace('"', "'") + ";")
    js = js.replace("grp('tf', 8,", "grp('tf', 9,").replace("this.state = { tf: 5,", "this.state = { tf: 6,")
    assert "grp('tf', 9," in js and "tf: 6," in js
    b["html"], b["logic"] = h, js


def patch_app_detail(b: dict) -> None:
    h, js = b["html"], b["logic"]
    first = re.search(r'<button onClick="\{\{ u1\.m0\.pick \}\}"[^>]*>5m</button>', h)
    last = re.search(r'<button onClick="\{\{ u1\.m5\.pick \}\}"[^>]*>1M</button>', h)
    assert first and last, "tombol timeframe app tidak ditemukan"
    tpl = first.group(0)
    new = "".join(
        tpl.replace("u1.m0.", f"u1.m{i}.").replace(">5m<", f">{lbl}<").replace("<button ", f'<button data-tf="{lbl}" ', 1)
        for i, lbl in enumerate(TF_ALL)
    )
    h = h[: first.start()] + new + h[last.end():]
    old_state = '"u1": [false, false, false, true, false, false]'
    assert old_state in js and '"u1": {"n": 6,' in js
    js = js.replace(old_state, '"u1": ' + json.dumps([i == 6 for i in range(9)]))
    js = js.replace('"u1": {"n": 6,', '"u1": {"n": 9,')
    b["html"], b["logic"] = h, js


PATCHES = {"web-market-detail": patch_web_detail, "app-09": patch_app_detail}

HEADER = "// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.\n"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.iterdir():
        f.unlink()
    boards = [convert(n) for n in sorted(META)]
    for b in boards:
        if b["id"] in PATCHES:
            PATCHES[b["id"]](b)
    used = {r.get(k) for r in ROUTES for k in ("web", "app", "admin")} - {None}
    missing = set(n.replace(".dc.html", "") for n in META) - used
    if missing:
        print("peringatan: board tanpa rute:", sorted(missing), file=sys.stderr)

    for b in boards:
        i = b["id"]
        (OUT / f"{i}.tpl.ts").write_text(
            HEADER + 'import "server-only";\n'
            f"export const kind = {json.dumps(b['kind'])} as const;\n"
            f"export const title = {json.dumps(b['title'], ensure_ascii=False)};\n"
            f"export const css = {json.dumps(b['css'], ensure_ascii=False)};\n"
            f"export const html = {json.dumps(b['html'], ensure_ascii=False)};\n")
        (OUT / f"{i}.logic.ts").write_text(
            HEADER + "// @ts-nocheck\n/* eslint-disable */\nimport { DCLogic } from \"@/dc/runtime\";\n\n"
            + b["logic"] + "\n\nexport default Component;\n")
        (OUT / f"{i}.tsx").write_text(
            HEADER + '"use client";\n\nimport DCBoard, { type BoardProps } from "@/dc/DCBoard";\n'
            f'import Logic from "./{i}.logic";\n\n'
            "export default function Board(props: BoardProps) {\n  return <DCBoard Logic={Logic} {...props} />;\n}\n")

    ids = [b["id"] for b in boards]
    reg = [HEADER, 'import "server-only";\nimport type { ComponentType } from "react";\nimport type { BoardProps } from "@/dc/DCBoard";\n\n',
           "export interface LoadedBoard {\n  kind: \"web\" | \"app\" | \"admin\";\n  title: string;\n  css: string;\n  html: string;\n  Component: ComponentType<BoardProps>;\n}\n\n",
           "export type BoardId =\n" + "\n".join(f"  | {json.dumps(i)}" for i in ids) + ";\n\n",
           "export async function loadBoard(id: BoardId): Promise<LoadedBoard> {\n  switch (id) {\n"]
    for i in ids:
        reg.append(f"    case {json.dumps(i)}: {{\n      const [t, c] = await Promise.all([import(\"./{i}.tpl\"), import(\"./{i}\")]);\n"
                   "      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };\n    }\n")
    reg.append("  }\n}\n")
    (OUT / "registry.ts").write_text("".join(reg))

    def bid(n):
        return board_id(n + ".dc.html") if n else None

    rows = []
    for r in ROUTES:
        rows.append({"path": r["path"], "web": bid(r.get("web")), "app": bid(r.get("app")), "admin": bid(r.get("admin")),
                     "public": bool(r.get("public"))})
    (OUT / "routes.ts").write_text(
        HEADER + 'import type { BoardId } from "./registry";\n\n'
        "export interface RouteDef {\n  path: string;\n  web: BoardId | null;\n  app: BoardId | null;\n  admin: BoardId | null;\n  public: boolean;\n}\n\n"
        "export const ROUTES: RouteDef[] = " + json.dumps(rows, indent=2) + ";\n")
    print(f"{len(boards)} board dihasilkan → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
