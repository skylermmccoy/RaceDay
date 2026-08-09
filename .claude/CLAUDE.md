# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

`raceday` is a **NASCAR standings and data app targeting iOS**. Its purpose is to surface NASCAR information — standings, driver data, and related race data — to users on iOS. Keep iOS the primary target when making platform trade-offs (web/Android exist via Expo but are secondary). The NASCAR data layer currently lives in `src/backend/drivers.ts` (see below).

## Critical: Expo v57

This project is on **Expo SDK 57 / React Native 0.86 / React 19.2**, which changed substantially from earlier SDKs. Before writing any Expo/React Native code, consult the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ — do not rely on memory of older Expo APIs. React Compiler and typed routes are both enabled as experiments (`app.json`), so route strings are type-checked and manual memoization is usually unnecessary.

## Commands

```bash
npm install          # install deps
npm start            # expo start (dev server + QR for Expo Go / dev build)
npm run ios          # expo start --ios      (open iOS simulator)
npm run android      # expo start --android  (open Android emulator)
npm run web          # expo start --web       (react-native-web)
npm run lint         # expo lint
```

There is **no test runner configured** — do not assume Jest exists. If asked to add tests, follow Expo's "Unit Testing with Jest" guide first.

`npm run reset-project` moves the current `src` starter into `app-example/` and scaffolds a blank app — destructive to current work; never run it unless explicitly asked.

## Architecture

**Routing is file-based (expo-router).** Screens live in `src/app/`; the file tree *is* the route table. `src/app/_layout.tsx` is the root layout — it sets up `ThemeProvider`, the splash overlay, and renders `AppTabs`. `index.tsx` → `/`, `watch.tsx` → `/explore`. `typedRoutes` means `href` strings are validated against this tree at compile time.

**Platform-specific files are resolved by Metro, not by runtime branching.** A `foo.web.tsx` is used on web; `foo.tsx` is the native fallback. This repo uses that split for genuinely different implementations, not cosmetic tweaks:
- `app-tabs.tsx` uses native tab bars (`expo-router/unstable-native-tabs`); `app-tabs.web.tsx` builds a custom floating tab bar with `expo-router/ui`. They share almost nothing — edit the right file for the platform you're targeting.
- `use-color-scheme.ts` vs `use-color-scheme.web.ts` (the web variant defers to `'light'` until hydration to keep static rendering stable).
- `animated-icon.tsx` vs `.web.tsx` (+ a `.module.css` used only on web).

**Theming is centralized in `src/constants/theme.ts`.** `Colors.light` / `Colors.dark`, `Spacing` (a fixed scale: `one`=4 … `six`=64), `Fonts` (per-platform), and layout constants (`MaxContentWidth`, `BottomTabInset`) all originate here. Never hardcode colors or pixel spacing in components — pull from these. `useTheme()` returns the active color set; `ThemedText` and `ThemedView` are the primitives that consume it (via `type` variants like `title`/`small`/`link` and a `themeColor` override) — prefer them over raw `Text`/`View` so light/dark works automatically.

**Path aliases** (`tsconfig.json`): `@/*` → `src/*`, `@/assets/*` → `assets/*`. TypeScript is `strict`. Use these aliases, not deep relative paths.

## `src/backend/` is not a server

Despite the name, there is no backend service. `src/backend/drivers.ts` is a **standalone script** (calls `main()` at module load, run via `npx tsx drivers.ts`) that fetches and filters NASCAR Cup Series drivers from the undocumented feed `https://cf.nascar.com/cacher/drivers.json`. It is not imported by any screen. Key data facts baked into that file: filter Cup drivers with `Driver_Series === "nascar-cup-series"`, and dedupe on `Nascar_Driver_ID` (the stable person identity — the feed repeats people under multiple `Driver_ID`s). To surface this data in the app, it must be refactored to *export* a function rather than run on import, and be aware CORS will apply when fetching from the web target.
