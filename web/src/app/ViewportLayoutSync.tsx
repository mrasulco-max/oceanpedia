"use client";

import { useEffect } from "react";
import { LAYOUT_COOKIE, LAYOUT_VP_COOKIE, VP_APP_MAX, VP_WEB_MIN } from "@/lib/device";

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function setSessionCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Menyelaraskan UI dengan lebar jendela: sempit → artboard app, lebar → website.
 * Tidak menimpa pilihan eksplisit (?layout= / cookie ob_layout).
 */
export default function ViewportLayoutSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reloading = false;

    const sync = () => {
      if (reloading) return;
      // Pilihan eksplisit pengguna menang; jangan otomatis mengganti.
      const forced = readCookie(LAYOUT_COOKIE);
      if (forced === "web" || forced === "app") return;

      const w = window.innerWidth;
      const vp = readCookie(LAYOUT_VP_COOKIE);

      if (w <= VP_APP_MAX) {
        if (vp !== "app") {
          reloading = true;
          setSessionCookie(LAYOUT_VP_COOKIE, "app");
          location.reload();
        }
        return;
      }
      if (w >= VP_WEB_MIN && vp === "app") {
        reloading = true;
        clearCookie(LAYOUT_VP_COOKIE);
        location.reload();
      }
    };

    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(sync, 180);
    };

    sync();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return null;
}
