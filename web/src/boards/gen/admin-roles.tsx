// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
"use client";

import DCBoard, { type BoardProps } from "@/dc/DCBoard";
import Logic from "./admin-roles.logic";

export default function Board(props: BoardProps) {
  return <DCBoard Logic={Logic} {...props} />;
}
