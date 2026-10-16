# Android local build

Install Android Studio with Android SDK Platform 35, Android SDK Build Tools, Android SDK Platform Tools, and JDK 17. Ensure `java`, `adb`, and the Android SDK are available in `PATH`.

```bash
npm install
npm run android:prepare
npm run android:build
```

The debug APK is copied to `dist/ShebaShathi-debug.apk`. The debug app uses `http://10.0.2.2:3000/api` for the standard Android Studio emulator. Start the backend with `npm start`. For a physical device, set `window.SHEBASHATHI_API` to the computer's LAN HTTPS/API URL before preparing the web bundle. Production builds must use HTTPS.

Install on a running emulator with:

```bash
adb install -r dist/ShebaShathi-debug.apk
```
