import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Power, X, AlertTriangle } from 'lucide-react';

interface SOSTriggerProps {
  onTrigger: () => void;
  isPulsing?: boolean;
}

export const SOSTrigger: React.FC<SOSTriggerProps> = ({ onTrigger, isPulsing = false }) => {
  const [pressState, setPressState] = useState<'IDLE' | 'PRESSING' | 'COUNTDOWN'>('IDLE');
  const [holdProgress, setHoldProgress] = useState(0);
  const [countdown, setCountdown] = useState(5);
  
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const vibrationTriggeredRef = useRef<boolean>(false);

  const HOLD_DURATION = 5000; // 5 seconds

  const startHolding = () => {
    if (pressState !== 'IDLE') return;
    
    setPressState('PRESSING');
    setHoldProgress(0);
    startTimeRef.current = Date.now();
    vibrationTriggeredRef.current = false;

    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      setHoldProgress(progress);

      if (elapsed >= 3000 && !vibrationTriggeredRef.current) {
        vibrationTriggeredRef.current = true;
        if ('vibrate' in navigator) {
          // Unique long-vibration pattern
          navigator.vibrate([1000, 200, 1000, 200, 1000]);
        }
      }

      if (elapsed >= HOLD_DURATION) {
        clearInterval(holdTimerRef.current!);
        setPressState('COUNTDOWN');
        setCountdown(5);
      }
    }, 50);
  };

  const stopHolding = () => {
    if (pressState === 'PRESSING') {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
      setPressState('IDLE');
      setHoldProgress(0);
      if ('vibrate' in navigator) {
        navigator.vibrate(0); // Cancel any ongoing vibration
      }
    }
  };

  useEffect(() => {
    if (pressState === 'COUNTDOWN') {
      countdownTimerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current!);
            onTrigger();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [pressState, onTrigger]);

  const cancelSOS = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setPressState('IDLE');
    setCountdown(5);
    setHoldProgress(0);
  };

  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence mode="wait">
        {pressState === 'IDLE' || pressState === 'PRESSING' ? (
          <motion.div 
            key="button"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative"
          >
            <button
              onMouseDown={startHolding}
              onMouseUp={stopHolding}
              onMouseLeave={stopHolding}
              onTouchStart={startHolding}
              onTouchEnd={stopHolding}
              className={`group relative w-32 h-32 rounded-full overflow-hidden flex items-center justify-center border-4 shadow-2xl active:scale-95 transition-all ${isPulsing ? 'bg-red-900 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.6)] animate-[pulse_1.5s_ease-in-out_infinite]' : 'bg-slate-900 border-slate-800'}`}
            >
              {/* Progress Ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="60"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-slate-950"
                />
                <motion.circle
                  cx="64"
                  cy="64"
                  r="60"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray="377"
                  strokeDashoffset={377 - (377 * holdProgress) / 100}
                  className="text-red-600"
                  style={{ strokeLinecap: 'round' }}
                />
              </svg>

              <div className="relative z-10 flex flex-col items-center gap-1">
                <Power size={32} className={`transition-colors ${pressState === 'PRESSING' ? 'text-red-500 scale-110' : 'text-slate-400'}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hold SOS</span>
              </div>
            </button>
            
            {pressState === 'PRESSING' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-full text-center"
              >
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-[0.2em] animate-pulse">Stay Holding...</p>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="countdown"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="w-full max-w-xs bg-red-600 rounded-3xl p-6 shadow-2xl shadow-red-900/40 relative overflow-hidden"
          >
            <motion.div 
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 5, ease: 'linear' }}
              className="absolute top-0 left-0 h-1 bg-white/40"
            />
            
            <div className="flex flex-col items-center">
              <AlertTriangle className="text-white mb-2 animate-bounce" size={32} />
              <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-1">SOS Initiating</h3>
              <p className="text-[10px] font-bold text-red-100 uppercase tracking-widest mb-6">Broadcasting in {countdown}s</p>
              
              <button 
                onClick={cancelSOS}
                className="w-full py-4 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-2xl flex items-center justify-center gap-2 transition-all border border-white/10"
              >
                <X size={18} className="text-white" />
                <span className="text-sm font-black text-white uppercase tracking-widest">Abort Response</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
