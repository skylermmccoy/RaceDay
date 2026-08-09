# RaceDay

RaceDay is an app to keep up with motor racing and watch live races.

Standings data is pulled from `cf.nascar.com`, the undocumented public feed NASCAR
serves its own site from. It covers three national series:

| Series | Feed id |
| --- | --- |
| Cup | 1 |
| O'Reilly Auto Parts | 2 |
| Craftsman Truck | 3 |

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
  `watch.tsx` is the live streams.
- `src/backend/drivers.ts` — NASCAR feed client. Exports `driverstandings(series)`.
- `src/components/` — shared UI. Platform splits use `.web.tsx`.
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

There is no test runner configured.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).
