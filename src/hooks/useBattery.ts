import { useState, useEffect } from 'react';

export interface BatteryState {
  supported: boolean;
  loading: boolean;
  level: number | null;
  charging: boolean | null;
}

export const useBattery = (): BatteryState => {
  const [state, setState] = useState<BatteryState>({
    supported: true,
    loading: true,
    level: null,
    charging: null,
  });

  useEffect(() => {
    let battery: any;

    const handleChange = () => {
      if (battery) {
        setState({
          supported: true,
          loading: false,
          level: battery.level,
          charging: battery.charging,
        });
      }
    };

    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((b: any) => {
        battery = b;
        handleChange();
        b.addEventListener('levelchange', handleChange);
        b.addEventListener('chargingchange', handleChange);
      }).catch(() => {
        setState({ supported: false, loading: false, level: null, charging: null });
      });
    } else {
      setState({ supported: false, loading: false, level: null, charging: null });
    }

    return () => {
      if (battery) {
        battery.removeEventListener('levelchange', handleChange);
        battery.removeEventListener('chargingchange', handleChange);
      }
    };
  }, []);

  return state;
};
