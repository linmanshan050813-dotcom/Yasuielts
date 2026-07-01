import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "public");
const moduleRoot = resolve(root, "modules/essay-grading");

console.log("Building essay-grading module...");
execSync("npm run build -w @yasu/essay-grading", { cwd: root, stdio: "inherit" });

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

const portalSrc = resolve(root, "apps/website/public/index.html");
const gradingSrc = resolve(moduleRoot, "dist/public");
const mockSrc = resolve(moduleRoot, "mock");

if (!existsSync(portalSrc)) {
  console.log("Portal index missing, running prepare-portal...");
  execSync("node scripts/prepare-portal.mjs", { cwd: root, stdio: "inherit" });
}

cpSync(portalSrc, resolve(publicDir, "index.html"));
cpSync(gradingSrc, resolve(publicDir, "grading"), { recursive: true });
cpSync(mockSrc, resolve(publicDir, "mock"), { recursive: true });

console.log("Vercel static output ready in public/");
