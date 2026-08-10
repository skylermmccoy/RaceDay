# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

`raceday` is a **NASCAR standings and data app targeting iOS**. Its purpose is to surface NASCAR information — standings, live timing, driver data — to users on iOS, plus a points-betting game on the Fantasy tab (see below). Keep iOS the primary target when making platform trade-offs (web/Android exist via Expo but are secondary). The NASCAR data layer lives in `src/backend/` (see below).

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

**Routing is file-based (expo-router).** Screens live in `src/app/`; the file tree *is* the route table: `index.tsx` → `/` (standings), `live.tsx` → `/live`, `fantasy.tsx` → `/fantasy`, `watch.tsx` → `/watch`. `src/app/_layout.tsx` is the root layout — it wraps everything in `GestureHandlerRootView` (without which no gesture fires anywhere) and sets up `ThemeProvider`, the splash overlay, and `AppTabs`. `typedRoutes` means `href` strings are validated against this tree at compile time.

There is **no `Stack` navigator** — the root mounts native tabs directly. A screen that needs to cover the tabs uses a React Native `<Modal>` in place (as the betting deck does); adding a modal *route* would mean restructuring the root into a Stack with the tabs as a group, and touching both `app-tabs.tsx` and `app-tabs.web.tsx`.

**Platform-specific files are resolved by Metro, not by runtime branching.** A `foo.web.tsx` is used on web; `foo.tsx` is the native fallback. This repo uses that split for genuinely different implementations, not cosmetic tweaks:
- `app-tabs.tsx` uses native tab bars (`expo-router/unstable-native-tabs`); `app-tabs.web.tsx` builds a custom floating tab bar with `expo-router/ui`. They share almost nothing — edit the right file for the platform you're targeting.
- `use-color-scheme.ts` vs `use-color-scheme.web.ts` (the web variant defers to `'light'` until hydration to keep static rendering stable).
- `animated-icon.tsx` vs `.web.tsx` (+ a `.module.css` used only on web).

**Theming is centralized in `src/constants/theme.ts`.** `Colors.light` / `Colors.dark`, `Spacing` (a fixed scale: `one`=4 … `six`=64), `Fonts` (per-platform), and layout constants (`MaxContentWidth`, `BottomTabInset`) all originate here. Never hardcode colors or pixel spacing in components — pull from these. `useTheme()` returns the active color set; `ThemedText` and `ThemedView` are the primitives that consume it (via `type` variants like `title`/`small`/`link` and a `themeColor` override) — prefer them over raw `Text`/`View` so light/dark works automatically.

The one deliberate exception is the `Casino` palette, also in `theme.ts`: the betting deck is a card table and stays dark in both schemes, so its components use `Casino.*` with plain `Text`/`View` rather than `useTheme()`. That exception is scoped — `bankroll-header` and `bet-scoreboard` sit on the themed Fantasy screen and use `ThemedText`/`ThemedView` normally. `bet-receipt` keeps the dark slip look on both surfaces, on purpose.

**Path aliases** (`tsconfig.json`): `@/*` → `src/*`, `@/assets/*` → `assets/*`. TypeScript is `strict`. Use these aliases, not deep relative paths.

## `src/backend/` is not a server

Despite the name, there is no backend service — these are clients for the undocumented feeds NASCAR serves its own site from, plus the pure game rules. They are **both modules and scripts**: each guards its `main()` with `process.argv?.[1]?.endsWith("<file>.ts")`, so importing from a screen fetches nothing, and `npx tsx src/backend/<file>.ts` runs a self-check against live data. Screens import them freely (`@/backend/...`), but **modules under `src/backend/` must import each other with relative paths** — the `@/` alias does not resolve under `tsx` and would break the CLIs silently.

- `nascar-api.ts` — shared leaf (feed URLs, `Series`, conditional GETs, `getRaceResults`, `carBadgeUrl`). Must not import the other two.
- `drivers.ts` — `driverstandings(series)`, `drivernames()`, `recentFinishes()`. Filter Cup drivers with `Driver_Series === "nascar-cup-series"`; dedupe on `Nascar_Driver_ID` (the stable person identity — the feed repeats people under multiple `Driver_ID`s).
- `live-race.ts` — the live timing feed. There is exactly one *global* live feed, so it serves whatever session is on track; `classifyLiveRace()` decides whether that is live or a frozen leftover.
- `betting.ts` — the bet model. Pure: no React, no network.

**Assets on `www.nascar.com` are best-effort.** Driver headshots (`headshotUrl`) and manufacturer logos live there behind Cloudflare, which 403s non-browser clients, and most Cup records carry a `default.png` placeholder that `drivers.ts` maps to `null`. Anything rendering them needs a designed fallback — see `ManufacturerBadge`'s drawn chip and `DriverBetCard`'s number plate. Car number badges are different: they are on `cf.nascar.com` and reliable.

There is no test runner, so **the CLIs are the tests**. `npx tsx src/backend/betting.ts` asserts every payout band, DNF handling, refunds, settlement idempotence, and the top-up rule against a real finished race. Run it after touching anything in `betting.ts`.

## The betting game (Fantasy tab)

The Fantasy tab is a wagering game — a swipeable deck of driver cards, one bet per driver per race. It replaced an earlier 3-pick fantasy flow; if you find references to `MaxPicks`, `scorePicks`, `PickScoreboard`, or `use-fantasy-entry`, they are gone.

**The money model is the part to be careful with.** Stakes are **escrowed at submit**: `submitSheet` deducts the total from the balance immediately and records it on the sheet. Settlement therefore only ever *adds* — which is what makes "total staked ≤ balance" structural rather than a check, and makes editing an open sheet a refund-then-rededuct. `applySettlement` is keyed on `raceId` and returns the same object if that race is already recorded; the screen re-observes the same finished race on every poll, so a non-idempotent settle would inflate the balance without bound. A balance of 0 or less after settlement resets to `StartingBankroll` (100).

Settlement reads the **official classification** (`weekend-feed.json` via `getRaceResults`), not the live running order, falling back to the frozen live feed only if that fetch fails. `finishing_status !== 'Running'` is the DNF signal; a retired car still holds a finishing position, so a wreck can cash a 30s bet.

**Persistence** is `@react-native-async-storage/async-storage` in `use-bet-sheet.ts`, under `raceday.betting.bankroll.v1` / `pending.v1` / `sheet.v1.{raceId}`. The keys are versioned — a change to `BetSheet`'s shape needs a `.v2`, or stored sheets will deserialize into the new reader. `pending.v1` is a list of raceIds awaiting settlement, which is how a race that finished while the app was closed still pays out on next launch. The deck's in-progress draft is deliberately *not* persisted: bets only exist once the receipt is confirmed.

**UI** lives in `src/components/betting/`. `bet-deck-overlay.tsx` owns the session (mounted fresh per open, so no state needs re-zeroing) and the `DeckSession`/`BetDeckOverlay` split; `swipe-card-stack.tsx` is the gesture mechanic and knows nothing about betting.

## Reanimated 4 + React Compiler

React Compiler is on, which changes two idioms from what you may remember:

- Shared values are read and written with `.get()` / `.set()`, not `.value` — direct `.value` assignment is flagged as mutating a memoized value and fails `npm run lint`.
- Jumping from a worklet back to JS is `scheduleOnRN` from `react-native-worklets`, not `runOnJS`. See `animated-icon.tsx` and `swipe-card-stack.tsx`.

`react-native-gesture-handler` needs `GestureHandlerRootView` at the root (in `_layout.tsx`) **and** a nested one inside any `<Modal>`, or gestures inside the modal silently never fire on Android.
