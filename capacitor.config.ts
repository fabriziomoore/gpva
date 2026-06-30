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
      // "native" delega o redimensionamento ao adjustResize do Android e
      // desativa o scroll-assist JS do plugin. Com "none" + adjustResize, o
      // plugin tentava reposicionar o input em loop enquanto o IME ainda
      // negociava a InputConnection, bloqueando a UI thread (freeze ao focar
      // qualquer campo de texto).
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;