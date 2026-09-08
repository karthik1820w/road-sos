import { describe, it, expect } from 'vitest';
import { CrashDetector, type CrashVerdict, type MotionSample } from '../src/safety/crashDetector';
import { DEFAULT_VEHICLE_CLASS, VEHICLE_CRASH_PROFILES } from '../src/safety/vehicleProfiles';

const G = 9.81;

/** Build a 50 Hz motion stream from a piecewise description. */
function stream(segments: { ms: number; g: number | ((i: number) => number); noise?: number; gyro?: number }[], t0 = 100_000): MotionSample[] {
  const out: MotionSample[] = [];
  let t = t0;
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
  for (const seg of segments) {
    const n = Math.round(seg.ms / 20);
    for (let i = 0; i < n; i++) {
      const g = typeof seg.g === 'function' ? seg.g(i / Math.max(1, n - 1)) : seg.g;
      const noise = (seg.noise ?? 0.03) * rnd();
      // gravity mostly on z, impact energy spread on x
      const total = (g + noise) * G;
      const az = Math.min(total, G);
      const ax = Math.sqrt(Math.max(0, total * total - az * az));
      out.push({ t, ax, ay: 0, az, gx: seg.gyro ?? 0, gy: 0, gz: 0 });
      t += 20;
    }
  }
  return out;
}

function run(motion: MotionSample[], speeds: { t: number; speedMps: number }[], vehicleClass: 'TWO_WHEELER' | 'CAR' | 'TRUCK' = 'CAR'): CrashVerdict | null {
  const det = new CrashDetector(vehicleClass);
  let verdict: CrashVerdict | null = null;
  det.onVerdict(v => { verdict = v; });
  let si = 0;
  for (const m of motion) {
    while (si < speeds.length && speeds[si].t <= m.t) det.pushSpeed(speeds[si++]);
    det.pushMotion(m);
  }
  det.flush();
  return verdict;
}

const t0 = 100_000;
const speedTrace = (before: number, after: number, impactAt: number) =>
  Array.from({ length: 40 }, (_, i) => ({ t: t0 + i * 1000, speedMps: t0 + i * 1000 < impactAt ? before : after }));

const speedTraceAround = (before: number, after: number, impactAt: number) =>
  Array.from({ length: 12 }, (_, i) => ({ t: impactAt - 5000 + i * 1000, speedMps: impactAt - 5000 + i * 1000 < impactAt ? before : after }));

function eventTrace(impactG: number, impactMs: number, gyro = 2, postTiltDeg = 0): MotionSample[] {
  const pre = stream([{ ms: 2000, g: 1 }]);
  const impact = stream([{ ms: impactMs, g: impactG, gyro }], t0 + 2000);
  const post = stream([{ ms: 3500, g: 1 }], t0 + 2000 + impact.length * 20)
    .map(sample => {
      const angle = postTiltDeg * Math.PI / 180;
      return { ...sample, ax: G * Math.sin(angle), az: G * Math.cos(angle) };
    });
  return [...pre, ...impact, ...post];
}

