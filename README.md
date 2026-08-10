# RaceDay

RaceDay is an app to keep up with motor racing and watch live races.

Standings data is pulled from `cf.nascar.com`, the undocumented public feed NASCAR
serves its own site from. It covers three national series:

| Series | Feed id |
| --- | --- |
| Cup | 1 |
| O'Reilly Auto Parts | 2 |
| Craftsman Truck | 3 |

## Fantasy betting

The Fantasy tab is a betting game: a card deck, one card per Cup driver in
points order. Swipe right to back a driver, left to pass. Each card shows the
driver's photo and car number, their season points, and how they finished the
last two races.

You start with **100 points** and stake them on where a driver will finish:

| Bet | Cashes when the driver finishes | Pays |
| --- | --- | --- |
| Win | P1 | ×10 |
| Top 5 | P1–5 | ×5 |
| Top 10 | P1–10 | ×3 |
| 20s | P20–29 | ×4 |
| 30s | P30 or worse | ×5 |
| DNF | Out of the race | ×8 |

Payouts are the total returned, so a 10-point Win bet that lands pays back 100.
Nothing covers P11–P19 — that gap is the house edge. A car that crashes out is
still classified at a finishing position, so a wreck can cash a 30s bet as well
as a DNF bet.

Placing a sheet deducts the stakes immediately; they come back, with winnings,
when the race is settled from the official results. A driver who never takes the
green flag has their stake refunded. Go broke and the bankroll resets to 100 for
the next race, so the game always continues.

Bets lock when the race starts and settle once it finishes — including races
that ran while the app was closed, which are settled on next launch.

## Dependencies

- Expo SDK 57
- React Native 0.86
- React 19.2

## Note

**This project cannot run in Expo Go.** It depends on `expo-dev-client`,
`@expo/ui`, `expo-glass-effect`, and `expo-updates`, none of which ship in Expo
Go, and it declares config plugins that only take effect in a native build.

You need a build instead:

- **iOS** — `npx expo run:ios` for a local development build, or TestFlight to
  put it on someone else's phone.
- **Android** — `npx eas build --profile preview --platform android` produces a
  standalone APK you can install directly.

Building Android locally is possible but needs the NDK and CMake installed via
Android Studio's SDK Manager (~3 GB), plus `ANDROID_HOME` set. The cloud build
above is usually less hassle.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Build and install the development build once

   ```bash
   npx expo run:ios      # or: npx expo run:android
   ```

3. Start the dev server for subsequent runs

   ```bash
   npx expo start --dev-client
   ```

## Build profiles

Profiles live in `eas.json`. The distinction matters:

| Profile | Produces | Needs a dev server? |
| --- | --- | --- |
| `development` | Dev client — a launcher shell, no JS bundled | Yes |
| `preview` | Standalone APK, JS bundled in | No |
| `production` | AAB for the Play Store | No |

If a build opens to an Expo screen instead of the app, it was built with
`development`. Use `preview` for something you can hand to someone.

## Project layout

- `src/app/` — file-based routes (expo-router). `index.tsx` is standings,
  `live.tsx` is live timing, `fantasy.tsx` is the betting game, `watch.tsx` is
  the live streams.
- `src/backend/` — feed clients and game rules, not a server. `drivers.ts`
  exports `driverstandings(series)` and `recentFinishes()`; `live-race.ts` reads
  the live timing feed; `betting.ts` holds the bet model, payouts, and
  settlement.
- `src/components/` — shared UI. Platform splits use `.web.tsx`.
  `src/components/betting/` is the card deck.
- `src/hooks/use-bet-sheet.ts` — bankroll, the placed sheet, and settling
  finished races.
- `src/constants/theme.ts` — colors, spacing, and fonts. Pull from here rather
  than hardcoding.

## Commands

```bash
npm start        # expo start
npm run ios      # expo run:ios
npm run android  # expo run:android
npm run web      # expo start --web
npm run lint     # expo lint
```

There is no test runner configured. The modules under `src/backend/` double as
scripts that check themselves against live feeds — run them directly:

```bash
npx tsx src/backend/betting.ts    # asserts payouts and settlement against a real race
npx tsx src/backend/drivers.ts    # prints standings, headshots, and recent form
npx tsx src/backend/live-race.ts  # prints the current session (--watch to poll)
```

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).
