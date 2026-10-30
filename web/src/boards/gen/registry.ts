// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
import "server-only";
import type { ComponentType } from "react";
import type { BoardProps } from "@/dc/DCBoard";

export interface LoadedBoard {
  kind: "web" | "app" | "admin";
  title: string;
  css: string;
  html: string;
  Component: ComponentType<BoardProps>;
}

export type BoardId =
  | "admin-activity"
  | "admin-ads"
  | "admin-categories"
  | "admin-category-form"
  | "admin-comments"
  | "admin-content"
  | "admin-editor"
  | "admin-live"
  | "admin-login"
  | "admin-login-2-f-a"
  | "admin-login-expired"
  | "admin-login-forgot"
  | "admin-login-forgot-sent"
  | "admin-login-locked"
  | "admin-login-reset"
  | "admin-market"
  | "admin-media"
  | "admin-mockup"
  | "admin-newsletter"
  | "admin-notif"
  | "admin-overview"
  | "admin-reports"
  | "admin-roles"
  | "admin-search"
  | "admin-search-results"
  | "admin-settings"
  | "admin-symbol"
  | "admin-sys-states"
  | "admin-users"
  | "admin-versions"
  | "app-01"
  | "app-02"
  | "app-03"
  | "app-04"
  | "app-05"
  | "app-06"
  | "app-07"
  | "app-08"
  | "app-09"
  | "app-10"
  | "app-11"
  | "app-12"
  | "app-13"
  | "app-14"
  | "app-15"
  | "app-16"
  | "app-17"
  | "app-18"
  | "app-19"
  | "app-20"
  | "app-21"
  | "app-22"
  | "app-23"
  | "app-24"
  | "app-25"
  | "app-26"
  | "app-27"
  | "app-28"
  | "app-29"
  | "app-30"
  | "app-31"
  | "app-32"
  | "web-cari"
  | "web-market-detail"
  | "web-kalender"
  | "web-market"
  | "web-kategori"
  | "web-berita"
  | "web-home"
  | "web-akun"
  | "web-bantuan"
  | "web-error"
  | "web-iklan"
  | "web-legal"
  | "web-live"
  | "web-login"
  | "web-newsletter"
  | "web-penulis"
  | "web-screener"
  | "web-short"
  | "web-tentang"
  | "web-topik"
  | "web-watchlist";

