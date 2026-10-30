import Image from "next/image";
import Link from "next/link";
import { api, safe } from "@/lib/api";
import { formatPrice, formatToday } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Change } from "@/components/ui/Change";

const NAV = [
  { href: "/", label: "Home", key: "home" },
  { href: "/market/IHSG", label: "Market", key: "market" },
  { href: "/kategori/saham", label: "Kategori", key: "kategori" },
  { href: "/short", label: "Ocean Short", key: "short" },
  { href: "/kalender", label: "Kalender", key: "kalender" },
];
const TICKER = ["IHSG", "LQ45", "BBCA", "BBRI", "BTCUSD", "ETHUSD", "XAUUSD", "USDIDR"];

export async function WebShell({ active, children }: { active?: string; children: React.ReactNode }) {
  const quotes = await safe(api.quotes(TICKER), { data: [] });
  const items = quotes.data.filter((q) => q.quote);
  return (
    <>
      <a href="#konten" className="sr-only">Langsung ke konten</a>
      <div className="w-util">
        <div className="w-wrap">
          <span>{formatToday()}</span>
          <span className="sep" />
          <span className="grow" />
          <a href="mailto:help@jalaexplorer.com" style={{ display: "flex", gap: 6, alignItems: "center" }}><Icon name="mail" size={14} />help@jalaexplorer.com</a>
          <Link href="/pasang-iklan">Pasang iklan</Link>
        </div>
      </div>
      <header className="w-head">
        <div className="w-wrap">
          <Link href="/" className="logo" aria-label="OceanBird beranda">
            <Image src="/logo.png" alt="OceanBird" width={138} height={28} priority />
          </Link>
          <nav className="w-nav" aria-label="Navigasi utama">
            {NAV.map((n) => (
              <Link key={n.key} href={n.href} aria-current={active === n.key ? "page" : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div className="right">
            <Link href="/cari" className="icon-btn" aria-label="Cari"><Icon name="search" size={21} /></Link>
            <Link href="/notifikasi" className="icon-btn" aria-label="Notifikasi"><Icon name="bell" size={21} /></Link>
            <Link href="/masuk" className="icon-btn" aria-label="Masuk"><Icon name="user" size={21} /></Link>
            <Link href="/plus" className="btn grad" style={{ height: 42, marginLeft: 6 }}><Icon name="spark" size={16} />Plus</Link>
          </div>
        </div>
      </header>
      {items.length > 0 && (
        <div className="w-ticker" aria-label="Harga pasar">
          <span className="lbl"><span className="live-dot" />LIVE MARKET</span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div className="marq">
              {[...items, ...items].map((q, i) => (
                <Link key={i} href={`/market/${q.instrument.symbol}`} aria-hidden={i >= items.length || undefined} tabIndex={i >= items.length ? -1 : undefined}>
                  <strong style={{ fontWeight: 500 }}>{q.instrument.symbol}</strong>
                  <span className="mono">{formatPrice(q.quote!.price, q.instrument.currency)}</span>
                  <Change pct={q.quote!.change_percent} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <main id="konten">{children}</main>
      <WebFooter />
    </>
  );
}

function WebFooter() {
  return (
    <footer className="w-footer">
      <div className="w-wrap">
        <div className="cols">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Image src="/logo.png" alt="OceanBird" width={138} height={28} />
            <span>Berita & data pasar saham IDX, komoditas, crypto, dan forex.</span>
            <span><strong>PT Nusantara Entertainment Asia</strong><br />Menara Cakrawala Lt. 12 Unit A05, Jakarta Pusat<br />help@jalaexplorer.com · +62 882 0223 95690</span>
          </div>
          <FooterCol title="Kategori" links={[["Saham", "/kategori/saham"], ["Komoditas", "/kategori/komoditas"], ["Crypto", "/kategori/crypto"], ["Forex", "/kategori/forex"], ["Ekonomi", "/kategori/ekonomi"]]} />
          <FooterCol title="Perusahaan" links={[["Tentang kami", "/tentang"], ["Pasang iklan", "/pasang-iklan"], ["Ocean Pedia Plus", "/plus"], ["Kontak", "mailto:corpcom@jalaexplorer.com"]]} />
          <FooterCol title="Bantuan" links={[["Syarat & Ketentuan", "/legal#syarat"], ["Kebijakan Privasi", "/legal#privasi"], ["Disclaimer", "/legal#disclaimer"]]} />
        </div>
        <div className="bottom">
          <span>© {new Date().getFullYear()} OceanBird · bagian dari ekosistem JALA Explorer. Data harga oleh Twelve Data, dapat tertunda.</span>
          <span>Konten bersifat informasi, bukan ajakan membeli atau menjual efek maupun aset kripto.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <strong>{title}</strong>
      {links.map(([l, h]) => <Link key={l} href={h}>{l}</Link>)}
    </div>
  );
}
