import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.gpva",
  appName: "GPVA",
  webDir: "mobile/dist",
  bundledWebRuntime: false,
  server: {
    // Permite que o WebView carregue estes domínios externos (iframe do ArcGIS).
    allowNavigation: [
      "arcgis.aegea.com.br",
      "*.arcgis.com",
      "*.arcgisonline.com",
      "login.microsoftonline.com",
      "*.microsoftonline.com",
    ],
  },
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
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#1a1d24",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
  },
};

export default config;