import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const clientDir = "dist/client";
const capacitorDir = "dist/capacitor";

if (!existsSync(clientDir)) {
  console.error(`TanStack client build not found: ${clientDir}`);
  process.exit(1);
}

const assetsDir = join(clientDir, "assets");
const assets = readdirSync(assetsDir);
const stylesheet = assets.find((file) => /^styles-[\w-]+\.css$/.test(file));

rmSync(capacitorDir, { recursive: true, force: true });
mkdirSync(capacitorDir, { recursive: true });
cpSync(clientDir, capacitorDir, { recursive: true });

// Remove TanStack Start's SSR-hydrating client entries — they call
// hydrateRoot(document, ...) and rely on window.$_TSR injected by the SSR
// renderer. Inside the Capacitor WebView there is no SSR shell, so those
// entries throw "Invariant failed" before the first frame paints.
const capacitorAssetsDir = join(capacitorDir, "assets");
for (const file of readdirSync(capacitorAssetsDir)) {
  if (/^index-[\w-]+\.js$/.test(file)) {
    rmSync(join(capacitorAssetsDir, file));
  }
}

// Bundle a Capacitor-specific SPA entry that mounts the router with
// createRoot — no SSR markup required.
const cssHref = stylesheet ? `./assets/${stylesheet}` : "";

const stubUrlImports = {
  name: "stub-url-and-asset-imports",
  setup(buildApi) {
    // `import x from "./foo.css?url"` → exports the prebuilt stylesheet URL.
    buildApi.onResolve({ filter: /\?url$/ }, (args) => ({
      path: args.path,
      namespace: "stub-url",
    }));
    buildApi.onLoad({ filter: /.*/, namespace: "stub-url" }, () => ({
      contents: `export default ${JSON.stringify(cssHref)};`,
      loader: "js",
    }));
    // Raw CSS imports (e.g. side-effect imports) become no-ops; the
    // stylesheet is already linked from index.html.
    buildApi.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    // Asset imports resolve to relative URLs under ./assets/.
    buildApi.onLoad({ filter: /\.(png|jpg|jpeg|gif|svg|webp|avif|ico)$/ }, (args) => {
      const name = args.path.split(/[\\/]/).pop();
      return {
        contents: `export default ${JSON.stringify(`./assets/${name}`)};`,
        loader: "js",
      };
    });
    // Stub node:async_hooks — pulled in by @tanstack/start-storage-context,
    // unused in the browser. A minimal AsyncLocalStorage shim is enough for
    // the router to construct without crashing.
    buildApi.onResolve({ filter: /^node:async_hooks$/ }, (args) => ({
      path: args.path,
      namespace: "stub-async-hooks",
    }));
    buildApi.onLoad({ filter: /.*/, namespace: "stub-async-hooks" }, () => ({
      contents: `export class AsyncLocalStorage {
  constructor(){this._s=undefined}
  getStore(){return this._s}
  run(s,cb,...a){const p=this._s;this._s=s;try{return cb(...a)}finally{this._s=p}}
  enterWith(s){this._s=s}
  exit(cb,...a){const p=this._s;this._s=undefined;try{return cb(...a)}finally{this._s=p}}
  disable(){this._s=undefined}
}
export class AsyncResource { runInAsyncScope(fn,thisArg,...a){return fn.apply(thisArg,a)} }
export default { AsyncLocalStorage, AsyncResource };`,
      loader: "js",
    }));
  },
};

await build({
  entryPoints: { "capacitor-entry": "src/capacitor-entry.tsx" },
  outdir: capacitorAssetsDir,
  bundle: true,
  format: "esm",
  splitting: false,
  target: "es2020",
  platform: "browser",
  minify: true,
  sourcemap: false,
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "import.meta.env.SSR": "false",
    "import.meta.env.PROD": "true",
    "import.meta.env.DEV": "false",
    "import.meta.env.MODE": JSON.stringify("production"),
    "import.meta.env.BASE_URL": JSON.stringify("/"),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL ?? ""),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    ),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
      process.env.VITE_SUPABASE_PROJECT_ID ?? "",
    ),
  },
  alias: {
    "@": resolve("src"),
  },
  loader: { ".json": "json" },
  plugins: [stubUrlImports],
  logLevel: "info",
});

const cssLink = cssHref ? `    <link rel="stylesheet" href="${cssHref}" />\n` : "";

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
    <script type="module" src="./assets/capacitor-entry.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

writeFileSync(join(capacitorDir, "index.html"), html);
writeFileSync(join(capacitorDir, "404.html"), html);

console.log(`Capacitor SPA generated at ${capacitorDir}/index.html`);