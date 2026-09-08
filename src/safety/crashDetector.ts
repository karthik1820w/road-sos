/**
 * Crash detector — Feature 1.
 *
 * Replaces the bare "g > 8" threshold with a small sensor-fusion pipeline:
 *
 *   accelerometer (+gyro when available) ──┐
 *   GPS speed ─────────────────────────────┼─► sliding window ─► features ─► CrashModel ─► verdict
 *   barometer (optional, future) ──────────┘                      │
 *                                                                 └─► 20 s ring buffer (black box)
 *
 * Design notes
 *  - Candidate events open when |a| exceeds `candidateG`. The verdict is issued
 *    `settleMs` later so post-impact behaviour (stillness, speed collapse) can be
 *    measured — a crash is a spike *followed by* the vehicle stopping; a pothole is
 *    a spike followed by normal driving; a phone drop is free-fall *before* a spike.
 *  - `CrashModel` is an interface. `HeuristicCrashModel` is a hand-tuned logistic
 *    model over interpretable features so the behaviour is explainable in a demo.
 *    Swap in an ONNX/TFLite model via `createCrashModel(predictFn)` without touching
 *    the pipeline.
 *  - Driving-context gating: without evidence of vehicle motion the detector
 *    requires a much stronger signature. This is what stops walking/drops firing.
 *  - Everything runs on-device; nothing is sent anywhere until a verdict is
 *    accepted by the app.
 */

import { DEFAULT_VEHICLE_CLASS, getVehicleCrashProfile, type VehicleClass, type VehicleCrashProfile } from './vehicleProfiles';

export interface MotionSample { t: number; ax: number; ay: number; az: number; gx?: number; gy?: number; gz?: number }
export interface SpeedSample { t: number; speedMps: number; accuracyM?: number }

export interface CrashFeatures {
  peakG: number;               // max |a|/g in impact window
  impactDurationMs: number;    // longest contiguous time |a| stayed above the vehicle threshold
  impactDurationConfirmed: boolean;
  jerkMax: number;             // max d|a|/dt (g/s)
  preFreeFallMs: number;       // ms of |a| < 0.35 g in the 600 ms before impact (phone-drop signature)
  postStillness: number;       // 0..1, fraction of post-window samples within ±0.08 g of 1 g
  gyroPeak: number;            // rad/s, 0 when gyro unavailable
  orientationChange: number;   // 0..1 cosine distance between pre and post gravity vectors
  speedBefore: number;         // m/s median in [-6 s, -1 s]; -1 when unknown
  speedAfter: number;          // m/s median in [+1 s, +settle]; -1 when unknown
  speedDrop: number;           // m/s, max(0, before - after)
  drivingContext: 'DRIVING' | 'STATIONARY' | 'UNKNOWN';
  gyroConfirmation: SensorEvidence;
  orientationConfirmation: SensorEvidence;
  speedConfirmation: SensorEvidence;
  secondaryConfirmation: 'CONFIRMED' | 'NOT_CONFIRMED';
}

export type SensorEvidence = 'CONFIRMED' | 'NOT_CONFIRMED' | 'UNKNOWN';

export type CrashConfidence = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface CrashVerdict {
  at: number;
  score: number;               // 0..1
  confidence: CrashConfidence;
  features: CrashFeatures;
  /** Suggested seconds to wait for "I'm okay" before escalating. */
  probeTimeoutS: number;
}

export interface CrashModel { score(f: CrashFeatures): number }

export interface CrashDetectorOptions {
  candidateG?: number;         // spike that opens a candidate (vehicle-profile default)
  settleMs?: number;           // wait after spike before scoring (vehicle-profile default)
  cooldownMs?: number;         // ignore new candidates after a verdict (vehicle-profile default)
  bufferMs?: number;           // ring buffer length (default 20 000)
  drivingSpeedMps?: number;    // speed treated as "in a vehicle" (default 4 m/s ≈ 15 km/h)
  model?: CrashModel;
  thresholds?: { low: number; medium: number; high: number };
  now?: () => number;
}

