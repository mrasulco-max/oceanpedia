// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
"use client";

import DCBoard, { type BoardProps } from "@/dc/DCBoard";
import Logic from "./admin-login-2-f-a.logic";

export default function Board(props: BoardProps) {
  return <DCBoard Logic={Logic} {...props} />;
}
