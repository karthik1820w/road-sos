import { describe, it, expect } from 'vitest';
import { isIOSSafariUninstalled } from '../src/utils/pwaInstallHelper';

describe('PWA Install Helper', () => {
  it('identifies iOS Safari correctly', () => {
    const iosSafariUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
    expect(isIOSSafariUninstalled(iosSafariUA, false, false)).toBe(true);
  });

  it('rejects iOS Chrome', () => {
    const iosChromeUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/106.0.5249.92 Mobile/15E148 Safari/604.1';
    expect(isIOSSafariUninstalled(iosChromeUA, false, false)).toBe(false);
  });

  it('rejects Android Chrome', () => {
    const androidChromeUA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Mobile Safari/537.36';
    expect(isIOSSafariUninstalled(androidChromeUA, false, false)).toBe(false);
  });

  it('rejects if already standalone via navigator', () => {
    const iosSafariUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
    expect(isIOSSafariUninstalled(iosSafariUA, true, false)).toBe(false);
  });

  it('rejects if already standalone via matchMedia', () => {
    const iosSafariUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
    expect(isIOSSafariUninstalled(iosSafariUA, false, true)).toBe(false);
  });
});
