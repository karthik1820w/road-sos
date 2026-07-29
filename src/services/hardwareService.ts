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

  async watchLocation(callback: (lat: number, lng: number) => void) {
    try {
      if (this.isNative) {
        return await Geolocation.watchPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }, (position, err) => {
          if (position) {
            callback(position.coords.latitude, position.coords.longitude);
          }
        });
      } else {
        const id = navigator.geolocation.watchPosition(
          pos => callback(pos.coords.latitude, pos.coords.longitude),
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

  async watchMotion(callback: (x: number, y: number, z: number) => void) {
    if (this.isNative) {
      try {
        return await Motion.addListener('accel', (event) => {
          let acc = event.accelerationIncludingGravity || event.acceleration;
          if (acc) {
            callback(acc.x || 0, acc.y || 0, acc.z || 0);
          }
        });
      } catch (err) {
        console.warn("Capacitor Motion error:", err);
        return null;
      }
    } else {
      const handler = (e: DeviceMotionEvent) => {
        if (e.accelerationIncludingGravity) {
          const { x, y, z } = e.accelerationIncludingGravity;
          callback(x || 0, y || 0, z || 0);
        }
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
