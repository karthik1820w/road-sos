import React from 'react';
import { TrafficUpdate } from '../services/trafficService';
import { AlertTriangle, Clock, MapPin, HardHat, CarFront, Bell, CheckCircle2 } from 'lucide-react';

export const TrafficUpdatesUI: React.FC<{ update: TrafficUpdate }> = ({ update }) => {
  if (update.error) {
    return (
      <div className="flex flex-col gap-4 mb-4">
         <div className="p-4 rounded-2xl border bg-red-500/10 border-red-500/20 text-red-400 flex items-start gap-3">
           <AlertTriangle className="flex-shrink-0" />
           <p className="text-sm font-bold">{update.error}</p>
         </div>
      </div>
    );
  }

  const getBannerColor = () => {
    if (update.congestionLevel === 'High') return 'bg-red-500/10 border-red-500/20 text-red-400';
    if (!update.trafficPresent) return 'bg-green-500/10 border-green-500/20 text-green-400';
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

  // Group incidents by label
  const groupedIncidents = update.incidents.reduce((acc, inc) => {
    if (!acc[inc.label]) {
      acc[inc.label] = { ...inc, count: 0 };
    }
    acc[inc.label].count += 1;
    if (acc[inc.label].distKm && inc.distKm && parseFloat(inc.distKm) < parseFloat(acc[inc.label].distKm as string)) {
        acc[inc.label].distKm = inc.distKm;
    }
    return acc;
  }, {} as Record<string, typeof update.incidents[0] & { count: number }>);

  const displayIncidents = Object.values(groupedIncidents).slice(0, 10);

  return (
    <div className="flex flex-col gap-4 mb-4">
      <div className={`p-4 rounded-2xl border flex items-start gap-3 ${getBannerColor()}`}>
        {update.congestionLevel === 'High' ? <AlertTriangle className="flex-shrink-0" /> : (!update.trafficPresent ? <CheckCircle2 className="flex-shrink-0" /> : <Bell className="flex-shrink-0" />)}
        <div>
          <h4 className="font-bold text-sm uppercase tracking-wider mb-1">Traffic Overview - {update.location}</h4>
          <p className="text-xs opacity-90">
            {!update.trafficPresent ? `✅ Roads are clear within ${update.radius} of ${update.location}. No incidents detected.` : (
              update.congestionLevel === 'High' ? `🚨 High traffic activity within ${update.radius}. ${update.incidents.length} incident(s) detected near ${update.location}.` :
              `⚠️ Moderate traffic detected within ${update.radius} of ${update.location}.`
            )}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase opacity-70">Congestion Level</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
               <div className={`h-full rounded-full ${getCongestionBar()}`} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <AlertTriangle size={14} /> Reported Incidents
          </h4>
          {update.incidents.length === 0 ? (
            <p className="text-slate-500 text-xs">No hazards or incidents found nearby.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {displayIncidents.map((inc, i) => (
                <div key={i} className={`p-2 bg-slate-800 border ${inc.type === 'danger' ? 'border-red-500/50 text-red-100' : inc.type === 'warning' ? 'border-amber-500/50 text-amber-100' : 'border-slate-700 text-slate-300'} rounded-xl flex items-center justify-between text-xs`}>
                  <span className="font-medium">{inc.label} {inc.count > 1 ? `(${inc.count})` : ''}</span>
                  {inc.distKm && <span className="opacity-70 font-mono text-[10px]">{inc.distKm} km</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Clock size={14} /> Route Estimates
          </h4>
          {update.routes.length === 0 ? (
            <p className="text-slate-500 text-xs">No route data near you.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {update.routes.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-slate-800/50">
                  <span className="text-xs font-medium text-slate-300">{r.name}</span>
                  <div className="flex items-center gap-3 text-xs font-bold">
                    <span className="text-slate-400 font-mono">{r.durMin} min</span>
                    <span className="text-slate-400 font-mono">{r.distKm} km</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${r.congestion === 'High' ? 'bg-red-500/20 text-red-400' : r.congestion === 'Moderate' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>{r.congestion}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      
      <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest">
        Last updated: {update.fetchedAt}
      </p>
    </div>
  );
};
