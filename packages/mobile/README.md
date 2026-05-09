# fiano mobile

React Native + Expo App für iOS und Android. Teil des `fiano`-Monorepos.

**Status (Phase 9.4.2)**: Skeleton — Login + Import + Export-Pipeline funktionsfähig.
Editor / Builder / Highlights / Subtitles kommen in Phase 9.4.x.

## Stack

- **Expo 52 + Prebuild** (für native ffmpeg-kit + react-native-video Modules)
- **React Native 0.76** (New Architecture aktiviert via `newArchEnabled: true`)
- **NativeWind 4** (Tailwind für RN)
- **React Navigation 7** (native-stack + bottom-tabs)
- **Zustand** (state)
- **Supabase JS** mit `expo-secure-store` als Session-Store
- **`ffmpeg-kit-react-native`** — **Community-Fork** (`jdarshan5/ffmpeg-kit-react-native`).
  Original `arthenica/ffmpeg-kit` ist seit Juni 2025 archiviert.
- **react-native-purchases** (RevenueCat) — Mobile-Pendant zu Stripe (Desktop)
- **Geteilter Code** über `@fiano/shared` — Types, i18n-Locales (9 Sprachen),
  FFmpeg-Arg-Builder, Subtitle-Generator

## Ordnerstruktur

```
packages/mobile/
├── App.tsx                    Root + NavigationContainer + Theme
├── index.ts                   registerRootComponent
├── app.json                   Expo (name, slug, scheme, plugins, permissions)
├── eas.json                   EAS Build profiles
├── babel.config.js            babel-preset-expo + nativewind/babel + reanimated
├── metro.config.js            withNativeWind + monorepo watchFolders
├── tailwind.config.js         brand-Farben + nativewind/preset
├── global.css                 @tailwind directives
├── tsconfig.json              extends expo + paths zu @fiano/shared
├── .env.example               Supabase + RevenueCat Keys
└── src/
    ├── lib/
    │   ├── supabase.ts        createClient + ExpoSecureStoreAdapter
    │   ├── ffmpeg.ts          FFmpegKit-Wrapper (cancel, progress)
    │   ├── mediaPicker.ts     pickVideo + saveToCameraRoll + ensureLocalCopy
    │   └── env.ts             Runtime-Env-Check
    ├── stores/
    │   ├── authStore.ts       Session + Subscription
    │   └── jobStore.ts        Aktiver Render-Job (single, kein Queue v1)
    ├── navigation/
    │   ├── RootNavigator.tsx  Auth-Gate
    │   └── types.ts           Stack-Param-Map
    ├── components/
    │   ├── BrandButton.tsx
    │   └── ProgressBar.tsx
    └── screens/
        ├── LoginScreen.tsx
        ├── SignupScreen.tsx
        ├── HomeScreen.tsx
        ├── ImportScreen.tsx   Picker + Trim-Stepper
        └── ExportScreen.tsx   FFmpeg + Save-to-Roll + Cancel
```

## Setup (lokal)

Im Monorepo-Root:

```bash
# Aus dem Repo-Root (NICHT aus packages/mobile)
npm install                              # installiert alle Workspaces inkl. shared + mobile

cd packages/mobile
cp .env.example .env                     # Supabase URL + Anon-Key eintragen
npx expo prebuild --clean                # generiert ios/ + android/ Verzeichnisse
```

## Run (Dev)

```bash
cd packages/mobile

# iOS Simulator (macOS only — braucht Xcode + Pods)
npx expo run:ios

# Android Emulator (braucht Android Studio + JDK 17)
npx expo run:android
```

**Erstes Run dauert lange** (~5-10 Min): CocoaPods install + Gradle build.

## Production Build (EAS)

```bash
npm install -g eas-cli
eas login
eas build:configure                      # akzeptiert die existing eas.json

# iOS — generiert .ipa, lädt zu TestFlight via `eas submit`
eas build --platform ios --profile production
eas submit --platform ios --latest

# Android — generiert .aab, lädt zu Play Console Internal Testing
eas build --platform android --profile production
eas submit --platform android --latest
```

**Setup vor erstem Submit:**
1. **App Store Connect** Account → App-ID für `app.fiano.video` anlegen,
   `eas.json:submit.production.ios.ascAppId` eintragen
2. **Google Play Console** Account → App-ID für `app.fiano.video`,
   Service-Account-JSON für `eas submit` hinterlegen
3. **App Store Connect**: 3 IAP-Products anlegen (Creator/Pro/Lifetime —
   gleiche Preise wie Desktop), in RevenueCat verbinden
4. **Google Play Console**: gleiche IAP-Products, Lizenz-Tester hinzufügen
5. **RevenueCat Dashboard**: Products mappen, Entitlement `pro_features`,
   API-Keys in `.env` eintragen
6. **Privacy/Terms** URLs verlinken auf
   `https://garymikefischer-art.github.io/fiano/legal/privacy` (Desktop hat
   die Pages schon)

## ffmpeg-kit Migration (post-MVP)

Der Fork `jdarshan5/ffmpeg-kit-react-native` ist Community-maintained. Mid-term
Plan:
- Eigenes Native-Module mit `kewlbear/FFmpeg-iOS` (Swift Package Manager) +
  Android NDK Build → Volle Kontrolle über FFmpeg-Version + Security-Patches
- Da `@fiano/shared/ffmpegArgs` plattform-neutral ist, ist der Migrations-Aufwand
  nur ein Tausch von `src/lib/ffmpeg.ts` (~80 LOC).

## i18n

Locale-Dateien liegen in `@fiano/shared/i18n/locales/` und werden zwischen
Desktop und Mobile geteilt. Mobile-Hook ist post-MVP (Phase 9.4.x).

## Bekannte MVP-Limits

| Feature | Desktop | Mobile MVP | Mobile geplant |
|---|---|---|---|
| Login | ✓ | ✓ | ✓ |
| Video-Import | URL+Datei | nur Galerie | + URL (über Edge Function) |
| 9:16-Crop | ✓ | ✓ (center) | + Left/Right/Custom |
| Trim | ✓ | ✓ (Stepper) | + Range-Slider |
| Subtitles | libass + drawtext | — | drawtext-only (4 Styles) |
| Auto-Highlights | OpenAI BYOK | — | Edge-Function-Proxy |
| Builder | ✓ | — | ✓ |
| Editor | ✓ | — | (nicht geplant) |
| Thumbnails | ✓ | — | ✓ |
| Stabilizer / AI-Mask / LUT | ✓ | — | (nicht geplant — Desktop-only) |
