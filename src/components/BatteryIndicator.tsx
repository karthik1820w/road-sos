import React from 'react';
import { useBattery } from '../hooks/useBattery';
import { Battery, BatteryCharging, BatteryWarning } from 'lucide-react';

export const BatteryIndicator: React.FC = () => {
  const { supported, loading, level, charging } = useBattery();

  if (!supported || loading || level === null) return null;

  const percentage = Math.round(level * 100);
  const isLow = percentage <= 15 && !charging;

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest ${isLow ? 'bg-red-950/50 border-red-500/50 text-red-400 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-slate-900 border-white/10 text-slate-400'} backdrop-blur-sm transition-all duration-500`}>
      {charging ? (
        <BatteryCharging size={14} className="text-emerald-400" />
      ) : isLow ? (
        <BatteryWarning size={14} className="text-red-400" />
      ) : (
        <Battery size={14} />
      )}
      <span>{percentage}%</span>
      {isLow && <span className="ml-1">Low Power!</span>}
    </div>
  );
};
