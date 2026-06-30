import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");

// Standalone Vite SPA for Android (Capacitor). No TanStack Start, no SSR,
// no router file-based plugin. Routes are wired in code under mobile/src.
// The web `src/` tree is reused via the @/ alias.
export default defineConfig({
  root: __dirname,
  base: "./",
  envDir: projectRoot,
  publicDir: resolve(projectRoot, "public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // Replace the web Supabase client (which references process.env for SSR
      // fallback) with the mobile-safe version that uses only import.meta.env.
      {
        find: /^@\/integrations\/supabase\/client$/,
        replacement: resolve(srcDir, "integrations/supabase/client.mobile.ts"),
      },
      { find: "@", replacement: srcDir },
    ],
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
  },
});