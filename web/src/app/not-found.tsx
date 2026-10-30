import { getLayout } from "@/lib/layout";
import { matchRoute, prepare } from "@/dc/pages";

/** 404 memakai artboard "404 / Error / Offline" (web) atau "Error / Offline" (app), dengan data live. */
export default async function NotFound() {
  const p = await prepare(matchRoute(["offline"])!, await getLayout(), {});
  const Board = p.board.Component;
  return <Board tpl={p.html} css={p.board.css} kind={p.board.kind} enhance={p.enhance} ctx={p.ctx} />;
}