describe('CrashDetector', () => {
  it('provides the configured profile for each vehicle class', () => {
    expect(new CrashDetector('TWO_WHEELER').profile).toEqual(VEHICLE_CRASH_PROFILES.TWO_WHEELER);
    expect(new CrashDetector('CAR').profile).toEqual(VEHICLE_CRASH_PROFILES.CAR);
    expect(new CrashDetector('TRUCK').profile).toEqual(VEHICLE_CRASH_PROFILES.TRUCK);
  });

  it('uses CAR as the default vehicle configuration', () => {
    const detector = new CrashDetector();
    expect(detector.vehicleClass).toBe(DEFAULT_VEHICLE_CLASS);
    expect(detector.profile).toEqual(VEHICLE_CRASH_PROFILES.CAR);
  });

  it('uses the selected profile candidate threshold', () => {
    const model = { score: () => 1 };
    const twoWheeler = new CrashDetector({ ...VEHICLE_CRASH_PROFILES.TWO_WHEELER, model });
    const car = new CrashDetector({ ...VEHICLE_CRASH_PROFILES.CAR, model });
    let twoWheelerVerdicts = 0;
    let carVerdicts = 0;
    twoWheeler.onVerdict(() => { twoWheelerVerdicts++; });
    car.onVerdict(() => { carVerdicts++; });
    const sample = { t: t0, ax: Math.sqrt((2 * G) ** 2 - G ** 2), ay: 0, az: G };

    twoWheeler.pushMotion(sample);
    twoWheeler.flush();
    car.pushMotion(sample);
    car.flush();

    expect(twoWheelerVerdicts).toBe(1);
    expect(carVerdicts).toBe(0);
  });

  it('rejects a car 3.2G spike lasting only 20 ms', () => {
    const impactAt = t0 + 2000;
    const verdict = run(eventTrace(3.2, 20), speedTraceAround(20, 0, impactAt));
    expect(verdict).not.toBeNull();
    expect(verdict!.features.impactDurationMs).toBe(0);
    expect(verdict!.features.impactDurationConfirmed).toBe(false);
    expect(verdict!.confidence).toBe('NONE');
  });

  it('confirms a car impact with duration, speed drop, and gyro evidence', () => {
    const impactAt = t0 + 2000;
    const verdict = run(eventTrace(3.2, 120), speedTraceAround(20, 0, impactAt));
    expect(verdict).not.toBeNull();
    expect(verdict!.features.impactDurationMs).toBeGreaterThanOrEqual(100);
    expect(verdict!.features.impactDurationConfirmed).toBe(true);
    expect(verdict!.features.speedConfirmation).toBe('CONFIRMED');
    expect(verdict!.features.gyroConfirmation).toBe('CONFIRMED');
    expect(verdict!.features.secondaryConfirmation).toBe('CONFIRMED');
    expect(verdict!.confidence).not.toBe('NONE');
  });

  it('rejects a truck 5.5G impact shorter than 120 ms', () => {
    const impactAt = t0 + 2000;
    const verdict = run(eventTrace(5.5, 100), speedTraceAround(25, 0, impactAt), 'TRUCK');
    expect(verdict).not.toBeNull();
    expect(verdict!.features.impactDurationMs).toBeLessThan(120);
    expect(verdict!.features.impactDurationConfirmed).toBe(false);
    expect(verdict!.confidence).toBe('NONE');
  });

  it('confirms a two-wheeler impact with gyro and orientation evidence', () => {
    const impactAt = t0 + 2000;
    const verdict = run(eventTrace(2.0, 100, 2, 60), speedTraceAround(12, 0, impactAt), 'TWO_WHEELER');
    expect(verdict).not.toBeNull();
    expect(verdict!.features.impactDurationConfirmed).toBe(true);
    expect(verdict!.features.gyroConfirmation).toBe('CONFIRMED');
    expect(verdict!.features.orientationConfirmation).toBe('CONFIRMED');
    expect(verdict!.features.speedConfirmation).toBe('UNKNOWN');
    expect(verdict!.features.secondaryConfirmation).toBe('CONFIRMED');
  });

  it('does not reject a car with unavailable GPS when gyro evidence is present', () => {
    const verdict = run(eventTrace(3.5, 120, 2), []);
    expect(verdict).not.toBeNull();
    expect(verdict!.features.speedBefore).toBe(-1);
    expect(verdict!.features.speedAfter).toBe(-1);
    expect(verdict!.features.speedConfirmation).toBe('UNKNOWN');
    expect(verdict!.features.secondaryConfirmation).toBe('CONFIRMED');
    expect(verdict!.confidence).not.toBe('NONE');
  });

  it('does not create a candidate during normal motion', () => {
    const motion = stream([{ ms: 5000, g: 1.0, noise: 0.2 }]);
    expect(run(motion, speedTrace(12, 12, t0 + 2500))).toBeNull();
  });

  it('flags a vehicle crash (60 km/h → 0, 7 g spike, rotation, stillness) as HIGH', () => {
    const motion = stream([
      { ms: 8000, g: 1.0, noise: 0.3 },                         // driving vibration
      { ms: 160, g: (p) => 1 + 6 * Math.sin(Math.PI * p), gyro: 6 }, // impact
      { ms: 400, g: (p) => 1 + 1.5 * (1 - p), gyro: 2 },       // ring-down
      { ms: 4000, g: 1.0, noise: 0.01 },                        // stopped, still
    ]);
    const impactAt = t0 + 8000;
    const v = run(motion, speedTrace(16.7, 0, impactAt));
    expect(v).not.toBeNull();
    expect(v!.confidence).toBe('HIGH');
    expect(v!.features.drivingContext).toBe('DRIVING');
    expect(v!.features.speedDrop).toBeGreaterThan(10);
    expect(v!.probeTimeoutS).toBe(10);
  });

  it('rejects a phone dropped on the floor while stationary (free-fall then 5 g)', () => {
    const motion = stream([
      { ms: 5000, g: 1.0, noise: 0.02 },
      { ms: 350, g: 0.05, noise: 0.01 },                        // free fall ~0.6 m
      { ms: 60, g: (p) => 1 + 4.5 * Math.sin(Math.PI * p) },    // floor hit
      { ms: 200, g: (p) => 1 + 0.8 * (1 - p) },
      { ms: 4000, g: 1.0, noise: 0.01 },
    ]);
    const v = run(motion, speedTrace(0, 0, t0 + 5350));
    expect(v).not.toBeNull();
    expect(v!.features.preFreeFallMs).toBeGreaterThan(200);
    expect(v!.features.drivingContext).toBe('STATIONARY');
    expect(['NONE', 'LOW']).toContain(v!.confidence);
  });

  it('ignores a pothole / hard braking (3.5 g, driving continues)', () => {
    const motion = stream([
      { ms: 6000, g: 1.0, noise: 0.3 },
      { ms: 80, g: (p) => 1 + 2.6 * Math.sin(Math.PI * p) },
      { ms: 4000, g: 1.0, noise: 0.3 },                         // still bouncing along
    ]);
    const v = run(motion, speedTrace(12, 11, t0 + 6000));
    expect(v).not.toBeNull();
    expect(v!.features.postStillness).toBeLessThan(0.7);
    expect(['NONE', 'LOW']).toContain(v!.confidence);
  });

  it('is conservative without GPS: a moderate spike alone is not a crash', () => {
    const motion = stream([
      { ms: 4000, g: 1.0 },
      { ms: 100, g: (p) => 1 + 3 * Math.sin(Math.PI * p) },
      { ms: 4000, g: 1.0 },
    ]);
    const v = run(motion, []);
    expect(v).not.toBeNull();
    expect(v!.features.drivingContext).toBe('UNKNOWN');
    expect(v!.confidence).not.toBe('HIGH');
  });

  it('never opens a second candidate during cooldown', () => {
    const det = new CrashDetector({ cooldownMs: 30_000 });
    let count = 0;
    det.onVerdict(() => count++);
    const motion = stream([
      { ms: 2000, g: 1 }, { ms: 100, g: 6 }, { ms: 3000, g: 1 },
      { ms: 100, g: 6 }, { ms: 3000, g: 1 },
    ]);
    for (const m of motion) det.pushMotion(m);
    det.flush();
    expect(count).toBe(1);
  });

  it('keeps a black-box snapshot around the impact', () => {
    const det = new CrashDetector();
    const motion = stream([{ ms: 3000, g: 1 }, { ms: 100, g: 6 }, { ms: 3000, g: 1 }]);
    for (const m of motion) det.pushMotion(m);
    const snap = det.snapshot(t0 + 3000, 4000);
    expect(snap.motion.length).toBeGreaterThan(150);
    expect(snap.motion[0].t).toBeGreaterThanOrEqual(t0 + 1000);
  });
});
