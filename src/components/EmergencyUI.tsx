import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, AlertTriangle, X } from 'lucide-react';

interface EmergencyUIProps {
  autoTriggered?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const EmergencyUI: React.FC<EmergencyUIProps> = ({ autoTriggered, onCancel, onConfirm }) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-red-950/90 backdrop-blur-xl"
    >
      <div className="text-center max-w-sm w-full">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 0.5 }}
          className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_50px_rgba(255,255,255,0.4)]"
        >
          <AlertTriangle size={48} className="text-red-600" />
        </motion.div>
        
        <h2 className="text-4xl font-black text-white uppercase mb-4 tracking-tighter">
          {autoTriggered ? "Telemetry Event" : "System Alert"}
        </h2>
        
        <p className="text-white/60 mb-12 uppercase tracking-widest text-[10px] font-bold leading-relaxed">
          Unusual inertial activity detected. Please confirm system status to resume normal operations or automated protocols will continue.
        </p>
        
        <div className="space-y-4">
          <button 
            onClick={onConfirm}
            className="w-full py-5 rounded-2x border-4 border-white bg-white text-slate-900 font-black uppercase tracking-widest text-sm hover:bg-slate-100 transition-all flex items-center justify-center gap-3 shadow-2xl"
          >
            <ShieldCheck size={20} />
            Authorize Relay
          </button>
          
          <button 
            onClick={onCancel}
            className="w-full py-4 rounded-2xl border border-white/20 text-white/40 font-bold uppercase tracking-widest text-[10px] hover:text-white transition-all flex items-center justify-center gap-2"
          >
            <X size={14} />
            Clear Log (System Safe)
          </button>
        </div>
      </div>
    </motion.div>
  );
};
