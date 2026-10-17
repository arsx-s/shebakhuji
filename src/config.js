/**
 * Runtime configuration.
 *
 * Web deployments call the same origin at /api.
 * Native (Capacitor) builds talk to a separately configured backend host.
 * `scripts/prepare-web.js` rewrites NATIVE_API_BASE when SHEBASHATHI_API_BASE
 * is provided, so a release bundle never ships an emulator address by default.
 */
export const NATIVE_API_BASE = 'http://10.0.2.2:3000/api';

export const IS_NATIVE = Boolean(
  (typeof window !== 'undefined' && window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform())
);

export const API_BASE =
  (typeof window !== 'undefined' && window.SHEBASHATHI_API) ||
  (IS_NATIVE ? NATIVE_API_BASE : '/api');

export const APP_NAME = 'ShebaShathi';
export const TOKEN_KEY = 'shebashathi.token';
export const CURRENCY = 'BDT';
