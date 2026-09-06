import { Geolocation } from '@capacitor/geolocation';
import { Motion } from '@capacitor/motion';
import { Capacitor } from '@capacitor/core';

export const hardwareService = {
  isNative: Capacitor.isNativePlatform(),

  async getCurrentLocation() {
    try {
      if (this.isNative) {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
        return { lat: position.coords.latitude, lng: position.coords.longitude };
      } else {
        return new Promise<{ lat: number, lng: number }>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err => reject(err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        });
      }
    } catch (err) {
      console.warn("Location error:", err);
      throw err;
    }
  },

  /** Streams position and, when the GPS reports it, ground speed (m/s) + accuracy (m). */
  async watchLocation(callback: (lat: number, lng: number, speedMps?: number | null, accuracyM?: number) => void) {
    try {
      if (this.isNative) {
        return await Geolocation.watchPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }, (position, err) => {
          if (position) {
            callback(position.coords.latitude, position.coords.longitude, position.coords.speed ?? null, position.coords.accuracy);
          }
        });
      } else {
        const id = navigator.geolocation.watchPosition(
          pos => callback(pos.coords.latitude, pos.coords.longitude, pos.coords.speed ?? null, pos.coords.accuracy),
          err => console.warn(err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        return id.toString();
      }
    } catch (err) {
      console.warn("Watch location error:", err);
      return null;
    }
  },

  async clearWatch(watchId: string) {
    if (this.isNative) {
      await Geolocation.clearWatch({ id: watchId });
    } else {
      navigator.geolocation.clearWatch(parseInt(watchId, 10));
    }
  },

  /**
   * Streams accelerometer (m/s², including gravity) and gyroscope (rad/s) samples.
   * Rotation rates arrive in deg/s from both the browser and Capacitor and are converted here.
   */
  async watchMotion(callback: (sample: { t: number; ax: number; ay: number; az: number; gx?: number; gy?: number; gz?: number }) => void) {
    const DEG = Math.PI / 180;
    if (this.isNative) {
      try {
        return await Motion.addListener('accel', (event) => {
          const acc = event.accelerationIncludingGravity || event.acceleration;
          if (!acc) return;
          const r = event.rotationRate;
          callback({
            t: Date.now(), ax: acc.x || 0, ay: acc.y || 0, az: acc.z || 0,
            gx: r ? (r.beta || 0) * DEG : undefined, gy: r ? (r.gamma || 0) * DEG : undefined, gz: r ? (r.alpha || 0) * DEG : undefined,
          });
        });
      } catch (err) {
        console.warn("Capacitor Motion error:", err);
        return null;
      }
    } else {
      const handler = (e: DeviceMotionEvent) => {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;
        const r = e.rotationRate;
        callback({
          t: Date.now(), ax: acc.x || 0, ay: acc.y || 0, az: acc.z || 0,
          gx: r && r.beta != null ? r.beta * DEG : undefined, gy: r && r.gamma != null ? r.gamma * DEG : undefined, gz: r && r.alpha != null ? r.alpha * DEG : undefined,
        });
      };
      window.addEventListener('devicemotion', handler);
      return handler;
    }
  },

  async clearMotionWatch(watchId: any) {
    if (this.isNative) {
      if (watchId && watchId.remove) {
        await watchId.remove();
      }
    } else {
      window.removeEventListener('devicemotion', watchId);
    }
  },

  async requestPermissions() {
    if (this.isNative) {
      try {
        await Geolocation.requestPermissions();
      } catch (e) {
        console.warn("Capacitor Geolocation permission request failed", e);
      }
      return 'granted';
    } else {
      if (typeof (DeviceMotionEvent as any)?.requestPermission === 'function') {
        try {
          const response = await (DeviceMotionEvent as any).requestPermission();
          return response;
        } catch (e) {
          console.warn("DeviceMotionEvent request failed", e);
          return 'denied';
        }
      }
      return 'granted';
    }
  }
};
