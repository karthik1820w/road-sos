import { useState, useRef, useEffect } from 'react';

export function useDrivingMode(
  medicalInfo: any,
  saveLogEntry: (reason: string, location: any) => void,
  userLocation: any,
  getSocket: () => any
) {
  const [isDrivingMode, setIsDrivingMode] = useState(false);
  const [drivingModeEnabling, setDrivingModeEnabling] = useState(false);
  const [drivingModeLoading, setDrivingModeLoading] = useState(false);

  const toggleDrivingMode = async () => {
    if (drivingModeLoading || drivingModeEnabling) return;
    setDrivingModeLoading(true);
    if (!isDrivingMode) {
      setDrivingModeEnabling(true);
      setTimeout(() => {
        setIsDrivingMode(true);
        setDrivingModeEnabling(false);
        setDrivingModeLoading(false);
        saveLogEntry('Driving mode manually activated', userLocation);
      }, 1500);
    } else {
      setIsDrivingMode(false);
      setDrivingModeLoading(false);
      saveLogEntry('Driving mode manually deactivated', userLocation);
    }
  };

  const forceDrivingModeOff = async (reason: string) => {
    if (!isDrivingMode) return;
    setIsDrivingMode(false);
    saveLogEntry(Driving mode forced off: \, userLocation);
    
    try {
      const p = medicalInfo?.phone?.replace(/[^\d+]/g, '');
      if (p) {
        await fetch('/api/driving-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: p, active: false })
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const socket = getSocket();
    const handleDrivingModeChanged = (data: any) => {
      const p = medicalInfo?.phone?.replace(/[^\d+]/g, '');
      if (data.phone === p) {
        if (!data.active && isDrivingMode) {
           setIsDrivingMode(false);
        }
      }
    };
    socket.on('driving_mode:changed', handleDrivingModeChanged);
    return () => {
      socket.off('driving_mode:changed', handleDrivingModeChanged);
    };
  }, [medicalInfo?.phone, isDrivingMode, getSocket]);

  return {
    isDrivingMode,
    setIsDrivingMode,
    drivingModeEnabling,
    drivingModeLoading,
    toggleDrivingMode,
    forceDrivingModeOff
  };
}
