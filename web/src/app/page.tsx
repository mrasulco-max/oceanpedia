import { api, safe } from "@/lib/api";
import { getLayout } from "@/lib/layout";
import { WebShell } from "@/components/web/WebShell";
import { HomeWeb } from "@/components/home/HomeWeb";
import { HomeApp } from "@/components/home/HomeApp";
import type { HomeData } from "@/lib/types";

export const revalidate = 30;

const EMPTY: HomeData = { top_story: null, latest: [], most_read: [], sections: [] };
const LIVE = ["IHSG", "LQ45", "BTCUSD", "ETHUSD", "XAUUSD", "USDIDR"];

export default async function HomePage() {
  const layout = await getLayout();
  const [home, quotes, events, slots, cats] = await Promise.all([
    safe(api.home(), EMPTY),
    safe(api.quotes(LIVE), { data: [] }),
    safe(api.events(), { data: [] }),
    safe(api.ads(layout, "home"), { data: [] }),
    safe(api.categories(), { data: [] }),
  ]);
  if (layout === "app") {
    return <HomeApp home={home} quotes={quotes.data} events={events.data} slots={slots.data} categories={cats.data} />;
  }
  return (
    <WebShell active="home">
      <HomeWeb home={home} quotes={quotes.data} events={events.data} slots={slots.data} />
    </WebShell>
  );
}
