/* eslint-disable @typescript-eslint/no-explicit-any */
// Code-based route tree for the Android (Capacitor) SPA. Reuses every
// component defined in src/routes/** without forking — only /admin is
// excluded because it depends on TanStack Start server functions.

import { Route as rootRoute } from "./root-route";
import { Route as AuthRoute } from "@/routes/auth";
import { Route as AuthenticatedRoute } from "@/routes/_authenticated/route";
import { Route as IndexRoute } from "@/routes/_authenticated/index";
import { Route as OnboardingRoute } from "@/routes/_authenticated/onboarding";
import { Route as ShiftRoute } from "@/routes/_authenticated/shift";
import { Route as ProductivityRoute } from "@/routes/_authenticated/productivity";
import { Route as SettingsRoute } from "@/routes/_authenticated/settings";
import { Route as VariableRoute } from "@/routes/_authenticated/variable";
import { Route as ShiftReportRoute } from "@/routes/_authenticated/shift_.$id.report";
import { Route as LeaderRoute } from "@/routes/_authenticated/leader";
import { Route as LeaderConfigRoute } from "@/routes/_authenticated/leader-config";
import { Route as AdminRoute } from "@/routes/admin";

// Rebind parents. The original `createFileRoute("/path")` calls produce
// route objects whose parent is resolved later via `_addFileChildren`.
const auth = (AuthRoute as any).update({
  id: "/auth",
  path: "/auth",
  getParentRoute: () => rootRoute,
});

const admin = (AdminRoute as any).update({
  id: "/admin",
  path: "/admin",
  getParentRoute: () => rootRoute,
});

const authenticated = (AuthenticatedRoute as any).update({
  id: "/_authenticated",
  getParentRoute: () => rootRoute,
});

const index = (IndexRoute as any).update({
  id: "/",
  path: "/",
  getParentRoute: () => authenticated,
});

const onboarding = (OnboardingRoute as any).update({
  id: "/onboarding",
  path: "/onboarding",
  getParentRoute: () => authenticated,
});

const shift = (ShiftRoute as any).update({
  id: "/shift",
  path: "/shift",
  getParentRoute: () => authenticated,
});

const productivity = (ProductivityRoute as any).update({
  id: "/productivity",
  path: "/productivity",
  getParentRoute: () => authenticated,
});

const settings = (SettingsRoute as any).update({
  id: "/settings",
  path: "/settings",
  getParentRoute: () => authenticated,
});

const variable = (VariableRoute as any).update({
  id: "/variable",
  path: "/variable",
  getParentRoute: () => authenticated,
});

const shiftReport = (ShiftReportRoute as any).update({
  id: "/shift_/$id/report",
  path: "/shift/$id/report",
  getParentRoute: () => authenticated,
});

const leader = (LeaderRoute as any).update({
  id: "/leader",
  path: "/leader",
  getParentRoute: () => authenticated,
});

const leaderConfig = (LeaderConfigRoute as any).update({
  id: "/leader-config",
  path: "/leader-config",
  getParentRoute: () => authenticated,
});

const authenticatedWithChildren = (authenticated as any)._addFileChildren({
  IndexRoute: index,
  OnboardingRoute: onboarding,
  ShiftRoute: shift,
  ProductivityRoute: productivity,
  SettingsRoute: settings,
  VariableRoute: variable,
  ShiftReportRoute: shiftReport,
  LeaderRoute: leader,
  LeaderConfigRoute: leaderConfig,
});

export const routeTree = (rootRoute as any)._addFileChildren({
  AuthenticatedRoute: authenticatedWithChildren,
  AuthRoute: auth,
  AdminRoute: admin,
});