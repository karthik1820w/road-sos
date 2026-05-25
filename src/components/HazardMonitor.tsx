import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';

export const HazardMonitor = () => {
  const [hazards, setHazards] = useState<string[]>([]);

  useEffect(() => {
    // Hazards will be dynamically set by external data sources in the future.
  }, []);

  return (
    <div className="fixed top-8 right-8 z-40 flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence>
        {hazards.map((h, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="bg-amber-500/10 backdrop-blur-md border border-amber-500/30 px-3 py-1.5 rounded-full flex items-center gap-2"
          >
            <AlertCircle size={14} className="text-amber-500" />
            <span className="text-[10px] font-bold text-amber-200 uppercase tracking-tight">{h}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
