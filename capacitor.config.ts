import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.gpva",
  appName: "GPVA",
  webDir: "mobile/dist",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#1a1d24",
    },
  },
};

export default config;