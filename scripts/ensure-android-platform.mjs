import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const hasAndroidPlatform =
  existsSync("android/settings.gradle") && existsSync("android/app/build.gradle");

if (hasAndroidPlatform) {
  console.log("Android platform already configured.");
  process.exit(0);
}

const result = spawnSync("npx", ["cap", "add", "android"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);