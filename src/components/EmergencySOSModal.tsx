import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface EmergencySOSModalProps {
  isOpen: boolean;
  isConfirmed: boolean;
  onClose: () => void;
}

export const EmergencySOSModal: React.FC<EmergencySOSModalProps> = ({ 
  isOpen, 
  isConfirmed, 
  onClose 
}) => {
  useEffect(() => {
    if (isConfirmed && isOpen) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Help is coming");
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [isConfirmed, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className={`w-full max-w-md overflow-hidden rounded-2xl shadow-2xl ${
              isConfirmed ? 'bg-green-600' : 'bg-red-600'
            } text-white flex justify-center items-center`}
          >
            <div className="p-8 text-center flex flex-col items-center justify-center min-h-[40vh] w-full">
              {!isConfirmed ? (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    className="mb-8 p-6 bg-white/20 rounded-full"
                  >
                    <AlertTriangle size={80} strokeWidth={2.5} />
                  </motion.div>
                  <h2 className="text-3xl font-bold mb-4 tracking-tight">SOS Dispatched</h2>
                  <p className="text-lg text-white/90 font-medium">Waiting for confirmation...</p>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1, rotate: 360 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="mb-8 p-6 bg-white/20 rounded-full"
                  >
                    <CheckCircle size={80} strokeWidth={2.5} />
                  </motion.div>
                  <h2 className="text-3xl font-bold mb-4 tracking-tight">Help is Coming</h2>
                  <p className="text-lg text-white/90 font-medium">Please stay calm.</p>
                </>
              )}
              
              <button 
                onClick={onClose}
                className="mt-12 px-6 py-3 w-full max-w-xs mx-auto bg-white/10 hover:bg-white/20 rounded-full font-medium transition-colors text-white border border-white/20"
              >
                Close Overlay
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
