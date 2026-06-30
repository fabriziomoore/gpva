import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const rootDir = process.cwd();
const capacitorDir = resolve(rootDir, "dist/capacitor");
const tempHtml = resolve(rootDir, "capacitor-index.html");

// Mobile is intentionally built as an independent browser SPA. It must never
// copy TanStack Start/Nitro output or hydrate an SSR shell, because the Android
// WebView has no server-rendered $_TSR payload.
const html = `<!doctype html>
<html lang="pt-BR" class="dark" style="color-scheme: dark;">
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
    <script type="module" src="/src/capacitor-entry.tsx"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

rmSync(capacitorDir, { recursive: true, force: true });
writeFileSync(tempHtml, html);

try {
  await viteBuild({
    configFile: false,
    root: rootDir,
    publicDir: resolve(rootDir, "public"),
    base: "./",
    mode: "production",
    envPrefix: "VITE_",
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    resolve: {
      alias: [
        {
          find: /^@\/integrations\/supabase\/client$/,
          replacement: resolve(rootDir, "src/integrations/supabase/client.mobile.ts"),
        },
        { find: "@", replacement: resolve(rootDir, "src") },
      ],
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "import.meta.env.SSR": "false",
    },
    build: {
      outDir: capacitorDir,
      emptyOutDir: true,
      target: "es2020",
      sourcemap: false,
      minify: true,
      rollupOptions: {
        input: tempHtml,
      },
    },
  });
} finally {
  rmSync(tempHtml, { force: true });
}

const generatedHtml = join(capacitorDir, "capacitor-index.html");
if (existsSync(generatedHtml)) {
  renameSync(generatedHtml, join(capacitorDir, "index.html"));
}
writeFileSync(join(capacitorDir, "404.html"), readFileSync(join(capacitorDir, "index.html"), "utf8"));

const forbiddenPatterns = [
  { pattern: /\bprocess\s*\./, label: "process.*" },
  { pattern: /process\.env/, label: "process.env" },
  { pattern: /node:async_hooks/, label: "node:async_hooks" },
  { pattern: /hydrateRoot/, label: "hydrateRoot" },
  { pattern: /\$_TSR/, label: "window.$_TSR" },
  { pattern: /_serverFn/, label: "server functions runtime" },
];

const assetsDir = join(capacitorDir, "assets");
if (existsSync(assetsDir)) {
  for (const file of readdirSync(assetsDir)) {
    if (!file.endsWith(".js")) continue;
    const content = readFileSync(join(assetsDir, file), "utf8");
    const hit = forbiddenPatterns.find(({ pattern }) => pattern.test(content));
    if (hit) {
      console.error(`Capacitor bundle contains forbidden ${hit.label} reference in assets/${file}`);
      process.exit(1);
    }
  }
}

console.log(`Capacitor SPA generated at ${capacitorDir}/index.html`);