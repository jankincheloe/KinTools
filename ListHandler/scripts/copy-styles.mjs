import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "dist");
mkdirSync(outputDirectory, { recursive: true });
copyFileSync(resolve(packageRoot, "src/styles.css"), resolve(outputDirectory, "styles.css"));