export async function loadBoard(id: BoardId): Promise<LoadedBoard> {
  switch (id) {
    case "admin-activity": {
      const [t, c] = await Promise.all([import("./admin-activity.tpl"), import("./admin-activity")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-ads": {
      const [t, c] = await Promise.all([import("./admin-ads.tpl"), import("./admin-ads")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-categories": {
      const [t, c] = await Promise.all([import("./admin-categories.tpl"), import("./admin-categories")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-category-form": {
      const [t, c] = await Promise.all([import("./admin-category-form.tpl"), import("./admin-category-form")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-comments": {
      const [t, c] = await Promise.all([import("./admin-comments.tpl"), import("./admin-comments")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-content": {
      const [t, c] = await Promise.all([import("./admin-content.tpl"), import("./admin-content")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-editor": {
      const [t, c] = await Promise.all([import("./admin-editor.tpl"), import("./admin-editor")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-live": {
      const [t, c] = await Promise.all([import("./admin-live.tpl"), import("./admin-live")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-login": {
      const [t, c] = await Promise.all([import("./admin-login.tpl"), import("./admin-login")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-login-2-f-a": {
      const [t, c] = await Promise.all([import("./admin-login-2-f-a.tpl"), import("./admin-login-2-f-a")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-login-expired": {
      const [t, c] = await Promise.all([import("./admin-login-expired.tpl"), import("./admin-login-expired")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-login-forgot": {
      const [t, c] = await Promise.all([import("./admin-login-forgot.tpl"), import("./admin-login-forgot")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-login-forgot-sent": {
      const [t, c] = await Promise.all([import("./admin-login-forgot-sent.tpl"), import("./admin-login-forgot-sent")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-login-locked": {
      const [t, c] = await Promise.all([import("./admin-login-locked.tpl"), import("./admin-login-locked")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-login-reset": {
      const [t, c] = await Promise.all([import("./admin-login-reset.tpl"), import("./admin-login-reset")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-market": {
      const [t, c] = await Promise.all([import("./admin-market.tpl"), import("./admin-market")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-media": {
      const [t, c] = await Promise.all([import("./admin-media.tpl"), import("./admin-media")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-mockup": {
      const [t, c] = await Promise.all([import("./admin-mockup.tpl"), import("./admin-mockup")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-newsletter": {
      const [t, c] = await Promise.all([import("./admin-newsletter.tpl"), import("./admin-newsletter")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-notif": {
      const [t, c] = await Promise.all([import("./admin-notif.tpl"), import("./admin-notif")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-overview": {
      const [t, c] = await Promise.all([import("./admin-overview.tpl"), import("./admin-overview")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-reports": {
      const [t, c] = await Promise.all([import("./admin-reports.tpl"), import("./admin-reports")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-roles": {
      const [t, c] = await Promise.all([import("./admin-roles.tpl"), import("./admin-roles")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-search": {
      const [t, c] = await Promise.all([import("./admin-search.tpl"), import("./admin-search")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-search-results": {
      const [t, c] = await Promise.all([import("./admin-search-results.tpl"), import("./admin-search-results")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-settings": {
      const [t, c] = await Promise.all([import("./admin-settings.tpl"), import("./admin-settings")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-symbol": {
      const [t, c] = await Promise.all([import("./admin-symbol.tpl"), import("./admin-symbol")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-sys-states": {
      const [t, c] = await Promise.all([import("./admin-sys-states.tpl"), import("./admin-sys-states")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-users": {
      const [t, c] = await Promise.all([import("./admin-users.tpl"), import("./admin-users")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "admin-versions": {
      const [t, c] = await Promise.all([import("./admin-versions.tpl"), import("./admin-versions")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-01": {
      const [t, c] = await Promise.all([import("./app-01.tpl"), import("./app-01")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-02": {
      const [t, c] = await Promise.all([import("./app-02.tpl"), import("./app-02")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-03": {
      const [t, c] = await Promise.all([import("./app-03.tpl"), import("./app-03")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-04": {
      const [t, c] = await Promise.all([import("./app-04.tpl"), import("./app-04")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-05": {
      const [t, c] = await Promise.all([import("./app-05.tpl"), import("./app-05")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-06": {
      const [t, c] = await Promise.all([import("./app-06.tpl"), import("./app-06")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-07": {
      const [t, c] = await Promise.all([import("./app-07.tpl"), import("./app-07")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-08": {
      const [t, c] = await Promise.all([import("./app-08.tpl"), import("./app-08")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-09": {
      const [t, c] = await Promise.all([import("./app-09.tpl"), import("./app-09")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-10": {
      const [t, c] = await Promise.all([import("./app-10.tpl"), import("./app-10")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-11": {
      const [t, c] = await Promise.all([import("./app-11.tpl"), import("./app-11")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-12": {
      const [t, c] = await Promise.all([import("./app-12.tpl"), import("./app-12")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-13": {
      const [t, c] = await Promise.all([import("./app-13.tpl"), import("./app-13")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-14": {
      const [t, c] = await Promise.all([import("./app-14.tpl"), import("./app-14")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-15": {
      const [t, c] = await Promise.all([import("./app-15.tpl"), import("./app-15")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-16": {
      const [t, c] = await Promise.all([import("./app-16.tpl"), import("./app-16")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-17": {
      const [t, c] = await Promise.all([import("./app-17.tpl"), import("./app-17")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-18": {
      const [t, c] = await Promise.all([import("./app-18.tpl"), import("./app-18")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-19": {
      const [t, c] = await Promise.all([import("./app-19.tpl"), import("./app-19")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-20": {
      const [t, c] = await Promise.all([import("./app-20.tpl"), import("./app-20")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-21": {
      const [t, c] = await Promise.all([import("./app-21.tpl"), import("./app-21")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-22": {
      const [t, c] = await Promise.all([import("./app-22.tpl"), import("./app-22")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-23": {
      const [t, c] = await Promise.all([import("./app-23.tpl"), import("./app-23")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-24": {
      const [t, c] = await Promise.all([import("./app-24.tpl"), import("./app-24")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-25": {
      const [t, c] = await Promise.all([import("./app-25.tpl"), import("./app-25")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-26": {
      const [t, c] = await Promise.all([import("./app-26.tpl"), import("./app-26")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-27": {
      const [t, c] = await Promise.all([import("./app-27.tpl"), import("./app-27")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-28": {
      const [t, c] = await Promise.all([import("./app-28.tpl"), import("./app-28")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-29": {
      const [t, c] = await Promise.all([import("./app-29.tpl"), import("./app-29")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-30": {
      const [t, c] = await Promise.all([import("./app-30.tpl"), import("./app-30")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-31": {
      const [t, c] = await Promise.all([import("./app-31.tpl"), import("./app-31")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "app-32": {
      const [t, c] = await Promise.all([import("./app-32.tpl"), import("./app-32")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-cari": {
      const [t, c] = await Promise.all([import("./web-cari.tpl"), import("./web-cari")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-market-detail": {
      const [t, c] = await Promise.all([import("./web-market-detail.tpl"), import("./web-market-detail")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-kalender": {
      const [t, c] = await Promise.all([import("./web-kalender.tpl"), import("./web-kalender")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-market": {
      const [t, c] = await Promise.all([import("./web-market.tpl"), import("./web-market")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-kategori": {
      const [t, c] = await Promise.all([import("./web-kategori.tpl"), import("./web-kategori")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-berita": {
      const [t, c] = await Promise.all([import("./web-berita.tpl"), import("./web-berita")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-home": {
      const [t, c] = await Promise.all([import("./web-home.tpl"), import("./web-home")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-akun": {
      const [t, c] = await Promise.all([import("./web-akun.tpl"), import("./web-akun")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-bantuan": {
      const [t, c] = await Promise.all([import("./web-bantuan.tpl"), import("./web-bantuan")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-error": {
      const [t, c] = await Promise.all([import("./web-error.tpl"), import("./web-error")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-iklan": {
      const [t, c] = await Promise.all([import("./web-iklan.tpl"), import("./web-iklan")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-legal": {
      const [t, c] = await Promise.all([import("./web-legal.tpl"), import("./web-legal")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-live": {
      const [t, c] = await Promise.all([import("./web-live.tpl"), import("./web-live")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-login": {
      const [t, c] = await Promise.all([import("./web-login.tpl"), import("./web-login")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-newsletter": {
      const [t, c] = await Promise.all([import("./web-newsletter.tpl"), import("./web-newsletter")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-penulis": {
      const [t, c] = await Promise.all([import("./web-penulis.tpl"), import("./web-penulis")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-screener": {
      const [t, c] = await Promise.all([import("./web-screener.tpl"), import("./web-screener")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-short": {
      const [t, c] = await Promise.all([import("./web-short.tpl"), import("./web-short")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-tentang": {
      const [t, c] = await Promise.all([import("./web-tentang.tpl"), import("./web-tentang")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-topik": {
      const [t, c] = await Promise.all([import("./web-topik.tpl"), import("./web-topik")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
    case "web-watchlist": {
      const [t, c] = await Promise.all([import("./web-watchlist.tpl"), import("./web-watchlist")]);
      return { kind: t.kind, title: t.title, css: t.css, html: t.html, Component: c.default };
    }
  }
}
