# Android local build

The app is wrapped with Capacitor. The web bundle is copied into `www/`, which is
what the native project loads.

## Prerequisites

- Android Studio with **Android SDK Platform 35**, Build Tools, and Platform Tools
- **JDK 17**
- `java`, `adb` and the Android SDK on `PATH` (`ANDROID_HOME` or
  `ANDROID_SDK_ROOT` set)
- `npm install` (installs the Capacitor CLI and Android platform)

## Build

```bash
npm install
npm run android:prepare   # prepare-web + cap sync android
npm run android:build     # + gradle assembleDebug
```

The debug APK is copied to `dist/ShebaShathi-debug.apk`.

Install on a running emulator:

```bash
adb install -r dist/ShebaShathi-debug.apk
```

## Backend URL

- **Android Studio emulator:** the app talks to `http://10.0.2.2:3000/api`
  (`10.0.2.2` is the emulator's alias for the host machine).
- **Physical device:** set `window.SHEBASHATHI_API` to your computer's LAN URL
  before `npm run web:prepare`. Do not ship a hardcoded private IP.
- Production builds must use HTTPS. Android blocks cleartext HTTP by default
  except where the debug manifest allows it.

## Status in this workspace

The web bundle and Capacitor sync can be prepared, but **the APK was not built
here**: `java`, `adb` and `gradle` are not installed and `ANDROID_HOME` /
`ANDROID_SDK_ROOT` are unset in this environment. `npm run android:build` exits
early with a clear toolchain message instead of producing a broken artifact.
Install the prerequisites above and re-run the command on a machine with the
Android SDK.
