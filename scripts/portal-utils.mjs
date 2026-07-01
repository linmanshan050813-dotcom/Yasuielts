import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

function patchPortalHtml(html) {
  const oldLink = 'href=\\"作文批改上传页.dc.html\\"';
  const newLink = 'href=\\"/grading\\"';

  if (html.includes(oldLink)) {
    html = html.replace(oldLink, newLink);
  } else if (!html.includes(newLink)) {
    throw new Error("Expected portal grading link not found.");
  }

  return html.replace(
    "<title>Bundled Page</title>",
    "<title>雅速雅思 · 学雅思来雅速</title>",
  );
}

export function resolvePortalPaths(root) {
  return {
    source: resolve(
      process.env.PORTAL_SOURCE ??
        resolve(root, "apps/website/source/portal-offline.html"),
    ),
    dest: resolve(root, "apps/website/public/index.html"),
  };
}

export function ensurePortalIndex(root) {
  const { source, dest } = resolvePortalPaths(root);

  if (!existsSync(source)) {
    throw new Error(`Portal source not found: ${source}`);
  }

  mkdirSync(dirname(dest), { recursive: true });

  let html = readFileSync(source, "utf8");
  html = patchPortalHtml(html);
  validateBundle(html);
  writeFileSync(dest, html);

  const sizeMb = (readFileSync(dest).length / 1024 / 1024).toFixed(1);
  console.log(`Portal ready: ${dest} (${sizeMb} MB, bundle JSON valid)`);
  return dest;
}
