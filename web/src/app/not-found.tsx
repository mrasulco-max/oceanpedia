import { loadBoard } from "@/boards/gen/registry";
import { getLayout } from "@/lib/layout";

/** 404 memakai artboard "404 / Error / Offline" (web) atau "Error / Offline" (app). */
export default async function NotFound() {
  const layout = await getLayout();
  const b = await loadBoard(layout === "app" ? "app-23" : "web-error");
  const Board = b.Component;
  return <Board tpl={b.html} css={b.css} kind={b.kind} />;
}
