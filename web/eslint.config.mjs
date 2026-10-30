import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  // Modul hasil generator dari artboard desain (scripts/gen_boards.py).
  { ignores: ["src/boards/gen/**", "design/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
