import { existsSync } from "node:fs";

const webDir = ".output/public";

if (!existsSync(webDir)) {
  console.error(
    `Capacitor webDir not found: ${webDir}. Run npm run build before syncing.`,
  );
  process.exit(1);
}

if (!existsSync(`${webDir}/index.html`)) {
  console.error(
    `Capacitor webDir exists but index.html was not found in ${webDir}.`,
  );
  process.exit(1);
}

console.log(`Capacitor webDir verified: ${webDir}`);