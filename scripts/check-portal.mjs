import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const portal = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/website/public/index.html");
const html = readFileSync(portal, "utf8");

const tIdx = html.indexOf('script type="__bundler/template"');
const start = html.indexOf(">", tIdx) + 1;
const end = html.lastIndexOf("</script>");
JSON.parse(html.slice(start, end));

console.log("Portal bundle JSON valid");
console.log("Grading link patched:", html.includes('href=\\"/grading\\"'));
