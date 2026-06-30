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
      // No Android, a opção "resize" é ignorada pelo plugin Keyboard; ela só
      // existe para iOS. O congelamento ao focar inputs vinha do workaround
      // Android "resizeOnFullScreen": ele instala callbacks de WindowInsets e
      // chama requestLayout() durante a animação do teclado, competindo com o
      // adjustResize nativo. Mantemos o redimensionamento 100% no Android.
      resize: "native",
      resizeOnFullScreen: false,
    },
  },
};

export default config;