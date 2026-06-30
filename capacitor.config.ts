import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.gpva",
  appName: "GPVA",
  webDir: "dist/capacitor",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    captureInput: true,
    initialFocus: false,
  },
  ios: {
    contentInset: "always",
  },
  plugins: {},
};

export default config;