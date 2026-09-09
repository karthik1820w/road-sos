import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * signReportToken() must never sign with a secret that's readable in the source code —
 * that would let anyone forge a valid "?t=" token for any incident ID and read another
 * user's medical report PDF (name, phone, blood group, allergies, GPS location).
 *
 * We re-import the module fresh per test (vi.resetModules) because the process-wide
 * random fallback secret is generated once per module load, and we need to control
 * env vars *before* that first call.
 */
describe('incident report-token signing secret', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.INCIDENT_SIGNING_SECRET;
    delete process.env.JWT_SECRET;
  });

  it('produces a different token than the old hardcoded "roadsos-dev-secret" would, when unconfigured', async () => {
    const crypto = await import('crypto');
    const { signReportToken } = await import('../api/incidents.js');

    const incidentId = 'test-incident-id';
    const legacyHardcodedToken = crypto
      .createHmac('sha256', 'roadsos-dev-secret')
      .update(incidentId)
      .digest('hex')
      .slice(0, 32);

    const actualToken = signReportToken(incidentId);

    expect(actualToken).not.toBe(legacyHardcodedToken);
  }, 15000);

  it('is stable within a single process run even with no env secret configured', async () => {
    const { signReportToken } = await import('../api/incidents.js');
    const id = 'stable-id';
    expect(signReportToken(id)).toBe(signReportToken(id));
  });

  it('uses INCIDENT_SIGNING_SECRET when explicitly configured, deterministically', async () => {
    process.env.INCIDENT_SIGNING_SECRET = 'a-real-configured-secret';
    const crypto = await import('crypto');
    const { signReportToken } = await import('../api/incidents.js');

    const expected = crypto
      .createHmac('sha256', 'a-real-configured-secret')
      .update('abc')
      .digest('hex')
      .slice(0, 32);

    expect(signReportToken('abc')).toBe(expected);
  });

  it('falls back to JWT_SECRET when INCIDENT_SIGNING_SECRET is unset but JWT_SECRET is set', async () => {
    process.env.JWT_SECRET = 'jwt-secret-value';
    const crypto = await import('crypto');
    const { signReportToken } = await import('../api/incidents.js');

    const expected = crypto
      .createHmac('sha256', 'jwt-secret-value')
      .update('xyz')
      .digest('hex')
      .slice(0, 32);

    expect(signReportToken('xyz')).toBe(expected);
  });

  it('isSigningSecretConfigured returns true if INCIDENT_SIGNING_SECRET or JWT_SECRET is set', async () => {
    const { isSigningSecretConfigured } = await import('../api/incidents.js');
    
    // Initially false (cleared in beforeEach)
    expect(isSigningSecretConfigured()).toBe(false);

    // True with INCIDENT_SIGNING_SECRET
    process.env.INCIDENT_SIGNING_SECRET = 'secret';
    expect(isSigningSecretConfigured()).toBe(true);

    // True with JWT_SECRET
    delete process.env.INCIDENT_SIGNING_SECRET;
    process.env.JWT_SECRET = 'jwt';
    expect(isSigningSecretConfigured()).toBe(true);
  });
});
