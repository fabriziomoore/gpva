import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const clientDir = "dist/client";
const capacitorDir = "dist/capacitor";

if (!existsSync(clientDir)) {
  console.error(`TanStack client build not found: ${clientDir}`);
  process.exit(1);
}

const assetsDir = join(clientDir, "assets");
const assets = readdirSync(assetsDir);
const entry = assets.find((file) => /^index-[\w-]+\.js$/.test(file));
const stylesheet = assets.find((file) => /^styles-[\w-]+\.css$/.test(file));

if (!entry) {
  console.error("Could not locate the Vite client entry asset (index-*.js).");
  process.exit(1);
}

rmSync(capacitorDir, { recursive: true, force: true });
mkdirSync(capacitorDir, { recursive: true });
cpSync(clientDir, capacitorDir, { recursive: true });

const cssLink = stylesheet
  ? `    <link rel="stylesheet" href="./assets/${stylesheet}" />\n`
  : "";

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#1a1d24" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>GPVA</title>
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="apple-touch-icon" href="./apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="./icon-192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="./icon-512.png" />
${cssLink}    <script>
      (() => {
        try {
          var theme = localStorage.getItem('gpva.theme');
          if (theme !== 'light' && theme !== 'dark') theme = 'dark';
          document.documentElement.classList.toggle('dark', theme === 'dark');
          document.documentElement.style.colorScheme = theme;
        } catch (_) {
          document.documentElement.classList.add('dark');
        }
      })();
    </script>
    <script type="module" src="./assets/${entry}"></script>
  </head>
  <body></body>
</html>
`;

writeFileSync(join(capacitorDir, "index.html"), html);
writeFileSync(join(capacitorDir, "404.html"), html);

console.log(`Capacitor SPA generated at ${capacitorDir}/index.html`);