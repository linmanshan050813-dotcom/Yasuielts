import * as esbuild from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const publicDir = resolve(root, "dist/public");

mkdirSync(publicDir, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(root, "src/web/app.ts")],
  bundle: true,
  minify: true,
  splitting: true,
  format: "esm",
  outdir: publicDir,
  chunkNames: "[name]-[hash]",
  entryNames: "[name]",
  target: ["es2022"],
  sourcemap: false,
});

const css = readFileSync(resolve(root, "src/web/styles.css"), "utf-8");
writeFileSync(resolve(publicDir, "app.css"), css);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>雅速雅思 · 作文批改</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600&family=Sora:wght@400;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/grading/app.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/grading/app.js"></script>
</body>
</html>`;
writeFileSync(resolve(publicDir, "index.html"), html);

console.log("Frontend built to dist/public");
