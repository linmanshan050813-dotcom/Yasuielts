import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcPrompts = resolve(root, "src/grading/prompts");
const destPrompts = resolve(root, "dist/grading/prompts");

mkdirSync(destPrompts, { recursive: true });
cpSync(srcPrompts, destPrompts, { recursive: true });
console.log("Copied prompts to dist/grading/prompts");
