const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const required = [['java', 'Java/JDK'], ['adb', 'Android SDK platform tools']];
// adb uses `version` (no dash), not `-version`
const missing = required.filter(([command]) => {
  const args = command === 'adb' ? ['version'] : ['-version'];
  const result = spawnSync(command, args, { stdio: 'ignore', shell: true });
  return result.error || result.status !== 0;
});
if (!fs.existsSync(path.join(root, 'android'))) { console.error('Android project is not generated. Install dependencies, then run: npx cap add android'); process.exit(1); }
if (missing.length) { console.error(`Missing Android build tools: ${missing.map(([, label]) => label).join(', ')}. Install Android Studio, SDK Platform 35, Build Tools, JDK 17, Gradle, and adb.`); process.exit(1); }
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug'], { cwd: path.join(root, 'android'), stdio: 'inherit', shell: true });
if (result.status !== 0) process.exit(result.status || 1);
const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const dist = path.join(root, 'dist'); fs.mkdirSync(dist, { recursive: true }); fs.copyFileSync(apk, path.join(dist, 'ShebaShathi-debug.apk')); console.log(`APK: ${path.join(dist, 'ShebaShathi-debug.apk')}`);
