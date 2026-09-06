/**
 * Keeps the sensor + wake-word pipelines alive when the screen is off or the app is
 * backgrounded.
 *
 *  - Native (Capacitor/Android): runs a foreground service with a persistent
 *    "RoadSOS protection active" notification via `@anuradev/capacitor-background-mode`
 *    (install: `npm i @anuradev/capacitor-background-mode && npx cap sync`). The import
 *    is dynamic, so the web build does not need the package.
 *  - Web/PWA: acquires a Screen Wake Lock so the page is not throttled while driving
 *    (browsers cannot run sensors with the screen off — this is why Android is the
 *    primary target for Features 1 and 3).
 */
import { Capacitor } from '@capacitor/core';

export type BackgroundMode = 'foreground-service' | 'wake-lock' | 'none';

let wakeLock: any = null;
let active: BackgroundMode = 'none';

export const backgroundService = {
  get mode(): BackgroundMode { return active; },

  async enable(): Promise<BackgroundMode> {
    if (active !== 'none') return active;
    if (Capacitor.isNativePlatform()) {
      try {
        const mod = '@anuradev/capacitor-background-mode';
        const { BackgroundMode } = await import(/* @vite-ignore */ mod);
        await BackgroundMode.setSettings({
          title: 'RoadSOS protection is active',
          text: 'Crash detection and safety word are listening.',
          icon: 'ic_launcher',
          color: '0f172a',
          resume: true,
          hidden: false,
          bigText: false,
        });
        await BackgroundMode.enable();
        try { await BackgroundMode.disableBatteryOptimizations?.(); } catch { /* optional */ }
        active = 'foreground-service';
        return active;
      } catch (e) {
        console.warn('[Background] foreground service plugin not installed; falling back to wake lock.', (e as Error).message);
      }
    }
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await (navigator as any).wakeLock.request('screen');
        wakeLock.addEventListener?.('release', () => { if (active === 'wake-lock') active = 'none'; });
        document.addEventListener('visibilitychange', reacquire);
        active = 'wake-lock';
      }
    } catch (e) {
      console.warn('[Background] wake lock unavailable', (e as Error).message);
    }
    return active;
  },

  async disable() {
    if (active === 'foreground-service') {
      try {
        const mod = '@anuradev/capacitor-background-mode';
        const { BackgroundMode } = await import(/* @vite-ignore */ mod);
        await BackgroundMode.disable();
      } catch { /* ignore */ }
    }
    try { await wakeLock?.release?.(); } catch { /* ignore */ }
    document.removeEventListener('visibilitychange', reacquire);
    wakeLock = null;
    active = 'none';
  },
};

async function reacquire() {
  if (document.visibilityState === 'visible' && active === 'wake-lock' && !wakeLock) {
    try { wakeLock = await (navigator as any).wakeLock.request('screen'); } catch { /* ignore */ }
  }
}