const G = 9.81;
const GYRO_CONFIRMATION_RAD_S = 1;
const mag = (s: MotionSample) => Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az) / G;
const median = (xs: number[]) => { if (!xs.length) return -1; const a = [...xs].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Hand-tuned logistic model. Weights are documented so judges can interrogate them. */
export class HeuristicCrashModel implements CrashModel {
  score(f: CrashFeatures): number {
    let z = -5.0;                                              // prior: crashes are rare
    z += 0.75 * Math.min(f.peakG, 12);                         // impact magnitude (saturates ~12 g)
    z += 0.008 * Math.min(f.impactDurationMs, 250);            // sustained load, not a tap
    z += 0.025 * Math.min(f.jerkMax, 60);                      // sharpness of onset
    z += 2.0 * f.postStillness;                                // occupant/phone stopped moving afterwards
    z += 1.5 * f.orientationChange;                            // phone/vehicle attitude changed
    z += 0.3 * Math.min(f.gyroPeak, 8);                        // rotation burst
    z += 0.25 * Math.min(f.speedDrop, 20);                     // speed collapse is the strongest cue
    z -= 0.02 * Math.min(f.preFreeFallMs, 400);                // free-fall before impact ⇒ dropped phone
    if (f.drivingContext === 'STATIONARY') z -= 3.5;           // not moving ⇒ needs a huge signature
    if (f.drivingContext === 'UNKNOWN') z -= 2.5;              // no GPS speed ⇒ be conservative
    if (f.drivingContext === 'DRIVING') {
      z += 0.8;
      // Vehicle kept most of its speed ⇒ pothole / hard braking, not a crash
      if (f.speedAfter >= 0 && f.speedBefore > 0 && f.speedAfter > 0.6 * f.speedBefore) z -= 3.0;
    }
    return sigmoid(z);
  }
}

export function createCrashModel(predict: (f: CrashFeatures) => number): CrashModel {
  return { score: predict };
}

export class CrashDetector {
  readonly vehicleClass: VehicleClass;
  readonly profile: VehicleCrashProfile;
  private motion: MotionSample[] = [];
  private speed: SpeedSample[] = [];
  private candidateAt: number | null = null;
  private candidateHandled = false;
  private lastVerdictAt = -Infinity;
  private listeners: ((v: CrashVerdict) => void)[] = [];
  private lastSampleT = -Infinity;
  private readonly opts: Required<Omit<CrashDetectorOptions, 'model' | 'now'>> & { model: CrashModel; now: () => number };

  constructor(vehicleOrOptions: VehicleClass | VehicleCrashProfile | CrashDetectorOptions = DEFAULT_VEHICLE_CLASS) {
    const isVehicleClass = vehicleOrOptions === 'TWO_WHEELER' || vehicleOrOptions === 'CAR' || vehicleOrOptions === 'TRUCK';
    const isProfile = !isVehicleClass && 'candidateG' in vehicleOrOptions && 'postImpactStillnessMs' in vehicleOrOptions;
    const profile = isVehicleClass
      ? getVehicleCrashProfile(vehicleOrOptions)
      : isProfile
        ? vehicleOrOptions
        : getVehicleCrashProfile(DEFAULT_VEHICLE_CLASS);
    const options = isVehicleClass || isProfile ? {} : vehicleOrOptions;
    this.vehicleClass = isVehicleClass ? vehicleOrOptions : DEFAULT_VEHICLE_CLASS;
    this.profile = profile;
    this.opts = {
      candidateG: options.candidateG ?? profile.candidateG,
      settleMs: options.settleMs ?? profile.postImpactStillnessMs,
      cooldownMs: options.cooldownMs ?? profile.cooldownMs,
      bufferMs: options.bufferMs ?? 20_000,
      drivingSpeedMps: options.drivingSpeedMps ?? 4,
      model: options.model ?? new HeuristicCrashModel(),
      thresholds: options.thresholds ?? { low: 0.3, medium: 0.55, high: 0.8 },
      now: options.now ?? (() => Date.now()),
    };
  }

  onVerdict(cb: (v: CrashVerdict) => void) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter(l => l !== cb); }; }

  pushSpeed(s: SpeedSample) {
    this.speed.push(s);
    const cutoff = s.t - 60_000;
    while (this.speed.length && this.speed[0].t < cutoff) this.speed.shift();
  }

  /** Feed raw motion (m/s², including gravity). Downsampled to ≤100 Hz. */
  pushMotion(s: MotionSample) {
    if (s.t - this.lastSampleT < 10) return;
    this.lastSampleT = s.t;
    this.motion.push(s);
    const cutoff = s.t - this.opts.bufferMs;
    while (this.motion.length && this.motion[0].t < cutoff) this.motion.shift();

    const g = mag(s);
    if (this.candidateAt === null) {
      if (g >= this.opts.candidateG && s.t - this.lastVerdictAt > this.opts.cooldownMs) {
        this.candidateAt = s.t;
        this.candidateHandled = false;
      }
      return;
    }
    if (!this.candidateHandled && s.t - this.candidateAt >= this.opts.settleMs) {
      this.candidateHandled = true;
      this.evaluate(this.candidateAt);
      this.candidateAt = null;
    }
  }

  /**
   * Run a recorded/synthetic trace through an isolated copy of this detector (same model and
   * thresholds) and emit the verdict to this detector's listeners. Used for demos and for
   * regression-testing recorded incidents without disturbing the live sample stream.
   */
  runRecorded(motion: MotionSample[], speeds: SpeedSample[] = []): CrashVerdict | null {
    const clone = new CrashDetector({ ...this.opts, cooldownMs: 0 });
    const captured: CrashVerdict[] = [];
    clone.onVerdict(v => { captured.push(v); });
    let si = 0;
    for (const m of motion) {
      while (si < speeds.length && speeds[si].t <= m.t) clone.pushSpeed(speeds[si++]);
      clone.pushMotion(m);
    }
    clone.flush();
    const verdict = captured[0] ?? null;
    if (verdict) {
      this.lastVerdictAt = this.opts.now();
      for (const l of this.listeners) l(verdict);
    }
    return verdict;
  }

  /** Force evaluation now (e.g. when the sensor stream stops right after a spike). */
  flush() {
    if (this.candidateAt !== null && !this.candidateHandled) {
      this.candidateHandled = true;
      this.evaluate(this.candidateAt);
      this.candidateAt = null;
    }
  }

  /** Black-box snapshot: the ring buffer around a moment (default: whole buffer). */
  snapshot(aroundT?: number, spanMs = 20_000) {
    const t = aroundT ?? this.opts.now();
    return {
      motion: this.motion.filter(m => Math.abs(m.t - t) <= spanMs / 2),
      speed: this.speed.filter(m => Math.abs(m.t - t) <= spanMs / 2),
    };
  }

  extractFeatures(t0: number): CrashFeatures {
    const win = this.motion.filter(m => m.t >= t0 - 1500 && m.t <= t0 + this.opts.settleMs);
    const impact = win.filter(m => m.t >= t0 - 300 && m.t <= t0 + 600);
    const pre = win.filter(m => m.t >= t0 - 1500 && m.t < t0 - 300);
    const preFall = win.filter(m => m.t >= t0 - 600 && m.t < t0 - 40);
    const post = win.filter(m => m.t >= t0 + 800 && m.t <= t0 + this.opts.settleMs);

    let peakG = 0, peakT = t0;
    for (const m of impact) { const g = mag(m); if (g > peakG) { peakG = g; peakT = m.t; } }

    let jerkMax = 0;
    for (let i = 1; i < impact.length; i++) {
      const dt = (impact[i].t - impact[i - 1].t) / 1000;
      if (dt > 0) jerkMax = Math.max(jerkMax, Math.abs(mag(impact[i]) - mag(impact[i - 1])) / dt);
    }

    let impactDurationMs = 0;
    let runStart: number | null = null;
    let previousAboveT: number | null = null;
    for (const sample of impact) {
      if (mag(sample) >= this.opts.candidateG) {
        if (runStart === null) runStart = sample.t;
        previousAboveT = sample.t;
      } else if (runStart !== null) {
        impactDurationMs = Math.max(impactDurationMs, previousAboveT! - runStart);
        runStart = null;
        previousAboveT = null;
      }
    }
    if (runStart !== null) impactDurationMs = Math.max(impactDurationMs, previousAboveT! - runStart);
    const impactDurationConfirmed = impactDurationMs >= this.profile.minImpactDurationMs;

    let preFreeFallMs = 0, run = 0;
    for (let i = 1; i < preFall.length; i++) {
      if (mag(preFall[i]) < 0.35) { run += preFall[i].t - preFall[i - 1].t; preFreeFallMs = Math.max(preFreeFallMs, run); }
      else run = 0;
    }

    const still = post.filter(m => Math.abs(mag(m) - 1) <= 0.08).length;
    const postStillness = post.length ? still / post.length : 0;

    const gyroPeak = Math.max(0, ...win.map(m => (m.gx !== undefined ? Math.sqrt((m.gx || 0) ** 2 + (m.gy || 0) ** 2 + (m.gz || 0) ** 2) : 0)));

    const avg = (xs: MotionSample[]) => xs.length ? xs.reduce((a, m) => [a[0] + m.ax, a[1] + m.ay, a[2] + m.az], [0, 0, 0]).map(v => v / xs.length) : null;
    const gPre = avg(pre), gPost = avg(post);
    let orientationChange = 0;
    if (gPre && gPost) {
      const dot = gPre[0] * gPost[0] + gPre[1] * gPost[1] + gPre[2] * gPost[2];
      const n = Math.hypot(...gPre) * Math.hypot(...gPost);
      orientationChange = n > 0 ? Math.max(0, Math.min(1, (1 - dot / n) / 2)) : 0;
    }

    const speedBefore = median(this.speed.filter(s => s.t >= t0 - 6000 && s.t <= t0 - 1000).map(s => s.speedMps));
    const speedAfter = median(this.speed.filter(s => s.t >= t0 + 1000 && s.t <= t0 + this.opts.settleMs + 500).map(s => s.speedMps));
    const speedDrop = speedBefore >= 0 && speedAfter >= 0 ? Math.max(0, speedBefore - speedAfter) : 0;

    const recent = this.speed.filter(s => s.t >= t0 - 30_000 && s.t <= t0);
    let drivingContext: CrashFeatures['drivingContext'] = 'UNKNOWN';
    if (recent.length >= 3) drivingContext = recent.some(s => s.speedMps >= this.opts.drivingSpeedMps) ? 'DRIVING' : 'STATIONARY';

    const gyroConfirmation: SensorEvidence = gyroPeak >= GYRO_CONFIRMATION_RAD_S ? 'CONFIRMED' : 'NOT_CONFIRMED';
    const orientationAngleDeg = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * orientationChange))) * 180 / Math.PI;
    const orientationConfirmation: SensorEvidence = this.profile.requireOrientationConfirmation
      ? orientationAngleDeg >= (this.profile.orientationChangeDeg ?? 0) ? 'CONFIRMED' : 'NOT_CONFIRMED'
      : 'UNKNOWN';
    const speedKnown = speedBefore >= 0 && speedAfter >= 0;
    const speedConfirmation: SensorEvidence = !this.profile.requireSpeedConfirmation
      ? 'UNKNOWN'
      : !speedKnown
        ? 'UNKNOWN'
        : speedDrop * 3.6 >= (this.profile.minSpeedDropKmh ?? 0) ? 'CONFIRMED' : 'NOT_CONFIRMED';
    const secondaryConfirmation = this.profile.requireGyroConfirmation && gyroConfirmation !== 'CONFIRMED'
      ? 'NOT_CONFIRMED'
      : this.profile.requireOrientationConfirmation && orientationConfirmation !== 'CONFIRMED'
        ? 'NOT_CONFIRMED'
        : this.profile.requireSpeedConfirmation && speedConfirmation === 'NOT_CONFIRMED'
          ? 'NOT_CONFIRMED'
          : 'CONFIRMED';

    void peakT;
    return { peakG, impactDurationMs, impactDurationConfirmed, jerkMax, preFreeFallMs, postStillness, gyroPeak, orientationChange, speedBefore, speedAfter, speedDrop, drivingContext, gyroConfirmation, orientationConfirmation, speedConfirmation, secondaryConfirmation };
  }

  private evaluate(t0: number) {
    const features = this.extractFeatures(t0);
    const score = features.impactDurationConfirmed && features.secondaryConfirmation === 'CONFIRMED'
      ? this.opts.model.score(features)
      : 0;
    const { low, medium, high } = this.opts.thresholds;
    const confidence: CrashConfidence = score >= high ? 'HIGH' : score >= medium ? 'MEDIUM' : score >= low ? 'LOW' : 'NONE';
    const verdict: CrashVerdict = {
      at: t0,
      score,
      confidence,
      features,
      probeTimeoutS: confidence === 'HIGH' ? 10 : confidence === 'MEDIUM' ? 20 : 30,
    };
    this.lastVerdictAt = t0;
    for (const l of this.listeners) l(verdict);
  }
}

/** Compact, human-readable summary for the incident record / PDF. */
export function summarizeVerdict(v: CrashVerdict): Record<string, number | string | boolean> {
  const f = v.features;
  return {
    score: Number(v.score.toFixed(3)),
    confidence: v.confidence,
    peakG: Number(f.peakG.toFixed(2)),
    impactDurationMs: Math.round(f.impactDurationMs),
    impactDurationConfirmed: f.impactDurationConfirmed,
    jerkMaxGps: Number(f.jerkMax.toFixed(1)),
    preFreeFallMs: Math.round(f.preFreeFallMs),
    postStillness: Number(f.postStillness.toFixed(2)),
    gyroPeakRadS: Number(f.gyroPeak.toFixed(2)),
    orientationChange: Number(f.orientationChange.toFixed(2)),
    speedBeforeKmh: f.speedBefore >= 0 ? Math.round(f.speedBefore * 3.6) : 'n/a',
    speedAfterKmh: f.speedAfter >= 0 ? Math.round(f.speedAfter * 3.6) : 'n/a',
    drivingContext: f.drivingContext,
    secondaryConfirmation: f.secondaryConfirmation,
  };
}
