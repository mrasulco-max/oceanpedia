import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

const TABS = [
  { href: "/", label: "Beranda", icon: "home", key: "home" },
  { href: "/market/IHSG", label: "Market", icon: "trend", key: "market" },
  { href: "/cari", label: "Cari", icon: "search", key: "cari" },
  { href: "/watchlist", label: "Watchlist", icon: "star", key: "watchlist" },
  { href: "/akun", label: "Akun", icon: "user", key: "akun" },
];

interface Props {
  active?: string;
  title?: string;
  back?: string;
  right?: React.ReactNode;
  hideNav?: boolean;
  children: React.ReactNode;
}

/** Kerangka UI app untuk ponsel: header ringkas + bottom navigation. */
export function AppShell({ active, title, back, right, hideNav, children }: Props) {
  return (
    <div className="a-shell">
      <a href="#konten" className="sr-only">Langsung ke konten</a>
      <header className="a-top">
        {back ? (
          <Link href={back} className="ring" aria-label="Kembali"><Icon name="left" size={20} stroke={2} /></Link>
        ) : (
          <Link href="/" aria-label="OceanBird beranda"><Image src="/logo.png" alt="OceanBird" width={118} height={24} priority /></Link>
        )}
        {title ? <h1 style={{ fontSize: 18 }}>{title}</h1> : null}
        <span className="grow" />
        {right ?? (
          <>
            <Link href="/kalender" className="ring" aria-label="Kalender ekonomi"><Icon name="calendar" /></Link>
            <Link href="/notifikasi" className="ring" aria-label="Notifikasi"><Icon name="bell" /></Link>
          </>
        )}
      </header>
      <main id="konten">{children}</main>
      {!hideNav && (
        <nav className="a-nav" aria-label="Navigasi aplikasi">
          {TABS.map((t) => (
            <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined}>
              <span className="pill"><Icon name={t.icon} size={22} /></span>
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
