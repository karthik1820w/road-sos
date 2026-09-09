import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isIOSSafariUninstalled } from '../utils/pwaInstallHelper';

export const InstallAppBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOSPrompt, setIsIOSPrompt] = useState(false);

  useEffect(() => {
    // Check iOS Safari status
    const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
    const navStandalone = (window.navigator as any).standalone;
    
    if (isIOSSafariUninstalled(window.navigator.userAgent, navStandalone, standaloneMedia)) {
      setIsIOSPrompt(true);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const handleDismissIOS = () => {
    setIsIOSPrompt(false);
  };

  return (
    <AnimatePresence>
      {isInstallable && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm"
        >
          <div className="bg-slate-800 border border-slate-700 shadow-2xl p-4 rounded-3xl flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-white font-bold text-sm">Install RoadSoS</span>
              <span className="text-slate-400 text-xs">Get the native Android experience</span>
            </div>
            <button
              onClick={handleInstallClick}
              className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-full shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <Download size={20} />
            </button>
          </div>
        </motion.div>
      )}

      {isIOSPrompt && !isInstallable && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm"
        >
          <div className="bg-slate-800 border border-slate-700 shadow-2xl p-4 rounded-3xl flex flex-col gap-3 relative">
            <button 
              onClick={handleDismissIOS}
              className="absolute top-3 right-3 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>
            <div className="flex flex-col">
              <span className="text-white font-bold text-sm">Install RoadSoS</span>
              <span className="text-slate-400 text-xs mt-1">Install the app for fullscreen offline mode:</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900 p-3 rounded-xl border border-slate-700">
              <span>1. Tap</span> <Share size={14} className="text-blue-400 mx-1" />
              <span>2. Tap <strong>"Add to Home Screen"</strong></span> <PlusSquare size={14} className="text-slate-400 ml-1" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
