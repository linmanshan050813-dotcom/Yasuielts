import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePortalIndex } from "./portal-utils.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  ensurePortalIndex(root);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
