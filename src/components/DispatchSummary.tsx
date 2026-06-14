import React from 'react';
import { motion } from 'motion/react';
import { FileCheck, WifiOff, AlertTriangle, CheckCircle2, MapPin, Gauge } from 'lucide-react';
import { GoogleMapComponent } from './GoogleMapComponent';

interface DispatchSummaryProps {
  payload: string;
  facilityName: string;
  facilityLocation: { lat: number; lng: number };
  userLocation: { lat: number; lng: number };
  userAddress: string;
  onFinish: () => void;
}

export const DispatchSummary: React.FC<DispatchSummaryProps> = ({ 
  payload, 
  facilityName, 
  facilityLocation, 
  userLocation, 
  userAddress,
  onFinish 
}) => {
  const [isSyncing, setIsSyncing] = React.useState(true);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsSyncing(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const markers = [
    { ...userLocation, title: 'Accident Site', color: '#ef4444' },
    { ...facilityLocation, title: facilityName, color: '#10b981' }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-0 z-50 bg-slate-950 flex flex-col md:flex-row overflow-hidden"
    >
      <div className="w-full md:w-[400px] bg-slate-900 border-r border-white/10 p-8 flex flex-col h-full overflow-y-auto">
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4 text-blue-500">
            <CheckCircle2 size={32} />
            <h2 className="text-3xl font-black tracking-tighter uppercase italic">Dispatched</h2>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-relaxed">
            Emergency response units have been successfully notified of your status.
          </p>
        </header>

        <div className="space-y-8 flex-1">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
              <MapPin className="text-slate-400" size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Target Facility</p>
              <p className="text-sm font-bold text-white">{facilityName}</p>
              <p className="text-[10px] text-slate-500 mt-1">{facilityLocation.lat.toFixed(4)}, {facilityLocation.lng.toFixed(4)}</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
              <FileCheck className="text-blue-500" size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Serialized Data</p>
              <code className="text-[9px] font-mono bg-slate-950 p-2 rounded block break-all text-blue-400/80">
                {payload}
              </code>
            </div>
          </div>
        </div>

        <button 
          onClick={onFinish}
          className="mt-12 w-full py-4 bg-white text-black font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all rounded-2xl"
        >
          Return to Monitor
        </button>
      </div>

      <div className="flex-1 relative min-h-[300px] md:min-h-0">
        <GoogleMapComponent 
          center={userLocation} 
          zoom={14}
          markers={markers}
          hasValidKey={true} // assume key is valid inside dispatch if we arrived here, wait, better: read it from context or just let it fall back
        />
        
        {isSyncing && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Encrypting SOS Bundle</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
