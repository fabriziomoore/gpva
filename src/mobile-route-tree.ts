/* eslint-disable */
// @ts-nocheck

// Capacitor-only route tree. It intentionally excludes /admin because that
// route imports TanStack Start server functions, which would bring server/SSR
// runtime code into the Android browser bundle.

import { Route as rootRouteImport } from "./routes/__root";
import { Route as AuthRouteImport } from "./mobile/AuthRoute";
import { Route as AuthenticatedRouteRouteImport } from "./routes/_authenticated/route";
import { Route as AuthenticatedIndexRouteImport } from "./routes/_authenticated/index";
import { Route as AuthenticatedVariableRouteImport } from "./routes/_authenticated/variable";
import { Route as AuthenticatedShiftRouteImport } from "./routes/_authenticated/shift";
import { Route as AuthenticatedSettingsRouteImport } from "./routes/_authenticated/settings";
import { Route as AuthenticatedProductivityRouteImport } from "./routes/_authenticated/productivity";
import { Route as AuthenticatedOnboardingRouteImport } from "./routes/_authenticated/onboarding";
import { Route as AuthenticatedShiftIdReportRouteImport } from "./routes/_authenticated/shift_.$id.report";

const AuthRoute = AuthRouteImport.update({
  id: "/auth",
  path: "/auth",
  getParentRoute: () => rootRouteImport,
} as any);

const AuthenticatedRouteRoute = AuthenticatedRouteRouteImport.update({
  id: "/_authenticated",
  getParentRoute: () => rootRouteImport,
} as any);

const AuthenticatedIndexRoute = AuthenticatedIndexRouteImport.update({
  id: "/",
  path: "/",
  getParentRoute: () => AuthenticatedRouteRoute,
} as any);

const AuthenticatedVariableRoute = AuthenticatedVariableRouteImport.update({
  id: "/variable",
  path: "/variable",
  getParentRoute: () => AuthenticatedRouteRoute,
} as any);

const AuthenticatedShiftRoute = AuthenticatedShiftRouteImport.update({
  id: "/shift",
  path: "/shift",
  getParentRoute: () => AuthenticatedRouteRoute,
} as any);

const AuthenticatedSettingsRoute = AuthenticatedSettingsRouteImport.update({
  id: "/settings",
  path: "/settings",
  getParentRoute: () => AuthenticatedRouteRoute,
} as any);

const AuthenticatedProductivityRoute = AuthenticatedProductivityRouteImport.update({
  id: "/productivity",
  path: "/productivity",
  getParentRoute: () => AuthenticatedRouteRoute,
} as any);

const AuthenticatedOnboardingRoute = AuthenticatedOnboardingRouteImport.update({
  id: "/onboarding",
  path: "/onboarding",
  getParentRoute: () => AuthenticatedRouteRoute,
} as any);

const AuthenticatedShiftIdReportRoute = AuthenticatedShiftIdReportRouteImport.update({
  id: "/shift_/$id/report",
  path: "/shift/$id/report",
  getParentRoute: () => AuthenticatedRouteRoute,
} as any);

const AuthenticatedRouteRouteChildren = {
  AuthenticatedOnboardingRoute,
  AuthenticatedProductivityRoute,
  AuthenticatedSettingsRoute,
  AuthenticatedShiftRoute,
  AuthenticatedVariableRoute,
  AuthenticatedIndexRoute,
  AuthenticatedShiftIdReportRoute,
};

const AuthenticatedRouteRouteWithChildren = AuthenticatedRouteRoute._addFileChildren(
  AuthenticatedRouteRouteChildren,
);

const rootRouteChildren = {
  AuthenticatedRouteRoute: AuthenticatedRouteRouteWithChildren,
  AuthRoute,
};

export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren);