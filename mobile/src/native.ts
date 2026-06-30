import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import type { Router } from "@tanstack/react-router";

// Native lifecycle wiring for the Android shell. Pure plugin usage — no
// WebView hacks, no DOM listeners on focus, no JS-driven layout work.
export function initNative(router: Router<any, any>) {
  if (!Capacitor.isNativePlatform()) return;

  // Status bar matches the dark theme; resize behavior delegated to Android.
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  void StatusBar.setBackgroundColor({ color: "#1a1d24" }).catch(() => undefined);

  // Keyboard plugin: let Android handle the resize natively. We only enable
  // accessory bar removal on iOS — no listeners attached on Android.
  void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined);

  // Hide splash once the app has bootstrapped React.
  void SplashScreen.hide().catch(() => undefined);

  // Hardware back button → router history. On root, close the app.
  void App.addListener("backButton", () => {
    const history = router.history;
    if (history.length > 1) history.back();
    else void App.exitApp();
  });
}