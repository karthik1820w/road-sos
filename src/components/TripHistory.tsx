import React, { useState } from 'react';
import { Map, Clock, Navigation, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function TripHistory() {
  const [isOpen, setIsOpen] = useState(false);

  const manualTrips: any[] = [];

  return (
    <section id="trip-history-section" className="mb-8 w-full max-w-full">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-6 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <Map className="text-indigo-500" size={24} />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-black uppercase tracking-tight text-white">Trip History</h3>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-1">Recent Driving Logs & Safety Data</p>
            </div>
          </div>
          <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-6 pb-6 overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                {manualTrips.length > 0 ? manualTrips.map(trip => (
                  <div key={trip.id} className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl flex flex-col gap-3 transition-transform hover:-translate-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-400">{trip.date}</span>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${trip.type === 'safe' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        {trip.type === 'safe' ? 'Safe Arrival' : 'Alert Triggered'}
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-indigo-400 shrink-0" />
                        <span className="text-sm font-bold text-slate-200 truncate">{trip.start}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Navigation size={14} className="text-indigo-400 rotate-90 shrink-0" />
                        <span className="text-sm font-bold text-slate-200 truncate">{trip.end}</span>
                      </div>
                    </div>
                    
                    <div className="h-px w-full bg-slate-800 my-1" />
                    
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock size={12} />
                        <span className="text-xs font-mono">{trip.duration}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Map size={12} />
                        <span className="text-xs font-mono">{trip.distance}</span>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="col-span-1 md:col-span-3 text-center py-8">
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">No Trips Logged Yet</p>
                    <p className="text-xs text-slate-400 mt-2">Activate driving mode to start recording your trips.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
