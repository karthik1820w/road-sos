import React, { useState, useEffect } from 'react';
import { ShieldAlert, MapPin, Mic, Phone, CheckCircle2, ChevronRight, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PermissionsModalProps {
  onComplete: (userPhone: string) => void;
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [locGranted, setLocGranted] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    // Check if previously completed
    if (localStorage.getItem('roadSosSetupComplete') === 'true') {
      const savedPhone = localStorage.getItem('roadSosUserPhone') || '';
      onComplete(savedPhone);
    }
  }, [onComplete]);

  const requestLocation = () => {
    // Request DeviceMotion on iOS
    if (typeof (DeviceMotionEvent as any)?.requestPermission === 'function') {
      (DeviceMotionEvent as any).requestPermission().catch(console.warn);
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocGranted(true);
        setStep(2);
      },
      (err) => {
        console.warn('Location denied', err);
        // Force them to continue anyway for web
        setLocGranted(true);
        setStep(2);
      }
    );
  };

  const requestMic = () => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        setMicGranted(true);
        setStep(3);
        // Stop all tracks to not keep mic active during setup
        stream.getTracks().forEach(track => track.stop());
      })
      .catch((err) => {
        console.warn('Mic denied', err);
        setMicGranted(true);
        setStep(3);
      });
  };

  const finishSetup = () => {
    if (phone.length < 10) return;
    localStorage.setItem('roadSosSetupComplete', 'true');
    localStorage.setItem('roadSosUserPhone', phone);
    onComplete(phone);
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 w-full max-w-md rounded-3xl p-8 border border-white/10 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
          <div 
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center border border-blue-500/30">
            <ShieldAlert size={32} className="text-blue-400" />
          </div>
        </div>

        <h2 className="text-2xl font-black tracking-tight text-white text-center mb-2">Initialize RoadSoS</h2>
        <p className="text-slate-400 text-center text-sm mb-8">
          Due to PWA browser security, native Android permissions are requested manually.
        </p>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
            >
              <div className="bg-slate-800/50 p-4 rounded-xl mb-6 border border-white/5">
                <div className="flex items-start gap-4">
                  <MapPin className="text-blue-400 shrink-0 mt-1" />
                  <div>
                    <h3 className="text-white font-bold mb-1">GPS Tracking</h3>
                    <p className="text-slate-400 text-sm">Required to dispatch ambulances to your exact crash location.</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={requestLocation}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition duration-200"
              >
                Allow Location Access
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
            >
              <div className="bg-slate-800/50 p-4 rounded-xl mb-6 border border-white/5">
                <div className="flex items-start gap-4">
                  <Mic className="text-emerald-400 shrink-0 mt-1" />
                  <div>
                    <h3 className="text-white font-bold mb-1">Microphone Monitoring</h3>
                    <p className="text-slate-400 text-sm">Required for hands-free "HELP" word detection while driving.</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={requestMic}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition duration-200"
              >
                Allow Microphone
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
            >
              <div className="bg-slate-800/50 p-4 rounded-xl mb-6 border border-white/5">
                <div className="flex items-start gap-4 mb-4">
                  <Phone className="text-purple-400 shrink-0 mt-1" />
                  <div>
                    <h3 className="text-white font-bold mb-1">Device Phone Number</h3>
                    <p className="text-slate-400 text-sm">
                      Web Apps cannot read your SIM number or call logs securely. Enter your real number manually.
                    </p>
                  </div>
                </div>
                <input 
                  type="tel"
                  placeholder="+91..."
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <button 
                onClick={() => setStep(4)}
                disabled={phone.length < 10}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition duration-200 flex items-center justify-center gap-2"
              >
                Next <ChevronRight size={18} />
              </button>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div 
              key="step4"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
            >
              <div className="bg-slate-800/50 p-4 rounded-xl mb-6 border border-white/5">
                <div className="flex items-start gap-4">
                  <Phone className="text-amber-400 shrink-0 mt-1" />
                  <div>
                    <h3 className="text-white font-bold mb-1">Emergency Contacts</h3>
                    <p className="text-slate-400 text-sm">Please allow access to your contacts so we can alert them when you are in danger.</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={async () => {
                  if ('contacts' in navigator && (window as any).ContactsManager) {
                     try {
                        const props = ['name', 'tel'];
                        const opts = { multiple: true };
                        const contacts = await (navigator as any).contacts.select(props, opts);
                        if (contacts && contacts.length > 0) {
                          const newContacts = contacts.flatMap((c: any) => 
                            (c.tel || []).map((t: string) => ({ label: (c.name && c.name.length > 0) ? c.name[0] : 'Imported', number: t }))
                          );
                          const existingInfoStr = localStorage.getItem('roadSosMedicalInfo');
                          const info = existingInfoStr ? JSON.parse(existingInfoStr) : { emergencyContacts: [] };
                          info.emergencyContacts = [...(info.emergencyContacts || []), ...newContacts];
                          localStorage.setItem('roadSosMedicalInfo', JSON.stringify(info));
                        }
                     } catch(e) {
                        console.warn(e);
                     }
                  } else {
                     alert("Contacts API is not supported on this device. You can add them manually later.");
                  }
                  finishSetup();
                }}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-xl transition duration-200 mb-2 flex justify-center"
              >
                Allow Contacts Access
              </button>
              <button 
                onClick={finishSetup}
                className="w-full text-slate-400 hover:text-white font-bold py-3 rounded-xl transition duration-200"
              >
                Skip for now
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
