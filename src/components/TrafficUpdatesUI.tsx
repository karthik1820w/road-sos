import React from 'react';
import { TrafficUpdate } from '../services/trafficService';
import { AlertTriangle, Clock, MapPin, HardHat, CarFront, Bell, CheckCircle2 } from 'lucide-react';

export const TrafficUpdatesUI: React.FC<{ update: TrafficUpdate }> = ({ update }) => {
  const getBannerColor = () => {
    if (update.congestionLevel === 'High') return 'bg-red-500/10 border-red-500/20 text-red-400';
    if (update.incidents.length > 2) return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    if (update.congestionLevel === 'Low' && update.incidents.length === 0) return 'bg-green-500/10 border-green-500/20 text-green-400';
    return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
  };

  const getCongestionColor = () => {
    if (update.congestionLevel === 'Low') return 'text-green-400';
    if (update.congestionLevel === 'Moderate') return 'text-amber-400';
    return 'text-red-400';
  };

  const getCongestionBar = () => {
    if (update.congestionLevel === 'Low') return 'bg-green-500 w-1/4';
    if (update.congestionLevel === 'Moderate') return 'bg-amber-500 w-1/2';
    return 'bg-red-500 w-3/4';
  };

  return (
    <div className="flex flex-col gap-4 mb-4">
      <div className={`p-4 rounded-2xl border flex items-start gap-3 ${getBannerColor()}`}>
        {update.congestionLevel === 'High' ? <AlertTriangle className="flex-shrink-0" /> : <Bell className="flex-shrink-0" />}
        <div>
          <h4 className="font-bold text-sm uppercase tracking-wider mb-1">Traffic Overview - {update.location}</h4>
          <p className="text-xs opacity-90">
            Congestion is currently <span className="font-bold uppercase">{update.congestionLevel}</span>. 
            {update.incidents.length > 0 ? ` Detected ${update.incidents.length} incidents in your area.` : ' No major incidents detected.'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase opacity-70">Congestion Level</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
               <div className={`h-full rounded-full ${getCongestionBar()}`} />
            </div>
          </div>
        </div>
      </div>

      {(update.incidents.length > 0 || update.routes.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {update.incidents.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle size={14} /> Reported Incidents
              </h4>
              <div className="flex flex-wrap gap-2">
                {update.incidents.map((inc, i) => (
                  <div key={i} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-full flex items-center gap-2 text-xs text-slate-300">
                    {inc.type === 'construction' && <HardHat size={12} className="text-amber-500" />}
                    {inc.type === 'hazard' && <AlertTriangle size={12} className="text-red-500" />}
                    {!['construction', 'hazard'].includes(inc.type) && <CarFront size={12} className="text-blue-500" />}
                    <span className="font-medium">{inc.name}</span>
                    {inc.count && inc.count > 1 && (
                      <span className="bg-slate-700 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-300 ml-1">
                        {inc.count} reports
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {update.routes.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Clock size={14} /> Route Estimates
              </h4>
              <div className="flex flex-col gap-2">
                {update.routes.slice().sort((a,b) => (a.duration || 0) - (b.duration || 0)).map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-slate-800/50">
                    <span className="text-xs font-medium text-slate-300">{r.name}</span>
                    <div className="flex items-center gap-3 text-xs font-bold">
                      <span className="text-slate-400">{r.distance} km</span>
                      <span className="text-emerald-400">{r.duration} min</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
      
      <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest">
        Last updated: {update.lastUpdated.toLocaleTimeString()}
      </p>
    </div>
  );
};
