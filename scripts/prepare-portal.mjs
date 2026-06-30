import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSrc = resolve(
  process.env.PORTAL_SOURCE ??
    "C:/Users/hp/Downloads/雅速雅思门户-离线版.html",
);
const dest = resolve(root, "apps/website/public/index.html");

if (!existsSync(defaultSrc)) {
  console.error(`Portal source not found: ${defaultSrc}`);
  process.exit(1);
}

function extractTemplateJson(html) {
  const marker = 'script type="__bundler/template"';
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf(">", i) + 1;
  const end = html.lastIndexOf("</script>");
  return html.slice(start, end);
}

function validateBundle(html) {
  const templateRaw = extractTemplateJson(html);
  if (!templateRaw) throw new Error("Missing __bundler/template script");
  JSON.parse(templateRaw);
}

mkdirSync(dirname(dest), { recursive: true });

let html = readFileSync(defaultSrc, "utf8");

// JSON bundle stores quotes as \\\" — must preserve escaping when patching.
const oldLink = 'href=\\"作文批改上传页.dc.html\\"';
const newLink = 'href=\\"/grading\\"';

if (html.includes(oldLink)) {
  html = html.replace(oldLink, newLink);
} else if (html.includes(newLink)) {
  console.log("Portal link already points to /grading.");
} else {
  console.error("Expected portal grading link not found.");
  process.exit(1);
}

html = html.replace("<title>Bundled Page</title>", "<title>雅速雅思 · 学雅思来雅速</title>");

try {
  validateBundle(html);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Bundle validation failed after patch: ${message}`);
  process.exit(1);
}

writeFileSync(dest, html);
const sizeMb = (readFileSync(dest).length / 1024 / 1024).toFixed(1);
console.log(`Portal ready: ${dest} (${sizeMb} MB, bundle JSON valid)`);
