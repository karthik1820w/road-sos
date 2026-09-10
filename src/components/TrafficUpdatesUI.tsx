import React from 'react';
import { TrafficUpdate } from '../services/trafficService';
import { AlertTriangle, Clock, MapPin, HardHat, CarFront, Bell, CheckCircle2, ThumbsUp, Radio, Plus } from 'lucide-react';

export const TrafficUpdatesUI: React.FC<{
  update: TrafficUpdate,
  onConfirm?: (id: string) => void,
  onReportHazard?: () => void
}> = ({ update, onConfirm, onReportHazard }) => {
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

  const getCongestionBar = () => {
    if (update.congestionLevel === 'Low') return 'bg-green-500 w-1/4';
    if (update.congestionLevel === 'Moderate') return 'bg-amber-500 w-1/2';
    return 'bg-red-500 w-3/4';
  };

  const crowdIncidents = update.incidents.filter(i => i.source === 'crowd');
  const staticIncidents = update.incidents.filter(i => i.source === 'static');
  const weatherIncidents = update.incidents.filter(i => i.source === 'weather');

  return (
    <div className="flex flex-col gap-4 mb-4">
      <div className={`p-4 rounded-2xl border flex items-start gap-3 ${getBannerColor()}`}>
        {update.congestionLevel === 'High' ? <AlertTriangle className="flex-shrink-0" /> : (!update.trafficPresent ? <CheckCircle2 className="flex-shrink-0" /> : <Bell className="flex-shrink-0" />)}
        <div>
          <h4 className="font-bold text-sm uppercase tracking-wider mb-1">Traffic & Weather - {update.location}</h4>
          <p className="text-xs opacity-90">
            {!update.trafficPresent ? `✅ Roads are clear within ${update.radius} of ${update.location}. No incidents detected.` : (
              update.congestionLevel === 'High' ? `🚨 High traffic activity within ${update.radius}. ${update.incidents.length} incident(s) detected near ${update.location}.` :
              `⚠️ Moderate traffic detected within ${update.radius} of ${update.location}.`
            )}
          </p>
          {update.weather && (
            <div className="mt-2 flex items-center gap-4 text-xs font-medium text-slate-300 bg-black/20 p-2 rounded-lg w-fit border border-white/5">
              <span title="Temperature">🌡️ {update.weather.temperature}°C</span>
              <span title="Rain">🌧️ {update.weather.rain} mm</span>
              <span title="Precipitation">💦 {update.weather.precipitation} mm</span>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase opacity-70">Congestion Level</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
               <div className={`h-full rounded-full ${getCongestionBar()}`} />
            </div>
          </div>
        </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl flex flex-col h-full">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <AlertTriangle size={14} /> Reported Incidents
          </h4>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {update.incidents.length === 0 ? (
              <p className="text-slate-500 text-xs">No hazards or incidents found nearby.</p>
            ) : (
              <>
                {weatherIncidents.length > 0 && (
                  <div>
                    <h5 className="text-[10px] text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-1"><AlertTriangle size={10}/> Weather Advisories</h5>
                    <div className="flex flex-col gap-2">
                      {weatherIncidents.map((inc, i) => (
                        <div key={i} className="p-2 bg-cyan-900/40 border border-cyan-500/50 text-cyan-100 rounded-xl flex items-center justify-between text-xs">
                          <span className="font-medium font-bold">{inc.label}</span>
                          {inc.distKm && <span className="opacity-70 font-mono text-[10px] ml-2">{inc.distKm} km</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {crowdIncidents.length > 0 && (
                  <div>
                    <h5 className="text-[10px] text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Radio size={10}/> Live Reports</h5>
                    <div className="flex flex-col gap-2">
                      {crowdIncidents.map((inc, i) => (
                        <div key={i} className="p-2 bg-slate-800 border border-blue-500/30 text-blue-100 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <span className="font-medium">{inc.label}</span>
                            {inc.distKm && <span className="opacity-70 font-mono text-[10px] ml-2">{inc.distKm} km</span>}
                          </div>
                          {onConfirm && inc.id && (
                            <button onClick={() => onConfirm(inc.id!)} className="flex items-center gap-1 text-[10px] bg-blue-500/20 hover:bg-blue-500/40 px-2 py-1 rounded transition-colors">
                              <ThumbsUp size={10} /> {inc.confirmCount || 0}
                            </button>
                          )}
                        </div>
                      ))}

                    </div>
                  </div>
                )}

                {staticIncidents.length > 0 && (
                  <div>
                    <h5 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Static Hazards</h5>
                    <div className="flex flex-col gap-2">
                      {staticIncidents.map((inc, i) => (
                        <div key={i} className={`p-2 bg-slate-800/50 border ${inc.type === 'danger' ? 'border-red-500/30 text-red-200' : inc.type === 'warning' ? 'border-amber-500/30 text-amber-200' : 'border-slate-700 text-slate-300'} rounded-xl flex items-center justify-between text-xs`}>
                          <span className="font-medium">{inc.label}</span>
                          {inc.distKm && <span className="opacity-70 font-mono text-[10px]">{inc.distKm} km</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {onReportHazard && (
            <button onClick={onReportHazard} className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors border border-slate-700">
              <Plus size={14} /> Report Hazard
            </button>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl h-full flex flex-col">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Clock size={14} /> Route Estimates
          </h4>
          {update.routes.length === 0 ? (
            <p className="text-slate-500 text-xs">No route data near you.</p>
          ) : (
            <div className="flex flex-col gap-2 flex-1 overflow-y-auto pr-2">
              {update.routes.map((r, i) => (
                <div key={i} className="flex flex-col gap-1 p-3 rounded-xl bg-slate-800/50 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300 truncate pr-2" title={r.name}>{r.name}</span>
                    {r.dataSource === 'estimated' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-slate-700 text-slate-400 font-bold shrink-0">Estimated</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs font-bold">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 font-mono">{r.durMin} min</span>
                      <span className="text-slate-400 font-mono text-[10px] opacity-70">{r.distKm} km</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${r.congestion === 'High' ? 'bg-red-500/20 text-red-400' : r.congestion === 'Moderate' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>
                      {r.congestion}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest mt-2">
        <div className={`w-2 h-2 rounded-full ${update.updateSource === 'socket' ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
        <span>{update.updateSource === 'socket' ? 'Live' : 'Polled'} • Last updated: {update.fetchedAt}</span>
      </div>
    </div>
  );
};
