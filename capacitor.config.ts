import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.gpva",
  appName: "GPVA",
  webDir: "dist/capacitor",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    Keyboard: {
      resize: "none",
      resizeOnFullScreen: true,
    },
  },
};

export default config;