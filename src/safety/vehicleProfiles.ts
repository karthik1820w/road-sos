export type VehicleClass = 'TWO_WHEELER' | 'CAR' | 'TRUCK';

export interface VehicleCrashProfile {
  candidateG: number;
  confirmedG: number;
  minImpactDurationMs: number;
  minSpeedDropKmh?: number;
  orientationChangeDeg?: number;
  requireSpeedConfirmation: boolean;
  requireOrientationConfirmation: boolean;
  requireGyroConfirmation: boolean;
  postImpactStillnessMs: number;
  cooldownMs: number;
}

export const VEHICLE_CRASH_PROFILES: Readonly<Record<VehicleClass, VehicleCrashProfile>> = {
  TWO_WHEELER: {
    candidateG: 1.8,
    confirmedG: 2.5,
    minImpactDurationMs: 80,
    orientationChangeDeg: 45,
    requireSpeedConfirmation: false,
    requireOrientationConfirmation: true,
    requireGyroConfirmation: true,
    postImpactStillnessMs: 3000,
    cooldownMs: 10000,
  },
  CAR: {
    candidateG: 3.0,
    confirmedG: 4.0,
    minImpactDurationMs: 100,
    minSpeedDropKmh: 15,
    requireSpeedConfirmation: true,
    requireOrientationConfirmation: false,
    requireGyroConfirmation: true,
    postImpactStillnessMs: 3000,
    cooldownMs: 10000,
  },
  TRUCK: {
    candidateG: 5.0,
    confirmedG: 6.0,
    minImpactDurationMs: 120,
    minSpeedDropKmh: 15,
    requireSpeedConfirmation: true,
    requireOrientationConfirmation: false,
    requireGyroConfirmation: true,
    postImpactStillnessMs: 4000,
    cooldownMs: 15000,
  },
};

export const DEFAULT_VEHICLE_CLASS: VehicleClass = 'CAR';
export const VEHICLE_CLASS_STORAGE_KEY = 'roadsos_vehicle_class';

export function getVehicleCrashProfile(vehicleClass: VehicleClass): VehicleCrashProfile {
  return VEHICLE_CRASH_PROFILES[vehicleClass];
}

export function setStoredVehicleClass(vehicleClass: VehicleClass): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VEHICLE_CLASS_STORAGE_KEY, vehicleClass);
    }
  } catch {
    // Storage is optional; ignore write failures.
  }
}

export function getStoredVehicleClass(): VehicleClass {
  try {
    const stored = typeof localStorage !== 'undefined'
      ? localStorage.getItem(VEHICLE_CLASS_STORAGE_KEY)
      : null;
    if (stored === 'TWO_WHEELER' || stored === 'CAR' || stored === 'TRUCK') return stored;
  } catch {
    // Storage is optional; use the safe default when unavailable.
  }
  return DEFAULT_VEHICLE_CLASS;
}
