import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, PhoneCall, Activity, Zap, Navigation, Gauge, BarChart3, Heart, ClipboardList, FileText, ChevronRight, Info, AlertCircle, Mic, X, Bot, Menu, Settings, Map, GripVertical } from 'lucide-react';
import { EmergencyUI } from './components/EmergencyUI';
import { VoiceInterface } from './components/VoiceInterface';
import { DispatchSummary } from './components/DispatchSummary';
import { HazardMonitor } from './components/HazardMonitor';
import { GoogleMapComponent } from './components/GoogleMapComponent';
import { InstallAppBanner } from './components/InstallAppBanner';
import { ChatbotModal } from './components/ChatbotModal';
import { APIProvider } from '@vis.gl/react-google-maps';
import { ResponsiveContainer, LineChart, Line, YAxis, CartesianGrid } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TrafficUpdate, fetchLiveTrafficData, submitTrafficProbe, getTrafficSessionId } from './services/trafficService';
import { updateIncidentLocation } from './services/incidentService';
import { TrackIncident } from './components/TrackIncident';
import { TrafficUpdatesUI } from './components/TrafficUpdatesUI';


const INITIAL_GOOGLE_MAPS_KEY = '';

import { SOSTrigger } from './components/SOSTrigger';
import { geoapifyService } from './services/geoapifyService';
import { hardwareService } from './services/hardwareService';
import { BatteryIndicator } from './components/BatteryIndicator';
import TripHistory from './components/TripHistory';
import { PermissionsModal } from './components/PermissionsModal';
import { EmergencySOSModal } from './components/EmergencySOSModal';
import { GForceScatterPlot } from './components/GForceScatterPlot';
import { raiseIncident, observeIncident, observeDrivingMode, cancelIncident, closeIncident, contactsFromProfile, flushPendingIncidents, openScheme, getDeviceToken, type Incident, type IncidentKind, type DispatchOutcome, type AiMedicalAnalysis, type RecommendedHospital } from './services/incidentService';
import { CrashDetector, summarizeVerdict, type CrashVerdict } from './safety/crashDetector';
import { getStoredVehicleClass, setStoredVehicleClass, type VehicleClass } from './safety/vehicleProfiles';
import { sharedWakeWordEngine, SafetyWordMatcher, PorcupineWakeWordEngine, loadSafetyWord, saveSafetyWord, validateSafetyWord, type StoredSafetyWord } from './safety/wakeWord';
import { backgroundService } from './services/backgroundService';

export default function App() {
  const navigate = useNavigate();
  const locationPath = useLocation().pathname;
  
  if (locationPath.startsWith('/track/')) {
    return (
      <Routes>
        <Route path="/track/:id" element={<TrackIncident />} />
      </Routes>
    );
  }

  const [setupComplete, setSetupComplete] = useState(() => localStorage.getItem('roadSosSetupComplete') === 'true');
  const [mapsApiKey, setMapsApiKey] = useState(() => localStorage.getItem('roadsos_maps_key') || INITIAL_GOOGLE_MAPS_KEY);
  const [hasCheckedKey, setHasCheckedKey] = useState(mapsApiKey !== '');
  
  useEffect(() => {
    if (!hasCheckedKey) {
      fetch('/api/config/maps')
        .then(r => r.json())
        .then(d => {
            const key = d.apiKey || 'MISSING_DEV_KEY';
            setMapsApiKey(key);
            setHasCheckedKey(true);
            if (d.apiKey) localStorage.setItem('roadsos_maps_key', d.apiKey);
        })
        .catch(err => {
            console.error(err);
            setMapsApiKey(localStorage.getItem('roadsos_maps_key') || 'MISSING_DEV_KEY');
            setHasCheckedKey(true);
        });
    }
  }, [hasCheckedKey]);
  const [userPhone, setUserPhone] = useState(() => localStorage.getItem('roadSosUserPhone') || "");
  const userPhoneRef = useRef(userPhone);
  useEffect(() => {
    userPhoneRef.current = userPhone;
  }, [userPhone]);

  const [isHospitalConfigured, setIsHospitalConfigured] = useState<boolean>(() => localStorage.getItem('roadsos_hosp_configured') === 'true');

  useEffect(() => {
    fetch('/api/config/hospital')
      .then(r => r.json())
      .then(d => {
        setIsHospitalConfigured(d.isConfigured);
        localStorage.setItem('roadsos_hosp_configured', d.isConfigured ? 'true' : 'false');
      })
      .catch(() => {});
  }, []);

  const [currentMedicalAnalysis, setCurrentMedicalAnalysis] = useState<AiMedicalAnalysis | null>(null);
  const [currentRecommendedHospitals, setCurrentRecommendedHospitals] = useState<RecommendedHospital[]>([]);
  const [isEmergency, setIsEmergency] = useState(false);
  const isEmergencyRef = useRef(isEmergency);
  useEffect(() => {
    isEmergencyRef.current = isEmergency;
  }, [isEmergency]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isSosModalOpen, setIsSosModalOpen] = useState(false);
  const [isChatbotModalOpen, setIsChatbotModalOpen] = useState(false);
  const [chatbotGreeting, setChatbotGreeting] = useState<string>("How can I help?");
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [allowBackgroundMonitoring, setAllowBackgroundMonitoring] = useState(true);
  const [allowVoiceFeedback, setAllowVoiceFeedback] = useState(true);
  const allowVoiceFeedbackRef = useRef(true);
  useEffect(() => { allowVoiceFeedbackRef.current = allowVoiceFeedback; }, [allowVoiceFeedback]);
  const [allowVoiceCommand, setAllowVoiceCommand] = useState(true);
  const allowVoiceCommandRef = useRef(true);
  useEffect(() => { allowVoiceCommandRef.current = allowVoiceCommand; }, [allowVoiceCommand]);


  const [dispatchData, setDispatchData] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const userLocationRef = useRef(userLocation);
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);
  const [telemetry, setTelemetry] = useState({ x: 0, y: 0, z: 9.8 });
  const [peakG, setPeakG] = useState(1.0);
  const [systemHealth, setSystemHealth] = useState({ micActive: false, network: navigator.onLine });
  const [history, setHistory] = useState<any[]>([]);

  const [offlineQueue, setOfflineQueue] = useState<{url: string, method: string, body: string}[]>(() => {
    const saved = localStorage.getItem('roadsos_offline_queue');
    return saved ? JSON.parse(saved) : [];
  });
  useEffect(() => {
    localStorage.setItem('roadsos_offline_queue', JSON.stringify(offlineQueue));
  }, [offlineQueue]);
  const offlineQueueRef = useRef(offlineQueue);
  useEffect(() => { offlineQueueRef.current = offlineQueue; }, [offlineQueue]);

  const executeWithOfflineFallback = async (url: string, method: string, body: any) => {
    if (!navigator.onLine) {
      setOfflineQueue(prev => [...prev, { url, method, body: JSON.stringify({ ...body, idempotencyKey: 'POST' === 'POST' ? crypto.randomUUID() : undefined }) }]);
      return;
    }
    try {
       // Same device-token header used by incidentService — required by /api/status/driving
       // (and harmless/ignored by endpoints that don't check it) so a single fetch helper
       // can't leave one authenticated-only route silently broken.
       await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'X-Device-Token': getDeviceToken() },
          body: JSON.stringify({ ...body, idempotencyKey: 'POST' === 'POST' ? crypto.randomUUID() : undefined })
       });
    } catch (e) {
       setOfflineQueue(prev => [...prev, { url, method, body: JSON.stringify({ ...body, idempotencyKey: 'POST' === 'POST' ? crypto.randomUUID() : undefined }) }]);
    }
  };

  useEffect(() => {
    (window as any).roadsosExecuteWithOfflineFallback = executeWithOfflineFallback;
  }, [offlineQueue]);

  useEffect(() => {
    let micTimeout: NodeJS.Timeout;
    const handleMicState = (e: any) => {
      clearTimeout(micTimeout);
      if (e.detail) {
        setSystemHealth(s => ({ ...s, micActive: true }));
      } else {
        micTimeout = setTimeout(() => {
          setSystemHealth(s => ({ ...s, micActive: false }));
        }, 1000);
      }
    };
    const handleOnline = () => {
       setSystemHealth(s => ({ ...s, network: true }));
       const queue = offlineQueueRef.current;
       if (queue.length > 0) {
           if (allowVoiceFeedbackRef.current) {
             const synth = window.speechSynthesis;
             if (synth) {
               const msg = new SpeechSynthesisUtterance("Internet restored. Synchronizing offline data.");
               msg.volume = 1;
               synth.speak(msg);
             }
           }
           flushPendingIncidents((inc) => console.log('[Incident] replayed offline incident', inc.id)).catch(() => {});
           const processSync = async () => {
               for (const req of queue) {
                  try {
                     await fetch(req.url, {
                        method: req.method,
                        headers: { 'Content-Type': 'application/json', 'X-Device-Token': getDeviceToken() },
                        body: req.body
                     });
                     setOfflineQueue(prev => prev.filter(item => item !== req));
                  } catch (e) {
                     console.warn("Failed to sync queued req", e);
                  }
               }
           };
           processSync();
       }
    };
    const handleOffline = () => {
        setSystemHealth(s => ({ ...s, network: false }));
    };

    // Feature: Announce Incoming Calls in Driving Mode
    const handleIncomingCall = (e: any) => {
      const incomingNumber = e.detail?.number;
      if (!incomingNumber) return;

      if (isDrivingModeRef.current) {
         const contacts = medicalInfoRef.current?.emergencyContacts || [];
         // Strip non-digits for comparison
         const cleanIncoming = incomingNumber.replace(/\D/g, '');
         const knownContact = contacts.find((c: any) => {
           const cleanSaved = c.number.replace(/\D/g, '');
           return cleanSaved && (cleanIncoming.includes(cleanSaved) || cleanSaved.includes(cleanIncoming));
         });
         
         if (knownContact) {
            speakNotification(`Incoming call from ${knownContact.label}.`);
         } else {
            speakNotification("Incoming call from unknown number.");
         }
      }
    };
    
    // Expose a global helper to easily test this in realtime
    (window as any).simulateIncomingCall = (number: string) => {
       window.dispatchEvent(new CustomEvent('incoming-call', { detail: { number } }));
    };
    
    window.addEventListener('health-mic-active', handleMicState);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('incoming-call', handleIncomingCall);
    
    return () => {
      window.removeEventListener('health-mic-active', handleMicState);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('incoming-call', handleIncomingCall);
    };
  }, []);
  const [logs, setLogs] = useState<any[]>(() => {
    const saved = localStorage.getItem('roadsos_logs');
    if (saved) {
      try {
        const parsedLogs = JSON.parse(saved);
        return parsedLogs.map((log: any, index: number) => ({
          ...log,
          id: index.toString() + '_' + Date.now() + '_' + Math.random().toString()
        }));
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const logsRef = useRef(logs);
  useEffect(() => { logsRef.current = logs; }, [logs]);
  const [currentTripStart, setCurrentTripStart] = useState<any>(() => {
    const saved = localStorage.getItem('roadsos_current_trip');
    return saved ? JSON.parse(saved) : null;
  });
  const currentTripStartRef = useRef(currentTripStart);
  useEffect(() => {
    currentTripStartRef.current = currentTripStart;
    if (currentTripStart) {
      localStorage.setItem('roadsos_current_trip', JSON.stringify(currentTripStart));
    } else {
      localStorage.removeItem('roadsos_current_trip');
    }
  }, [currentTripStart]);

  const [trips, setTrips] = useState<any[]>(() => {
    const saved = localStorage.getItem('roadsos_trips_log');
    return saved ? JSON.parse(saved) : [];
  });
  useEffect(() => {
    localStorage.setItem('roadsos_trips_log', JSON.stringify(trips));
  }, [trips]);

  const [isMonitoring, setIsMonitoring] = useState(true);
  const [motionPermission, setMotionPermission] = useState<'granted' | 'denied' | 'prompt' | 'unsupported'>('prompt');
  
  // New States
  const [safetyWordCfg, setSafetyWordCfg] = useState<StoredSafetyWord>(() => loadSafetyWord());
  const safetyWord = safetyWordCfg.word.toUpperCase();
  const [safetyWordDraft, setSafetyWordDraft] = useState('');
  const [safetyWordError, setSafetyWordError] = useState<string | null>(null);
  const [recognizerLocale, setRecognizerLocale] = useState<string>(() => localStorage.getItem('roadsos_locale') || 'en-IN');
  
  useEffect(() => {
    localStorage.setItem('roadsos_locale', recognizerLocale);
  }, [recognizerLocale]);
  const [wakeEngineStatus, setWakeEngineStatus] = useState<string>('web-speech');
  const safetyMatcherRef = useRef<SafetyWordMatcher>(new SafetyWordMatcher({ word: safetyWordCfg.word, aliases: safetyWordCfg.aliases }));
  useEffect(() => { safetyMatcherRef.current = new SafetyWordMatcher({ word: safetyWordCfg.word, aliases: safetyWordCfg.aliases }); }, [safetyWordCfg]);

  // Feature 3 — offline keyword spotting (Picovoice Porcupine) when configured; Web Speech stays as fallback.
  useEffect(() => {
    const accessKey = import.meta.env.VITE_PICOVOICE_ACCESS_KEY as string | undefined;
    const keywordPath = import.meta.env.VITE_SAFETY_KEYWORD_PATH as string | undefined; // e.g. /wake/neon_wasm.ppn
    if (!accessKey || !keywordPath || !allowVoiceCommand) { setWakeEngineStatus('web-speech (online)'); return; }
    const engine = new PorcupineWakeWordEngine({ accessKey, keyword: { publicPath: keywordPath, label: safetyWordCfg.word } });
    const offlineMatcher = new SafetyWordMatcher({ word: safetyWordCfg.word, windowMs: 8000 });
    engine.onStatus((st) => setWakeEngineStatus(st === 'listening' ? 'porcupine (offline)' : `porcupine ${st}`));
    engine.onResult((label) => {
      if (offlineMatcher.feed(label, true).triggered && !isBroadcastingRef.current) {
        forceDrivingModeOff('distress_word');
        saveLogEntry(`Safety word ${label} detected offline x3`, userLocationRef.current);
        raiseSOS('SAFETY_WORD', `Safety word "${label}" spoken 3 times (offline engine)`, { silent: true });
      }
    });
    engine.start().catch(() => setWakeEngineStatus('web-speech (online)'));
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safetyWordCfg.word, allowVoiceCommand]);

  // ── Feature 2: the incident currently being handled (one at a time per device) ──
  const [activeIncident, setActiveIncident] = useState<Incident | null>(null);
  const activeIncidentRef = useRef<Incident | null>(null);
  useEffect(() => { activeIncidentRef.current = activeIncident; }, [activeIncident]);
  const [lastDispatch, setLastDispatch] = useState<DispatchOutcome | null>(null);
  const incidentUnsubRef = useRef<null | (() => void)>(null);

  // ── Feature 1: crash detector + last verdict (for UI/PDF) ──
  const [selectedVehicleClass, setSelectedVehicleClass] = useState<VehicleClass>(() => getStoredVehicleClass());
  const crashDetectorRef = useRef<CrashDetector>(new CrashDetector(selectedVehicleClass));
  const [lastVerdict, setLastVerdict] = useState<CrashVerdict | null>(null);
  const pendingVerdictRef = useRef<CrashVerdict | null>(null);
  const [backgroundMode, setBackgroundMode] = useState<string>('none');
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);

  useEffect(() => {
    setStoredVehicleClass(selectedVehicleClass);
    crashDetectorRef.current = new CrashDetector(selectedVehicleClass);
  }, [selectedVehicleClass]);
  const [showMedicalProfile, setShowMedicalProfile] = useState(false);
  const [quickContactLabel, setQuickContactLabel] = useState("");
  const [quickContactNumber, setQuickContactNumber] = useState("");
  const [medicalInfo, setMedicalInfo] = useState(() => {
    const saved = localStorage.getItem('roadsos_medical');
    const parsed = saved ? JSON.parse(saved) : null;
    let fallback = {
      name: '',
      bloodGroup: '',
      allergies: 'None',
      conditions: 'None',
      emergencyContacts: [] as { label: string; number: string }[]
    };
    if (parsed) {
      if (parsed.emergencyContact && !parsed.emergencyContacts) {
        parsed.emergencyContacts = [{ label: 'Primary', number: parsed.emergencyContact }];
        delete parsed.emergencyContact;
      }
      if (!parsed.emergencyContacts) {
         parsed.emergencyContacts = fallback.emergencyContacts;
      }
      return { ...fallback, ...parsed };
    }
    return fallback;
  });
  const medicalInfoRef = useRef(medicalInfo);
  useEffect(() => { medicalInfoRef.current = medicalInfo; }, [medicalInfo]);

  const [isDrivingMode, setIsDrivingMode] = useState(false);
  const isDrivingModeRef = useRef(isDrivingMode);
  useEffect(() => {
    isDrivingModeRef.current = isDrivingMode;
  }, [isDrivingMode]);

  const forceDrivingModeOff = async (reason: 'crash_detected' | 'manual_sos' | 'distress_word' | 'emergency_confirmed') => {
    if (!isDrivingModeRef.current) return;
    console.log(`[DrivingMode] Safety auto-disable triggered: ${reason}`);
    setIsDrivingMode(false);
    isDrivingModeRef.current = false;
    
    // Save trip with emergency type
    await finalizeCurrentTrip('emergency');
    backgroundService.disable();
    
    speakNotification("Driving mode disabled — emergency response active.");

    try {
      await executeWithOfflineFallback('/api/status/driving', 'POST', {
        active: false,
        reason,
        name: medicalInfoRef.current?.name,
        phone: userPhoneRef.current,
      });
    } catch (e) {
      console.warn("[DrivingMode] Failed to sync auto-disable status:", e);
    }
  };
  const forceDrivingModeOffRef = useRef(forceDrivingModeOff);
  useEffect(() => { forceDrivingModeOffRef.current = forceDrivingModeOff; }, [forceDrivingModeOff]);

  // Real-time socket sync: driving_mode:forced_off & driving_mode:changed
  useEffect(() => {
    const unsub = observeDrivingMode(
      (data) => {
        if (isDrivingModeRef.current) {
          console.log(`[DrivingMode] Socket push received: driving_mode:forced_off (${data.reason})`);
          setIsDrivingMode(false);
          isDrivingModeRef.current = false;
          speakNotification("Driving mode disabled — emergency response active.");
        }
      },
      (data) => {
        const myToken = getDeviceToken();
        if (data.userId === myToken && typeof data.active === 'boolean' && data.active !== isDrivingModeRef.current) {
          setIsDrivingMode(data.active);
          isDrivingModeRef.current = data.active;
        }
      }
    );
    return unsub;
  }, []);

  const activateDrivingModeForVehicle = async (vehicleClass: VehicleClass) => {
    setSelectedVehicleClass(vehicleClass);
    setShowVehiclePicker(false);
    setIsDrivingMode(true);

    const loc = userLocationRef.current;

    let startAddress = loc ? `Lat: ${loc.lat.toFixed(4)}, Lng: ${loc.lng.toFixed(4)}` : 'Unknown Location';
    if (loc) {
      try {
        startAddress = await geoapifyService.reverseGeocode(loc.lat, loc.lng);
      } catch (e) {}
    }
    setCurrentTripStart({
      time: Date.now(),
      location: loc,
      address: startAddress,
      vehicleType: vehicleClass,
      route: loc ? [loc] : []
    });

    try {
      await executeWithOfflineFallback('/api/status/driving', 'POST', {
        active: true,
        phone: userPhone,
        name: medicalInfo.name,
        vehicleClass,
      });
      speakNotification(`Driving Mode Engaged. ${vehicleClass.replace('_', ' ').toLowerCase()} profile active.`);
      backgroundService.enable();
    } catch (e) {
      console.error('Failed to sync driving status:', e);
    }
  };

  const finalizeCurrentTrip = async (tripType: 'safe' | 'emergency') => {
    const loc = userLocationRef.current;
    
    // Trip Logging
    let endAddress = loc ? `Lat: ${loc.lat.toFixed(4)}, Lng: ${loc.lng.toFixed(4)}` : 'Unknown Location';
    if (loc) {
      try {
        endAddress = await geoapifyService.reverseGeocode(loc.lat, loc.lng);
      } catch(e) {}
    }
    
    const curTrip = currentTripStartRef.current;
    if (curTrip) {
      const durationMs = Date.now() - curTrip.time;
      const mins = Math.floor(durationMs / 60000);
      
      let distanceStr = '0.0 km';
      if (curTrip.route && curTrip.route.length > 1) {
        let totalDist = 0;
        const R = 6371;
        for (let i=1; i < curTrip.route.length; i++) {
          const p1 = curTrip.route[i-1];
          const p2 = curTrip.route[i];
          const dLat = (p2.lat - p1.lat) * Math.PI / 180;
          const dLon = (p2.lng - p1.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * 
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          totalDist += R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
        }
        distanceStr = `${totalDist.toFixed(1)} km`;
      } else if (curTrip.location && loc) {
        const R = 6371;
        const dLat = (loc.lat - curTrip.location.lat) * Math.PI / 180;
        const dLon = (loc.lng - curTrip.location.lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(curTrip.location.lat * Math.PI / 180) * Math.cos(loc.lat * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        const d = R * c;
        distanceStr = `${d.toFixed(1)} km`;
      }

      const newTrip = {
        id: Date.now().toString(),
        date: new Date().toLocaleDateString(),
        type: tripType,
        start: curTrip.address,
        end: endAddress,
        duration: `${mins} min`,
        distance: distanceStr,
        vehicleType: curTrip.vehicleType || 'unknown',
        route: curTrip.route || []
      };
      setTrips(prev => [newTrip, ...prev]);
      setCurrentTripStart(null);
    }
  };

  const toggleDrivingMode = async () => {
    if (!isDrivingModeRef.current) {
      setShowVehiclePicker(true);
      return;
    }

    const newState = false;
    setIsDrivingMode(newState);
    
    await finalizeCurrentTrip('safe');

    try {
      await executeWithOfflineFallback('/api/status/driving', 'POST', { active: false, phone: userPhone, name: medicalInfo.name, vehicleClass: selectedVehicleClass });
      speakNotification('Driving Mode Disabled.');
      backgroundService.disable();
    } catch (e) {
      console.error('Failed to sync driving status:', e);
    }
  };

  const toggleDrivingModeRef = useRef(toggleDrivingMode);
  useEffect(() => {
    toggleDrivingModeRef.current = toggleDrivingMode;
  }, [toggleDrivingMode]);

  useEffect(() => {
    // Initial sync
    executeWithOfflineFallback('/api/status/driving', 'POST', { active: isDrivingMode, phone: userPhone, name: medicalInfo.name }).catch(e => {
        // Suppress initial failed to fetch if server is just starting up, 
        // to avoid noisy console errors on hot reloads.
        console.warn("Initial driving sync pending server availability.");
    });
  }, [userPhone]);

  // Re-sync driver name to server immediately if updated while driving mode is active
  useEffect(() => {
    if (isDrivingModeRef.current && medicalInfo.name) {
      executeWithOfflineFallback('/api/status/driving', 'POST', {
        active: true,
        phone: userPhone,
        name: medicalInfo.name,
      }).catch(() => {});
    }
  }, [medicalInfo.name, userPhone]);

  const [showDrivingSimulator, setShowDrivingSimulator] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('roadsos_onboarded');
  });
  const [isDistressPending, setIsDistressPending] = useState(false);
  const isDistressPendingRef = useRef(false);
  const [countdownSeconds, setCountdownSeconds] = useState(5);

  const [showTraumaGuide, setShowTraumaGuide] = useState(false);


  const [aiFirstAidResponse, setAiFirstAidResponse] = useState<string>("Listening for incident description...");
  const [aiFirstAidLiveTranscript, setAiFirstAidLiveTranscript] = useState<string>("");
  const firstAidMentionCountRef = useRef(0);
  const [isAIFirstAidActive, setIsAIFirstAidActive] = useState(false);
  const isAIFirstAidActiveRef = useRef(false);
  const aiFirstAidTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isBroadcastingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const ignoreNextFinalRef = useRef(false);

  // Safety Verification Flow States
  const [isSafetyChecking, setIsSafetyChecking] = useState(false);
  const [safetyCheckRound, setSafetyCheckRound] = useState(0);
  const [isWaitingForIncident, setIsWaitingForIncident] = useState(false);
  const safetyCheckTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSafetyCheckingRef = useRef(false);
  const isWaitingForIncidentRef = useRef(false);
  const isWaitingForEmergencyChoiceRef = useRef(false);

  const [voiceMapQuery, setVoiceMapQuery] = useState<string>('');
  const isWaitingForMapSearchRef = useRef(false);

  const backgroundRecognitionRef = useRef<any>(null);
  const micBlockedRef = useRef(false);
  const pendingDistressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDistressReasonRef = useRef<string>("");
  const firstAidResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cancelDistress = () => {
    if (pendingDistressTimerRef.current) {
      clearInterval(pendingDistressTimerRef.current);
      pendingDistressTimerRef.current = null;
    }
    setIsDistressPending(false);
    isDistressPendingRef.current = false;
    setCountdownSeconds(5);
    speakNotification("Alert cancelled. System reset to safe mode.");
    console.log("[Safety] Distress alert cancelled by user.");
  };

  useEffect(() => {
    localStorage.setItem('roadsos_medical', JSON.stringify(medicalInfo));
  }, [medicalInfo]);

  useEffect(() => {
    localStorage.setItem('roadsos_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    const handleWakeChatbot = () => setIsChatbotModalOpen(true);
    window.addEventListener('wake-chatbot', handleWakeChatbot);
    return () => window.removeEventListener('wake-chatbot', handleWakeChatbot);
  }, []);



  const [isConfirmedHelpArriving, setIsConfirmedHelpArriving] = useState(false);
  const [isConfirmedNeon, setIsConfirmedNeon] = useState(false);
  const isConfirmedHelpArrivingRef = useRef(false);

  // Traffic Updates
  const [trafficUpdate, setTrafficUpdate] = useState<TrafficUpdate | null>(null);
  const [fetchingTraffic, setFetchingTraffic] = useState(false);
  const [showTrafficMap, setShowTrafficMap] = useState(false);

  useEffect(() => {
    let interval: any;
    if (userLocation) {
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
           fetchTrafficUpdatesSilently();
        }
      }, 3 * 60 * 1000);
    }
    
    const handleVisibilityChange = () => {
       if (document.visibilityState === 'visible' && userLocation) {
          fetchTrafficUpdatesSilently();
       }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
       clearInterval(interval);
       document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userLocation]);

  const lastTrafficFetchTimeRef = useRef<number>(0);

  const fetchTrafficUpdatesSilently = async () => {
    if (!userLocation) return;
    const now = Date.now();
    if (now - lastTrafficFetchTimeRef.current < 30000) {
      return; // Debounce 30 seconds
    }
    lastTrafficFetchTimeRef.current = now;
    try {
      let lat = userLocation.lat;
      let lng = userLocation.lng;
      try {
          const getLiveGPS = async () => await hardwareService.getCurrentLocation();
          const livePos = await getLiveGPS();
          lat = livePos.lat;
          lng = livePos.lng;
          setUserLocation(livePos);
      } catch(e) {
          console.warn("Live GPS fix failed for silent traffic updates:", e);
      }
      const trafficData = await fetchLiveTrafficData(lat, lng);
      setTrafficUpdate(trafficData);
    } catch(e) {}
  };

  const fetchTrafficUpdates = async (locationName?: string, forceFetch: boolean = false) => {
    let loc = userLocationRef.current;
    if (!loc && !locationName) {
         try {
             const getLiveGPS = async () => await hardwareService.getCurrentLocation();

             const livePos = await getLiveGPS();
             setUserLocation(livePos);
             loc = livePos;
         } catch(e) {
             console.warn("Could not get user location:", e);
             return;
         }
    }

    const now = Date.now();
    let isDebounced = false;
    
    // Always bypass debounce if a specific location is requested or explicitly forced
    if (locationName || forceFetch) {
       lastTrafficFetchTimeRef.current = now;
    } else if (now - lastTrafficFetchTimeRef.current < 30000) {
      isDebounced = true;
    } else {
      lastTrafficFetchTimeRef.current = now;
    }

    setFetchingTraffic(true);
    setShowTrafficMap(true);
    try {
      let lat = loc?.lat;
      let lng = loc?.lng;

      if (!lat || !lng) {
          // One more attempt if it wasn't set yet
          try {
             const getLiveGPS = async () => await hardwareService.getCurrentLocation();
             const livePos = await getLiveGPS();
             lat = livePos.lat;
             lng = livePos.lng;
             setUserLocation(livePos);
          } catch(e) {}
      }

      if (locationName) {
         try {
             const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`);
             const data = await res.json();
             if (data && data.length > 0) {
                 lat = parseFloat(data[0].lat);
                 lng = parseFloat(data[0].lon);
             } else {
                 speakNotification(`Could not find location ${locationName}. Please try again.`);
                 setFetchingTraffic(false);
                 return;
             }
         } catch(e) {
             console.error("Geocoding failed for traffic updates:", e);
         }
      } else {
         try {
             const getLiveGPS = async () => await hardwareService.getCurrentLocation();

             const livePos = await getLiveGPS();
             lat = livePos.lat;
             lng = livePos.lng;
             setUserLocation(livePos);
         } catch(e) {
             console.warn("Live GPS fix failed for traffic updates:", e);
             if (!lat || !lng) {
                 setTrafficUpdate({
                    error: 'GPS is required to fetch traffic details near you. Please allow location access.',
                    location: 'Unknown Location',
                    lat: 0,
                    lng: 0,
                    trafficPresent: false,
                    congestionLevel: 'Low',
                    incidents: [],
                    routes: [],
                    fetchedAt: new Date().toLocaleTimeString(),
                    radius: '',
                    updateSource: 'poll'
                 });
                 setFetchingTraffic(false);
                 return;
             }
         }
      }

      if (!lat || !lng) return;


      if (!navigator.onLine) {
         speakNotification("You are currently offline. Cannot retrieve live traffic updates. Please try again when internet is restored.");
         setFetchingTraffic(false);
         return;
      }
      
      let activeTrafficData;
      if (!isDebounced) {
         activeTrafficData = await fetchLiveTrafficData(lat, lng);
         setTrafficUpdate(activeTrafficData);
      } else {
         activeTrafficData = trafficUpdate;
         if (!activeTrafficData) {
             activeTrafficData = await fetchLiveTrafficData(lat, lng);
             setTrafficUpdate(activeTrafficData);
         }
      }
      
      const latestData = activeTrafficData;

      // Speak the traffic update
      if ('speechSynthesis' in window) {
        let text = `Traffic near ${latestData.location} is currently ${latestData.congestionLevel}. `;
        if (latestData.incidents.length > 0) {
          text += `Detected ${latestData.incidents.length} incidents nearby.`;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.error(e);
      if ('speechSynthesis' in window) {
        const errorText = "Failed to fetch traffic updates.";
        const utterance = new SpeechSynthesisUtterance(errorText);
        window.speechSynthesis.speak(utterance);
      }
    } finally {
      setFetchingTraffic(false);
    }
  };

  const saveLogEntry = (reason: string, location: any) => {
    const newEntry = {
      id: crypto.randomUUID() || Date.now().toString() + Math.random().toString(),
      timestamp: new Date().toISOString(),
      reason,
      location,
      peakG: peakG
    };
    setLogs(prev => [newEntry, ...prev]);
  };

  /**
   * Feature 2 — single entry point for every SOS. Creates an Incident on the server,
   * fans out SMS + calls with real delivery status, subscribes to acknowledgements,
   * and falls back to the phone's own SMS/112 when the server path fails.
   */
  const raiseSOS = async (kind: IncidentKind, reason: string, opts: { silent?: boolean; verdict?: CrashVerdict | null; extraContacts?: string[] } = {}) => {
    const triggerReason = kind === 'CRASH' ? 'crash_detected'
      : kind === 'SAFETY_WORD' ? 'distress_word'
      : 'manual_sos';
    forceDrivingModeOff(triggerReason);

    if (isBroadcastingRef.current) return null;
    isBroadcastingRef.current = true;
    if (!opts.silent) setIsSosModalOpen(true);

    let loc: { lat: number; lng: number } | null = userLocationRef.current;
    try { loc = await hardwareService.getCurrentLocation(); } catch { /* keep last known */ }
    saveLogEntry(reason, loc);

    let address: string | undefined;
    if (loc) { try { const a = await geoapifyService.reverseGeocode(loc.lat, loc.lng); if (a && a !== 'Unknown Location') address = a; } catch { /* optional */ } }

    const mInfo = medicalInfoRef.current;
    const extra = [...(opts.extraContacts || [])];
    const contacts = [...new Set([...contactsFromProfile(mInfo), ...extra])];
    if (contacts.length === 0 && !opts.silent) {
      speakNotification("No emergency contact is saved. Opening your dialer for one one two.");
    }

    // For HELP voice distress, fetch Gemini condition analysis & hospital recommendations
    if (kind === 'VOICE_HELP') {
      fetch('/api/medical/analyze-and-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: { name: mInfo.name, phone: userPhoneRef.current || undefined, bloodGroup: mInfo.bloodGroup, allergies: mInfo.allergies, conditions: mInfo.conditions },
          reason,
          sensorSummary: opts.verdict ? summarizeVerdict(opts.verdict) : { peakG },
          location: loc,
        }),
      })
        .then(r => r.json())
        .then(med => {
          if (med.analysis) setCurrentMedicalAnalysis(med.analysis);
          if (med.recommendedHospitals && med.recommendedHospitals.length > 0) {
            setCurrentRecommendedHospitals(med.recommendedHospitals);
            const top = med.recommendedHospitals[0];
            if (!opts.silent) {
              speakNotification(`Distress alert and medical report dispatched to hospital. Best recommended hospital is ${top.name}, ${top.distanceKm} kilometers away. Route navigation is ready.`);
            }
          }
        })
        .catch(e => console.warn("[Medical API] analyze-and-recommend failed:", e));
    }

    const outcome = await raiseIncident({
      kind,
      reason,
      location: loc,
      address,
      confidence: opts.verdict && opts.verdict.confidence !== 'NONE' ? opts.verdict.confidence : undefined,
      sensorSummary: opts.verdict ? summarizeVerdict(opts.verdict) : undefined,
      patient: { name: mInfo.name, phone: userPhoneRef.current || undefined, bloodGroup: mInfo.bloodGroup, allergies: mInfo.allergies, conditions: mInfo.conditions },
      contacts,
    }, { allowNativeFallback: false });

    setLastDispatch(outcome);
    if (outcome.incident) {
      if (outcome.incident.aiMedicalAnalysis) setCurrentMedicalAnalysis(outcome.incident.aiMedicalAnalysis);
      if (outcome.incident.recommendedHospitals && outcome.incident.recommendedHospitals.length > 0) {
        setCurrentRecommendedHospitals(outcome.incident.recommendedHospitals);
      }
      setActiveIncident(outcome.incident);
      incidentUnsubRef.current?.();
      incidentUnsubRef.current = observeIncident(outcome.incident.id, (inc) => {
        setActiveIncident(inc);
        if (inc.state === 'ACKED' && !isConfirmedHelpArrivingRef.current) {
          isConfirmedHelpArrivingRef.current = true;
          setIsConfirmedHelpArriving(true);
          if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 1000]);
          if (kind !== 'SAFETY_WORD') speakNotification("Help is coming. Your contact has confirmed they are responding. Stay calm.");
        }
        if (inc.state === 'CLOSED' || inc.state === 'CANCELLED') { incidentUnsubRef.current?.(); incidentUnsubRef.current = null; }
      });
    }

    if (!opts.silent) {
      if (outcome.error === 'OFFLINE') speakNotification("You are offline. The alert is queued and will send automatically when connection returns. Please manually dial one one two if possible.");
      else if (outcome.summary?.allFailed) speakNotification(`Automatic alerts failed to deliver. Reason: ${outcome.error}. Please manually dial emergency services if you can.`);
      else if (outcome.error) speakNotification(`Alert issue: ${outcome.error}`);
      else if (outcome.summary && outcome.summary.sent > 0) speakNotification(`Alert successfully sent to ${outcome.summary.sent} channel${outcome.summary.sent === 1 ? '' : 's'}. Waiting for a contact to confirm.`);
      if (!outcome.error) { setIsEmergency(false); setInitialVoiceState('DISPATCH_PENDING'); setIsVoiceActive(true); }
    }

    setTimeout(() => { isBroadcastingRef.current = false; }, 30000);
    return outcome;
  };

  const resolveActiveIncident = async (action: 'cancel' | 'close') => {
    const inc = activeIncidentRef.current;
    if (!inc) return;
    try { action === 'cancel' ? await cancelIncident(inc.id, 'Cancelled by user in app') : await closeIncident(inc.id); } catch { /* best effort */ }
    incidentUnsubRef.current?.(); incidentUnsubRef.current = null;
    setActiveIncident(null);
    setIsConfirmedHelpArriving(false);
    isConfirmedHelpArrivingRef.current = false;
  };

  // ── Pathway A: Danger Alert ──────────────────────────────────────────────────
  // Covers: Hold-SOS button press, Silent Safety Word (NEON x3).
  // Server-side: POLICE_NUMBER is prepended to contacts (MANUAL_SOS / SAFETY_WORD kind).
  const dispatchDangerAlert = (reason: string, opts: { silent?: boolean; kind?: IncidentKind } = {}) => {
    forceDrivingModeOff('distress_word');
    const kind: IncidentKind = opts.kind ?? 'MANUAL_SOS';
    return raiseSOS(kind, reason, { silent: opts.silent ?? false });
  };

  // ── Pathway B: Medical Alert ─────────────────────────────────────────────────
  // Covers: HELP x3, G-force crash detection (after "Are you okay?" probe fails).
  // Server-side: HOSPITAL_NUMBER is prepended to contacts (VOICE_HELP kind).
  const dispatchMedicalAlert = (
    reason: string,
    opts: { conditionSummary?: string | null; verdict?: CrashVerdict | null; silent?: boolean } = {}
  ) => {
    const fullReason = opts.conditionSummary
      ? `${reason} — Reported condition: ${opts.conditionSummary}`
      : reason;
    return raiseSOS('VOICE_HELP', fullReason, { silent: opts.silent ?? false, verdict: opts.verdict ?? null });
  };

  // ── First Aid Sequencer ───────────────────────────────────────────────────────
  // Asks the user what is wrong (10-second bounded window), captures condition summary,
  // runs first-aid guidance, then dispatches.  Never waits indefinitely.
  const isWaitingForConditionRef = useRef(false);
  const conditionCaptureTmRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFirstAidReasonRef = useRef<string>('');
  const pendingFirstAidVerdictRef = useRef<CrashVerdict | null>(null);

  const launchFirstAidAndDispatch = (baseReason: string, opts: { verdict?: CrashVerdict | null } = {}) => {
    if (isBroadcastingRef.current) return;
    forceDrivingModeOff('manual_sos');

    setIsAIFirstAidActive(true);
    isAIFirstAidActiveRef.current = true;
    isWaitingForConditionRef.current = true;
    pendingFirstAidReasonRef.current = baseReason;
    pendingFirstAidVerdictRef.current = opts.verdict ?? null;

    speakNotification("What's wrong? Are you hurt? Where does it hurt?");
    setAiFirstAidResponse("What's wrong? Are you hurt? Where does it hurt?");

    // Bounded 10-second timeout — dispatches with unresponsive fallback if user says nothing
    if (conditionCaptureTmRef.current) clearTimeout(conditionCaptureTmRef.current);
    conditionCaptureTmRef.current = setTimeout(() => {
      if (!isWaitingForConditionRef.current) return; // already answered
      isWaitingForConditionRef.current = false;
      console.log('[First Aid Sequencer] No response within 10 s — dispatching with unresponsive fallback.');
      dispatchMedicalAlert(baseReason, {
        conditionSummary: 'Condition unknown — user unresponsive to first aid assistant',
        verdict: opts.verdict,
        silent: false,
      });
    }, 10000);
  };

  // Called by background recognition handler when the user speaks their condition description
  const captureConditionAndDispatch = (conditionText: string) => {
    if (!isWaitingForConditionRef.current) return;
    if (conditionCaptureTmRef.current) clearTimeout(conditionCaptureTmRef.current);
    isWaitingForConditionRef.current = false;

    const reason = pendingFirstAidReasonRef.current;
    const verdict = pendingFirstAidVerdictRef.current;
    const conditionSummary = `User reports: ${conditionText.trim()}`;
    console.log(`[First Aid Sequencer] Condition captured: "${conditionSummary}". Dispatching.`);

    // Run first-aid guidance concurrently (non-blocking — does not delay dispatch)
    handleAIFirstAid(conditionText);
    dispatchMedicalAlert(reason, { conditionSummary, verdict, silent: false });
  };

  // ── Compatibility aliases (thin wrappers over the new pathways) ──────────────
  // Kept so existing call sites in voice handlers and ChatbotModal continue to work.
  const executeNeonDistress = () => dispatchDangerAlert(
    `Safety word "${safetyWord}" spoken 3 times`, { silent: true, kind: 'SAFETY_WORD' }
  );
  const executeDistressBroadcast = (reason: string, silent: boolean = false) =>
    reason.toLowerCase().includes('help')
      ? dispatchMedicalAlert(reason, { silent })
      : dispatchDangerAlert(reason, { silent });
  const executeSecretDistressBroadcast = () => dispatchDangerAlert('SOS button held for 5 seconds', { silent: true });



  const handleNavigateToHospital = (hospital: RecommendedHospital) => {
    setIsSosModalOpen(false);
    if (hospital.name) {
      setVoiceMapQuery(`navigate to ${hospital.name}`);
      const mapElem = document.getElementById('google-map-section');
      if (mapElem) mapElem.scrollIntoView({ behavior: 'smooth' });
    }
    if (hospital.mapsUrl) {
      window.open(hospital.mapsUrl, '_blank');
    }
  };

  const generatePDFReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Road SOS - Insurance Report", 14, 22);

    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 32);

    doc.setFontSize(16);
    doc.text("Medical Profile", 14, 45);
    
    // AutoTable for Medical Profile
    autoTable(doc, {
      startY: 50,
      head: [['Field', 'Details']],
      body: [
        ['Name', medicalInfo.name || 'N/A'],
        ['Blood Group', medicalInfo.bloodGroup || 'N/A'],
        ['Allergies', medicalInfo.allergies || 'None'],
        ['Emergency Contacts', medicalInfo.emergencyContacts ? medicalInfo.emergencyContacts.map((c: any) => `${c.label}: ${c.number}`).join(', ') : 'N/A']
      ],
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 50;

    doc.text("Recent Accident Logs", 14, finalY + 15);

    const logData = logs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.reason,
      log.peakG ? log.peakG.toFixed(2) + 'G' : 'N/A',
      log.location ? `${log.location.lat.toFixed(4)}, ${log.location.lng.toFixed(4)}` : 'Unknown'
    ]);

    autoTable(doc, {
      startY: finalY + 20,
      head: [['Timestamp', 'Reason/Event', 'Peak G-Force', 'Location']],
      body: logData,
      theme: 'striped',
      headStyles: { fillColor: [139, 92, 246] }
    });

    doc.save(`roadsos_insurance_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const initiateDistressBroadcast = (reason: string, silent: boolean = false) => {
    if (isDistressPendingRef.current) return;
    
    if (silent) {
      // Execute immediately without UI updates
      executeDistressBroadcast(reason, true);
      return;
    }

    pendingDistressReasonRef.current = reason;
    setIsDistressPending(true);
    isDistressPendingRef.current = true;
    setCountdownSeconds(5);

    pendingDistressTimerRef.current = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          if (pendingDistressTimerRef.current) clearInterval(pendingDistressTimerRef.current);
          setIsDistressPending(false);
          isDistressPendingRef.current = false;
          executeDistressBroadcast(pendingDistressReasonRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const callNearestHospital = async () => {
    const reason = "Severe accident reported by voice. Nearest hospital requested.";
    speakNotification("Alerting your emergency contacts and locating the nearest hospital.");
    let hospitalNote = "";
    try {
      if (userLocationRef.current) {
        const res = await fetch('/api/places/nearby', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            includedTypes: ["hospital"], maxResultCount: 1,
            locationRestriction: { circle: { center: { latitude: userLocationRef.current.lat, longitude: userLocationRef.current.lng }, radius: 10000.0 } }
          })
        });
        if (res.ok) {
          const data = await res.json();
          const h = data.places?.[0];
          if (h) {
            hospitalNote = ` Nearest hospital: ${h.displayName?.text || 'unknown'}${h.nationalPhoneNumber ? ` (${h.nationalPhoneNumber})` : ''}.`;
            const phone = h.internationalPhoneNumber || h.nationalPhoneNumber;
            if (phone) { openScheme(`tel:${phone.replace(/[^\d+]/g, "")}`); }
          }
        }
      }
    } catch (e) { console.error("[Places] nearest hospital lookup failed:", e); }
    await raiseSOS('MEDICAL', reason + hospitalNote, { silent: false });
  };

  const handleAIFirstAid = async (incident: string) => {
    try {
      console.log(`[AI First Aid] Requesting instructions for: ${incident}`);
      const cleanInput = incident.toLowerCase().trim();
      let responseToSay = "";

      if (!cleanInput || cleanInput.replace(/\bfirst aid\b/g, "").trim() === "") {
        return; // Ignore if the transcript only consists of wake words
      }

      setIsAIFirstAidActive(true);
      isAIFirstAidActiveRef.current = true;
      setAiFirstAidResponse("Thinking...");

      if (cleanInput.includes("severe accident") || cleanInput.includes("severe injury")) {
        setIsAIFirstAidActive(false);
        isAIFirstAidActiveRef.current = false;
        setAiFirstAidLiveTranscript("");
        callNearestHospital();
        return;
      }
      
      if (!navigator.onLine) {
        responseToSay = "You are currently offline. Ensure safety, verify breathing, check for pulse, and apply firm pressure to any bleeding wounds. Try dialing emergency numbers manually.";
      } else {
          const res = await fetch('/api/ai/ask', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ question: incident })
          });
          if (!res.ok) throw new Error("API Failure");
          const data = await res.json();
          responseToSay = data.answer || "Be patient, keep yourself calm, and wait for medical support.";
      }
      
      setAiFirstAidResponse(responseToSay);
      speakNotification(responseToSay);
      saveLogEntry(`AI First Aid intent matched for: ${incident}`, userLocation);
      
      // Reset the timeout so the first-aid session remains open for follow-ups
      if (aiFirstAidTimeoutRef.current) clearTimeout(aiFirstAidTimeoutRef.current);
      aiFirstAidTimeoutRef.current = setTimeout(() => {
        if (isAIFirstAidActiveRef.current) {
          setIsAIFirstAidActive(false);
          isAIFirstAidActiveRef.current = false;
          setAiFirstAidLiveTranscript("");
          setAiFirstAidResponse("Listening for incident description...");
          speakNotification("First aid assistant session closed. Stay safe.");
        }
      }, 20000); 

    } catch (err) {
      console.error("AI First Aid Error:", err);
      setIsAIFirstAidActive(false);
      isAIFirstAidActiveRef.current = false;
      setAiFirstAidLiveTranscript("");
      setAiFirstAidResponse("Failed to connect");
      speakNotification("I'm sorry, I couldn't reach the medical servers. Please contact emergency services immediately.");
    }
  };

  const [isRecovering, setIsRecovering] = useState(false);
  const safetyWordTimestampsRef = useRef<number[]>([]);
  const rollingTranscriptsRef = useRef<{text: string, time: number}[]>([]);
  const [initialVoiceState, setInitialVoiceState] = useState<'NORMAL' | 'HEARD_HELP' | 'FIRST_AID_ACTIVE' | 'DISPATCH_PENDING' | 'HELP_ARRIVING'>('NORMAL');

  const speakNotification = (text: string) => {
    if (!allowVoiceFeedbackRef.current) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      (window as any).currentUtterance = utterance; // Prevent GC
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      isSpeakingRef.current = true;
      utterance.onstart = () => { isSpeakingRef.current = true; };
      utterance.onend = () => { isSpeakingRef.current = false; };
      utterance.onerror = () => { isSpeakingRef.current = false; };
      window.speechSynthesis.speak(utterance);
    }
  };

  // Safety Verification Logic
  const startSafetyVerification = (verdict?: CrashVerdict) => {
    forceDrivingModeOff('crash_detected');
    if (isBroadcastingRef.current || isEmergencyRef.current || isDistressPendingRef.current || isSafetyCheckingRef.current) return;
    const timeoutS = verdict?.probeTimeoutS ?? 20;
    pendingVerdictRef.current = verdict || null;
    console.log(`[Safety Probe] Impact ${verdict?.confidence ?? 'MANUAL'} (score ${verdict?.score.toFixed(2) ?? 'n/a'}). Probing for ${timeoutS}s.`);
    setIsSafetyChecking(true);
    isSafetyCheckingRef.current = true;
    setSafetyCheckRound(1);
    speakNotification("Are you okay? Say I am okay, or I need help.");

    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    safetyCheckTimerRef.current = setTimeout(() => {
      if (isSafetyCheckingRef.current) {
        console.log(`[Safety Probe] No response within ${timeoutS}s. Escalating.`);
        executeHelpFunctionality(`No response ${timeoutS}s after ${verdict ? `${verdict.confidence.toLowerCase()}-confidence impact (${verdict.features.peakG.toFixed(1)} g)` : 'suspected impact'}`);
      }
    }, timeoutS * 1000);
  };

  const executeHelpFunctionality = (reason: string) => {
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    setIsSafetyChecking(false);
    isSafetyCheckingRef.current = false;
    setSafetyCheckRound(0);

    console.log(`[HELP Functionality] Routing to First Aid sequencer: ${reason}`);
    const verdict = pendingVerdictRef.current;
    pendingVerdictRef.current = null;
    // Route through Pathway B: activates First Aid Assistant, waits 10 s, then dispatches
    launchFirstAidAndDispatch(reason, { verdict });
  };


  const cancelSafetyVerification = () => {
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    setIsSafetyChecking(false);
    isSafetyCheckingRef.current = false;
    setSafetyCheckRound(0);
    speakNotification("Understood. No safety functionality will be triggered. Resuming normal operations.");
    console.log("[Safety Probe] User confirmed safety. Probe cancelled.");
  };

  const failSafetyVerification = (reason: string) => {
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    setIsSafetyChecking(false);
    isSafetyCheckingRef.current = false;
    setSafetyCheckRound(0);
    
    speakNotification("What is the problem?");
    setIsWaitingForIncident(true);
    isWaitingForIncidentRef.current = true;
    console.log(`[Safety Probe] Probe failed: ${reason}. Awaiting incident description.`);
    
    // Auto timeout for incident description - if they don't say anything, send distress anyway
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    safetyCheckTimerRef.current = setTimeout(() => {
        if (isWaitingForIncidentRef.current) {
            handleIncidentResponse("User unresponsive after impact.");
        }
    }, 10000);
  };

  const handleIncidentResponse = (incident: string) => {
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    setIsWaitingForIncident(false);
    isWaitingForIncidentRef.current = false;
    
    console.log(`[Safety Probe] Incident reported: "${incident}". Raising incident.`);
    const verdict = pendingVerdictRef.current;
    pendingVerdictRef.current = null;
    raiseSOS('CRASH', `Impact detected. User said: "${incident}"`, { silent: true, verdict });
    handleAIFirstAid(incident);
  };

  const runMLRecovery = async () => {
    setIsRecovering(true);
    // Simulate ML Calibration/Re-binding
    await new Promise(resolve => setTimeout(resolve, 1500));
    const granted = await requestMotionPermission();
    setIsRecovering(false);
    if (granted) {
      speakNotification("Road SOS protection is now active.");
    }
  };

  const triggerSOS = () => {
    forceDrivingModeOff('manual_sos');
    if (!isMonitoring) {
      runMLRecovery();
      return;
    }
    // Pathway A: Danger Alert — server-side POLICE_NUMBER is automatically prepended
    dispatchDangerAlert('SOS button held for 5 seconds', { silent: true });
  };


  // Background Speech Recognition for Safety Word
  useEffect(() => {
    if (isEmergency || isVoiceActive || isChatbotModalOpen || !allowVoiceCommand) {
      return;
    }
    
    let unsub: (() => void) | null = null;
    let isActive = true;

    sharedWakeWordEngine.subscribe(
      { word: safetyWordCfg.word, shouldIgnore: () => isSpeakingRef.current, lang: recognizerLocale },
      (t, f, c, a) => {
        if (!isActive) return;
        if (isSpeakingRef.current) return;
        
        let finalTranscript = '';
        let interimTranscript = '';
        if (f) {
           finalTranscript += t + ' ';
        } else {
           interimTranscript += t + ' ';
        }
        
        // Normalize transcripts: lowercase and strip all punctuation/special characters
        const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const rawCombined = finalTranscript + interimTranscript;
        const cleanCombined = normalize(rawCombined);
        
        if (cleanCombined.trim().length > 0) {
           // We just keep the existing safety word matcher offline checks inside here for fallback,
           // but we also rely on the shared engine.
           // Actually, the engine will handle wake words natively via onResult matching, 
           // but since we want custom logic, we can keep the manual string checks.

           if (cleanCombined.includes('first aid') || cleanCombined.includes('first aid guide') || cleanCombined.includes('medical assistance') || cleanCombined.includes('medical help') || cleanCombined.includes('what to do in accident')) {
               console.log("Voice Command: Open First Aid Guide");
               setIsAIFirstAidActive(true);
               isAIFirstAidActiveRef.current = true;
               speakNotification("Opening First Aid AI Assistant.");
               return;
           }

           if (isAIFirstAidActiveRef.current && cleanCombined.length > 2) {
               console.log("Voice appending to AI First Aid Transcript:", cleanCombined);
               setAiFirstAidLiveTranscript(prev => prev + " " + cleanCombined);
               return;
           }

           if (cleanCombined.includes('help') || cleanCombined.includes('sos') || cleanCombined.includes('emergency')) {
               if (f && c > 0 && c < 0.3) {
                 speakNotification("I heard something like help, please repeat if you need emergency assistance.");
                 return;
               }
               console.log("Voice SOS Triggered");
               const type = cleanCombined.includes('police') ? 'Police' : 'Ambulance';
               speakNotification("SOS command recognized. Initiating emergency procedures.");
               executeDistressBroadcast("Voice Command Emergency Triggered", true);
               return;
           }

           // Voice Controls for Features (Alexa style)
           const turnOnDriveRegex = /\b(turn on|start|enable|activat|begin)\b.*\b(driving mode|drive mode)\b|\b(driving mode|drive mode)\b.*\b(on)\b/i;
           const turnOffDriveRegex = /\b(turn off|stop|disable|deactivat|end)\b.*\b(driving mode|drive mode)\b|\b(driving mode|drive mode)\b.*\b(off)\b/i;

           if (turnOnDriveRegex.test(cleanCombined)) {
             if (!isDrivingModeRef.current) {
               toggleDrivingModeRef.current(); // will speak 'Driving mode engaged'
             } else {
               speakNotification("Driving mode is already on.");
             }
             return;
           } else if (turnOffDriveRegex.test(cleanCombined)) {
             if (isDrivingModeRef.current) {
               toggleDrivingModeRef.current();
             } else {
               speakNotification("Driving mode is already off.");
             }
             return;
           }

           if (cleanCombined.includes('wakeup the application') || cleanCombined.includes('wake up the application') || cleanCombined.includes('start the application') || cleanCombined.includes('start the app') || cleanCombined.includes('wake up the app') || cleanCombined.includes('wakeup the app')) {
             if (!isMonitoring) {
               speakNotification("Waking up the application. Road SOS protection is now active.");
               setIsMonitoring(true);
             } else {
               speakNotification("The application is already awake and active.");
             }
             return;
           }

           if (cleanCombined.includes('shutdown the application') || cleanCombined.includes('shut down the application') || cleanCombined.includes('close the application') || cleanCombined.includes('close the app') || cleanCombined.includes('shutdown the app') || cleanCombined.includes('shut down the app')) {
             speakNotification("Shutting down the application. Voice wake up is still active.");
             setIsMonitoring(false);
             return;
           }
           
           if (cleanCombined.includes("open voice assistant") || cleanCombined.includes("open chatbot") || cleanCombined.includes("start voice assistant")) {
             setIsVoiceActive(true);
             setIsChatbotModalOpen(true);
             setChatbotGreeting("Voice assistant opened. How can I help you?");
             speakNotification("Voice assistant opened. How can I help you?");
             return;
           } else if (cleanCombined.includes("close voice assistant") || cleanCombined.includes("close chatbot") || cleanCombined.includes("stop voice assistant") || cleanCombined.includes("close assistant") || cleanCombined.includes("stop chatbot") || cleanCombined.includes("exit assistant") || cleanCombined.includes("exit chatbot")) {
             setIsVoiceActive(false);
             setIsChatbotModalOpen(false);
             setIsAIFirstAidActive(false);
             isAIFirstAidActiveRef.current = false;
             setAiFirstAidLiveTranscript("");
             speakNotification("Assistant closed.");
             return;
           }
           
           if (cleanCombined.includes("open traffic") || cleanCombined.includes("open map") || cleanCombined.includes("show map")) {
             setShowTrafficMap(true);
             speakNotification("Map view opened.");
           } else if (cleanCombined.includes("close traffic") || cleanCombined.includes("close map") || cleanCombined.includes("hide map")) {
             setShowTrafficMap(false);
             setTrafficUpdate(null);
             speakNotification("Map view closed.");
           }

            const routeMatches = [
              { keywords: ['home', 'dashboard'], path: '/' },
              { keywords: ['trip history', 'history'], path: '/trip-history' },
              { keywords: ['accelerometer', 'telemetry', 'sensor'], path: '/accelerometer' },
              { keywords: ['rapid response', 'response'], path: '/rapid-response' },
              { keywords: ['medical profile', 'medical'], path: '/medical-profile' },
              { keywords: ['first aid guide', 'first aid', 'first-aid'], path: '/first-aid' },
              { keywords: ['accident logs', 'accident log', 'logs'], path: '/accident-logs' },
              { keywords: ['settings', 'preferences'], path: '/settings' }
            ];
            for (const route of routeMatches) {
                if (route.keywords.some(kw => cleanCombined === kw || cleanCombined.includes(`open ${kw}`) || cleanCombined.includes(`show ${kw}`) || cleanCombined.includes(`go to ${kw}`) || cleanCombined.includes(kw))) {
                    navigate(route.path);
                    speakNotification(`Opening ${route.keywords[0]}...`);
                    return;
                }
            }

           if (isWaitingForEmergencyChoiceRef.current) {
             if (cleanCombined.includes("emergency") || cleanCombined.includes("number") || cleanCombined.includes("contact")) {
               isWaitingForEmergencyChoiceRef.current = false;
               speakNotification("Calling emergency contact.");
               executeDistressBroadcast("User requested emergency contact via voice", false);
               return;
             } else if (cleanCombined.includes("nearest") || cleanCombined.includes("hospital")) {
               isWaitingForEmergencyChoiceRef.current = false;
               speakNotification("Calling nearest hospital.");
               callNearestHospital();
               return;
             }
           }

           if (cleanCombined.includes("i had an accident") || cleanCombined.includes("had an accident") || cleanCombined === "accident") {
             isWaitingForEmergencyChoiceRef.current = true;
             speakNotification("Should I contact emergency number or nearest hospital?");
             return;
           }

           // App UI Commands
           const navPatterns = ['navigate to', 'take me to', 'directions to', 'go to', 'route to', 'drive to'];
           if (navPatterns.some(kw => cleanCombined.includes(kw))) {
               console.log("Voice Command: Navigation");
               setChatbotGreeting(cleanCombined); // Chatbot will process this as initial greeting, but actually the chatbot only speaks the initial greeting.
               // We can trigger a custom event that ChatbotModal listens to!
               setIsChatbotModalOpen(true);
               setTimeout(() => {
                 window.dispatchEvent(new CustomEvent('chatbot-query', { detail: cleanCombined }));
               }, 500);
               return;
           }

           if (cleanCombined === "hello" || cleanCombined.includes("hello") || cleanCombined === "hi" || cleanCombined === "heilo" || cleanCombined.includes("hi ") || cleanCombined.includes("hey ")) {
               console.log("Voice Command: Hello");
               setChatbotGreeting(medicalInfoRef.current.name ? `Hello ${medicalInfoRef.current.name}, how can I help?` : 'Hello, how can I help?');
               setIsChatbotModalOpen(true);
               return;
           }

           if (cleanCombined === "refresh" || cleanCombined.includes("refresh the app") || cleanCombined.includes("refresh page")) {
               console.log("Voice Command: Refresh");
               speakNotification("Refreshing the application.");
               setTimeout(() => {
                 window.location.reload();
               }, 1000);
           }

           const getUpdateMatch = cleanCombined.match(/(?:get updates|get updates ones|get update|traffic updates?)(?:\s+(?:about|on|in|for|at)\s+(.+))?/i);
           if (getUpdateMatch) {
               console.log("Voice Command: Get Updates");
               const locationName = getUpdateMatch[1];
               fetchTrafficUpdates(locationName, true);
               const uiEl = document.getElementById("traffic-updates-section");
               if (uiEl) uiEl.scrollIntoView({ behavior: 'smooth' });
               rollingTranscriptsRef.current = [];
               return;
           }

           if (cleanCombined.includes("go to map search")) {
               console.log("Voice Command: Go to Map Search");
               isWaitingForMapSearchRef.current = true;
               const mapEl = document.getElementById("google-map-section");
               if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
               speakNotification("Say a place name to search.");
           } else if (isWaitingForMapSearchRef.current && cleanCombined.trim().length > 0) {
               console.log("Voice Map Search Query:", cleanCombined);
               setVoiceMapQuery(cleanCombined.trim());
               isWaitingForMapSearchRef.current = false;
               speakNotification(`Searching map for ${cleanCombined.trim()}`);
           }
        }
      },
      (status) => {
        if (status === 'listening') {
          window.dispatchEvent(new CustomEvent('health-mic-active', { detail: true }));
        } else {
          window.dispatchEvent(new CustomEvent('health-mic-active', { detail: false }));
        }
        if (status === 'blocked') {
          micBlockedRef.current = true;
        }
      }
    ).then(unsubscribe => {
      unsub = unsubscribe;
    });

    return () => {
      isActive = false;
      if (unsub) unsub();
    };
  }, [isEmergency, isVoiceActive, isMonitoring, isChatbotModalOpen, allowVoiceCommand, safetyWordCfg.word, recognizerLocale]);

  useEffect(() => {
    // Check if motion is supported
    if (!window.DeviceMotionEvent && !hardwareService.isNative) {
      setMotionPermission('unsupported');
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !allowBackgroundMonitoring) {
        setIsMonitoring(false);
      } else if (document.visibilityState === 'visible' && motionPermission === 'granted') {
        setIsMonitoring(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [allowBackgroundMonitoring, motionPermission]);

  useEffect(() => {
    let watchId: any = null;

    const setupLocation = async () => {
      try {
        const pos = await hardwareService.getCurrentLocation();
        setUserLocation(pos);
      } catch (err) {
        console.warn("[GPS] Initial fix failed:", err);
      }

      let lastProbeTime = 0;
      let lastIncidentLocTime = 0;
      watchId = await hardwareService.watchLocation((lat, lng, speedMps, accuracyM) => {
        setUserLocation({ lat, lng });
        
        if (isDrivingModeRef.current && currentTripStartRef.current) {
          const curRoute = currentTripStartRef.current.route || [];
          const now = Date.now();
          if (now - (currentTripStartRef.current.lastRouteUpdate || 0) > 5000) {
            curRoute.push({ lat, lng });
            currentTripStartRef.current.route = curRoute;
            currentTripStartRef.current.lastRouteUpdate = now;
            localStorage.setItem('roadsos_current_trip', JSON.stringify(currentTripStartRef.current));
          }
        }

        if (speedMps !== null && speedMps !== undefined && speedMps >= 0) {
          crashDetectorRef.current.pushSpeed({ t: Date.now(), speedMps, accuracyM });

          const now = Date.now();
          if (isDrivingModeRef.current && now - lastProbeTime > 15000) {
             submitTrafficProbe(lat, lng, speedMps * 3.6, 0, getTrafficSessionId());
             lastProbeTime = now;
           }

          if (activeIncidentRef.current) {
            const state = activeIncidentRef.current.state;
            if ((state === 'DETECTED' || state === 'PROBING' || state === 'DISPATCHED') && (now - lastIncidentLocTime > 15000)) {
               updateIncidentLocation(activeIncidentRef.current.id, lat, lng, accuracyM, speedMps).catch(e => console.warn("Failed to push loc", e));
               lastIncidentLocTime = now;
            }
          }
        }
      });
    };

    setupLocation();

    return () => {
      if (watchId !== null) {
        hardwareService.clearWatch(watchId);
      }
    };
  }, []);

  // Feature 1 — sensor fusion crash detection. Raw samples → CrashDetector; verdict → probe → incident.
  useEffect(() => {
    if (!isMonitoring) return;
    let lastStateUpdate = 0;
    let motionWatchId: any = null;
    const detector = crashDetectorRef.current;

    const unsubscribe = detector.onVerdict((verdict) => {
      setLastVerdict(verdict);
      if (verdict.confidence === 'NONE') return;
      if (isEmergencyRef.current || isDistressPendingRef.current || isBroadcastingRef.current) return;
      if (verdict.confidence === 'LOW') {
        saveLogEntry(`Low-confidence impact (${verdict.features.peakG.toFixed(1)} g, score ${verdict.score.toFixed(2)}) — logged only`, userLocationRef.current);
        return;
      }
      console.log("[Crash Detection] verdict", summarizeVerdict(verdict));
      forceDrivingModeOff('crash_detected');
      startSafetyVerification(verdict);
    });

    const startMotion = async () => {
      motionWatchId = await hardwareService.watchMotion((sample) => {
        detector.pushMotion(sample);
        const g = Math.sqrt(sample.ax ** 2 + sample.ay ** 2 + sample.az ** 2) / 9.81;
        const now = Date.now();
        if (now - lastStateUpdate > 250) {
          lastStateUpdate = now;
          setTelemetry({ x: sample.ax, y: sample.ay, z: sample.az });
          setPeakG(current => g > current ? g : current);
          setHistory(prev => {
            const nextId = prev.length > 0 ? (prev[prev.length - 1].id + 1) : 0;
            const next = [...prev, { g, time: now, id: nextId }];
            return next.filter(d => now - d.time <= 60000);
          });
        }
      });
    };

    startMotion();
    backgroundService.enable().then(setBackgroundMode).catch(() => {});

    return () => {
      unsubscribe();
      if (motionWatchId) hardwareService.clearMotionWatch(motionWatchId);
    };
  }, [isMonitoring]);

  /** Demo: replay a recorded crash signature through the real detector (no shortcut into the SOS path). */
  const replayRecordedCrash = () => {
    const t0 = 1_000_000;
    const G = 9.81;
    const speeds = Array.from({ length: 12 }, (_, i) => ({ t: t0 + i * 1000, speedMps: i < 8 ? 15 : 0 }));
    const motion: { t: number; ax: number; ay: number; az: number; gx: number; gy: number; gz: number }[] = [];
    let t = t0;
    const push = (g: number, gyro = 0) => { motion.push({ t, ax: Math.sqrt(Math.max(0, (g * G) ** 2 - G * G)), ay: 0, az: G, gx: gyro, gy: 0, gz: 0 }); t += 20; };
    for (let i = 0; i < 400; i++) push(1 + (Math.random() - 0.5) * 0.3);          // 8 s of driving vibration
    for (let i = 0; i < 8; i++) push(1 + 6 * Math.sin(Math.PI * i / 7), 6);        // 160 ms, 7 g impact with rotation
    for (let i = 0; i < 20; i++) push(1 + 1.5 * (1 - i / 19), 2);                 // ring-down
    for (let i = 0; i < 200; i++) push(1 + (Math.random() - 0.5) * 0.02);         // 4 s stopped and still
    const verdict = crashDetectorRef.current.runRecorded(motion, speeds);
    if (verdict) setPeakG(p => Math.max(p, verdict.features.peakG));
  };

  const requestMotionPermission = async () => {
    try {
      const response = await hardwareService.requestPermissions();
      if (response === 'granted' || response === 'prompt' || hardwareService.isNative) {
        setMotionPermission('granted');
        setIsMonitoring(true);
        return true;
      } else {
        setMotionPermission('denied');
        return false;
      }
    } catch (e) {
      console.error("Motion Permission Error:", e);
      setMotionPermission('unsupported');
      return false;
    }
  };

  const triggerMockCrash = () => replayRecordedCrash();

  const handleDispatchComplete = (data: any) => {
    setIsVoiceActive(false);
    setDispatchData({
      payload: JSON.stringify(data),
      facilityName: data.facility.name,
      facilityLocation: data.facility.location,
      userLocation: userLocation,
      userAddress: data.facility.address || "Current GPS Location"
    });
  };

  useEffect(() => {
    if (setupComplete) {
       const utterance = new SpeechSynthesisUtterance("Road S O S is active.");
       utterance.rate = 1.0;
       window.speechSynthesis.speak(utterance);
       
       // Acquire and hold mic track to prevent SpeechRecognition beeps on Android
       // and keep the mic pipeline warm as a mobile feature.
       navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(stream => {
           (window as any)._heldAudioStream = stream; // Keep a strong reference
       }).catch(err => console.log("Failed to hold mic stream:", err));
    }
  }, [setupComplete]);

  if (!setupComplete) {
    return <PermissionsModal onComplete={(phone) => { setUserPhone(phone); setSetupComplete(true); }} />;
  }

  return (
    <>
      {mapsApiKey || hasCheckedKey ? (
        <APIProvider apiKey={mapsApiKey || 'MISSING'} version="weekly">
          <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
            <AnimatePresence mode="wait">
              {isEmergency && (
            <EmergencyUI 
              key="emergency-overlay"
              autoTriggered={true}
              onCancel={() => setIsEmergency(false)}
              onConfirm={() => {
                setIsEmergency(false);
                setIsVoiceActive(true);
              }}
            />
          )}
          {isSafetyChecking && (
            <motion.div 
              key="safety-probe-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6 text-white"
            >
              <div className="max-w-md w-full text-center">
                <motion.div 
                  animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="w-48 h-48 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-12 border border-red-500/20"
                >
                  <Activity className="text-red-500" size={64} />
                </motion.div>
                <h2 className="text-sm font-black mb-2 uppercase tracking-[0.4em] text-red-500">High G-Load Detected</h2>
                <h3 className="text-3xl font-black mb-8 tracking-tighter">ARE YOU SAFE?</h3>
                <p className="text-[10px] font-mono text-slate-400 mb-8 uppercase tracking-widest leading-relaxed">
                  {lastVerdict && lastVerdict.confidence !== 'NONE'
                    ? `${lastVerdict.confidence} confidence impact · ${lastVerdict.features.peakG.toFixed(1)} g · ${lastVerdict.features.drivingContext.toLowerCase()}`
                    : `Probe ${safetyCheckRound}`}
                  <br/>
                  <span className="text-blue-400 animate-pulse">Say "I AM OKAY" or "I NEED HELP" — silence sends the alert in {lastVerdict?.probeTimeoutS ?? 20}s</span>
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={cancelSafetyVerification}
                    className="flex-1 py-5 bg-white text-black font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl text-[10px]"
                  >
                    I AM SAFE
                  </button>
                  <button 
                    onClick={() => failSafetyVerification("Manual Fail")}
                    className="flex-1 py-5 bg-red-600 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl text-[10px]"
                  >
                    I NEED HELP
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          {isWaitingForIncident && (
            <motion.div 
              key="incident-description-overlay"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <div className="max-w-md w-full bg-slate-900 border border-blue-500/30 p-10 rounded-[40px] shadow-2xl text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse" />
                <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-blue-500/30">
                  <AlertCircle className="text-blue-500 animate-pulse" size={40} />
                </div>
                <h2 className="text-2xl font-black mb-4 tracking-tighter text-white">WHAT IS THE PROBLEM?</h2>
                <p className="text-slate-400 text-sm mb-8 font-mono uppercase tracking-widest animate-pulse">
                  Describing incident for first responders...
                </p>
                <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 text-[10px] text-slate-500 uppercase tracking-[0.2em]">
                  Speak clearly now
                </div>
              </div>
            </motion.div>
          )}
          {isDistressPending && (
            <motion.div 
              key="distress-countdown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center p-6 text-white"
            >
              <div className="max-w-md w-full text-center">
                <motion.div 
                  animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-48 h-48 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-12 border border-blue-500/20"
                >
                  <div className="w-32 h-32 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/30">
                    <span className="text-4xl font-mono text-blue-400 font-black">{countdownSeconds}</span>
                  </div>
                </motion.div>
                <h2 className="text-sm font-black mb-2 uppercase tracking-[0.4em] text-slate-500">Security Pulse Active</h2>
                <p className="text-[10px] font-mono text-slate-400 mb-8 uppercase tracking-widest leading-relaxed">
                  Verifying inertial telemetry...
                  <br/>
                  <span className="text-blue-400 animate-pulse">Listening for: "CANCEL" or "I AM SAFE"</span>
                </p>
                <button 
                  onClick={cancelDistress}
                  className="w-full py-5 bg-slate-900 text-slate-500 font-black uppercase tracking-[0.2em] rounded-2xl border border-white/5 hover:bg-slate-800 transition-all text-[10px]"
                >
                  Authorize System Override
                </button>
              </div>
            </motion.div>
          )}
          {isAIFirstAidActive && (
            <motion.div 
              key="ai-first-aid-overlay"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <div className="max-w-md w-full bg-slate-900 border border-emerald-500/30 p-10 rounded-[40px] shadow-2xl text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 animate-pulse" />
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-500/30">
                  <Activity className="text-emerald-500 animate-pulse" size={40} />
                </div>
                <h2 className="text-2xl font-black mb-4 tracking-tighter text-white">AI FIRST AID ACTIVE</h2>
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-white/5 mb-4">
                  <p className="text-emerald-400 font-medium text-lg leading-relaxed">
                    {aiFirstAidResponse}
                  </p>
                </div>
                {aiFirstAidLiveTranscript && (
                  <div className="bg-slate-900/80 p-4 rounded-xl border border-emerald-500/20 mb-8 min-h-[60px] flex items-center justify-center">
                    <p className="text-emerald-200/80 italic text-sm text-center">
                      "{aiFirstAidLiveTranscript}"
                    </p>
                  </div>
                )}
                <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 text-[10px] text-slate-500 uppercase tracking-[0.2em]">
                  Speak clearly: "My arm is bleeding", "I have a headache", etc.
                </div>
                <button 
                  onClick={() => {
                    setIsAIFirstAidActive(false);
                    isAIFirstAidActiveRef.current = false;
                    setAiFirstAidLiveTranscript("");
                    speakNotification("First aid assistant session closed. Stay safe.");
                  }}
                  className="mt-6 w-full py-4 bg-slate-800 text-slate-400 font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-slate-700 transition-all text-xs"
                >
                  Close Assistant
                </button>
              </div>
            </motion.div>
          )}
          {isVoiceActive && (
            <VoiceInterface 
              key="voice-interface"
              userLocation={userLocation}
              onLogEvent={(reason) => saveLogEntry(reason, userLocation)}
              onBack={() => {
                setIsVoiceActive(false);
                setInitialVoiceState('NORMAL');
              }}
              onDispatchComplete={handleDispatchComplete}
              initialEmergencyState={initialVoiceState}
              activeIncident={activeIncident}
            />
          )}
          {isChatbotModalOpen && (
            <ChatbotModal 
              key="chatbot-modal"
              userName={medicalInfo.name}
              onClose={() => setIsChatbotModalOpen(false)}
              userLocation={userLocation || undefined}
              trafficData={trafficUpdate}
              initialGreeting={chatbotGreeting}
              onFetchTrafficUpdates={(locName) => {
                 fetchTrafficUpdates(locName);
                 const uiEl = document.getElementById("traffic-updates-section");
                 if (uiEl) uiEl.scrollIntoView({ behavior: 'smooth' });
                 setIsChatbotModalOpen(false); // Optionally close the modal
              }}
              onTriggerDispatch={(type) => {
                executeDistressBroadcast(type || "Voice AI distress", false);
                setIsChatbotModalOpen(false);
              }}
              onMapNearestHospital={() => {
                setVoiceMapQuery("hospital");
                setShowTrafficMap(false);
                setIsChatbotModalOpen(false);
                setTimeout(() => {
                  const mapEl = document.getElementById("google-map-section");
                  if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
                }, 300);
              }}
              onToggleTraffic={(state) => {
                setShowTrafficMap(state);
                setIsChatbotModalOpen(false);
                setTimeout(() => {
                  const mapEl = document.getElementById("google-map-section");
                  if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
                }, 300);
              }}
            />
          )}
          {dispatchData && (
            <DispatchSummary
              key="dispatch-summary"
              payload={dispatchData.payload}
              facilityName={dispatchData.facilityName}
              facilityLocation={dispatchData.facilityLocation}
              userLocation={userLocation || dispatchData.userLocation}
              userAddress={dispatchData.userAddress}
              onFinish={() => {
                setDispatchData(null);
                setPeakG(1.0);
              }}
            />
          )}
        </AnimatePresence>
        
        <HazardMonitor />

        {/* Global Health HUD */}
        <div className="fixed top-6 right-6 z-40 flex items-center gap-3">
           <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border backdrop-blur-md transition-colors ${systemHealth.network ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
              <Zap size={12} className={systemHealth.network ? "" : "animate-pulse"} />
              {systemHealth.network ? 'Online' : 'Offline'}
           </div>
           <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border backdrop-blur-md transition-colors ${systemHealth.micActive ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-slate-800/80 text-slate-500 border-slate-700/50'}`}>
              <Mic size={12} className={systemHealth.micActive ? "animate-pulse" : ""} />
              {systemHealth.micActive ? 'Listening' : 'Mic Idle'}
           </div>
        </div>

        <div className="fixed bottom-8 right-8 z-30">
          <SOSTrigger onTrigger={triggerSOS} isPulsing={isEmergency || isWaitingForIncident || isDistressPending} />
        </div>

        <main className="max-w-2xl mx-auto p-6 md:p-12">
          {/* Confirmed Help Banner */}
          <AnimatePresence>
             {isConfirmedHelpArriving && (
                <motion.div 
                   initial={{ opacity: 0, y: -20, scale: 0.95 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   exit={{ opacity: 0, y: -20, scale: 0.95 }}
                   className="mb-8 p-6 bg-green-500 text-white rounded-3xl shadow-[0_0_40px_rgba(34,197,94,0.4)] flex items-center justify-between border border-green-400/50"
                >
                   <div className="flex items-center gap-4">
                     <div className="p-3 bg-white/20 rounded-2xl">
                       <ShieldCheck size={32} className="text-white" />
                     </div>
                     <div>
                       <h2 className="text-3xl font-black uppercase tracking-tight">HELP IS COMING</h2>
                       <p className="text-green-100 font-medium">
                         {activeIncident?.ack ? `${activeIncident.ack.by} confirmed at ${new Date(activeIncident.ack.at).toLocaleTimeString()} via ${activeIncident.ack.via.replace('_', ' ')}.` : 'A contact has acknowledged the alert.'} Stay calm and stay where you are if it is safe.
                       </p>
                     </div>
                   </div>
                   <button onClick={() => setIsConfirmedHelpArriving(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                     <X size={24} />
                   </button>
                </motion.div>
             )}
          </AnimatePresence>

          {/* Neon Confirmed Banner */}
          <AnimatePresence>
             {isConfirmedNeon && (
                <motion.div 
                   initial={{ opacity: 0, y: -20, scale: 0.95 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   exit={{ opacity: 0, y: -20, scale: 0.95 }}
                   className="mb-8 p-6 bg-purple-600 text-white rounded-3xl shadow-[0_0_40px_rgba(147,51,234,0.4)] flex items-center justify-between border border-purple-400/50"
                >
                   <div className="flex items-center gap-4">
                     <div className="p-3 bg-white/20 rounded-2xl">
                       <Zap size={32} className="text-white animate-pulse" />
                     </div>
                     <div>
                       <h2 className="text-3xl font-black uppercase tracking-tight">NEON ACKNOWLEDGED</h2>
                       <p className="text-purple-100 font-medium">Your trusted contact has received your distress signal.</p>
                     </div>
                   </div>
                   <button onClick={() => setIsConfirmedNeon(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                     <X size={24} />
                   </button>
                </motion.div>
             )}
          </AnimatePresence>

          {/* Feature 2 — live incident status: real per-channel delivery, not a static "sent" badge */}
          <AnimatePresence>
            {activeIncident && activeIncident.state !== 'CLOSED' && activeIncident.state !== 'CANCELLED' && (
              <motion.section
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`mb-8 p-6 rounded-3xl border ${activeIncident.state === 'ACKED' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Incident {activeIncident.id.slice(0, 8)}</p>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">{activeIncident.kind.replace('_', ' ')} · {activeIncident.state}</h3>
                    <p className="text-xs text-slate-400 mt-1">{activeIncident.reason}</p>
                  </div>
                  <div className="flex gap-2">
                    {activeIncident.state !== 'ACKED' && (
                      <button onClick={() => resolveActiveIncident('cancel')} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-slate-900 border border-white/10 rounded-xl text-slate-300 hover:bg-slate-800">False alarm</button>
                    )}
                    <button onClick={() => resolveActiveIncident('close')} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-white text-black rounded-xl">Close</button>
                  </div>
                </div>
                {lastDispatch?.error && lastDispatch.error !== 'NO_CONTACTS' && (
                  <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-xs text-amber-200 font-bold mb-2">
                      {lastDispatch.usedNativeFallback
                        ? 'Automatic alerts failed — your messages app and the 112 dialer were opened. Send the message if it is still open.'
                        : 'Automatic alerts failed. Send this message to your contacts yourself, then call 112:'}
                    </p>
                    {lastDispatch.fallbackText && (
                      <div className="flex gap-2 items-start">
                        <p className="flex-1 text-[11px] font-mono text-slate-300 break-words">{lastDispatch.fallbackText}</p>
                        <button onClick={() => { navigator.clipboard?.writeText(lastDispatch.fallbackText || '').catch(() => {}); }} className="px-2 py-1 text-[9px] font-black uppercase tracking-widest bg-slate-900 border border-white/10 rounded-lg text-slate-200">Copy</button>
                      </div>
                    )}
                    <a href="tel:112" className="inline-block mt-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-white text-black rounded-lg">Call 112</a>
                  </div>
                )}
                {activeIncident.contacts.length === 0 && (
                  <p className="text-xs text-amber-300 font-bold mb-3">No emergency contacts saved. Add contacts in Medical Profile so alerts can be sent automatically.</p>
                )}
                <div className="divide-y divide-white/5 text-xs font-mono">
                  {activeIncident.deliveries.map(d => (
                    <div key={d.id} className="py-2 flex items-center justify-between gap-3">
                      <span className="text-slate-300">{d.channel.toUpperCase()} → {d.to}</span>
                      <span className={`font-black uppercase tracking-widest text-[10px] ${d.status === 'failed' ? 'text-red-400' : d.status === 'delivered' || d.status === 'answered' ? 'text-emerald-400' : d.status === 'no_answer' ? 'text-amber-400' : 'text-slate-400'}`}>
                        {d.status.replace('_', ' ')}{d.attempts > 1 ? ` (${d.attempts} tries)` : ''}
                      </span>
                    </div>
                  ))}
                  {activeIncident.deliveries.length === 0 && <p className="py-2 text-slate-500">Preparing alerts…</p>}
                </div>
                {activeIncident.deliveries.some(d => d.status === 'failed') && (
                  <p className="text-[10px] text-slate-400 mt-3">{activeIncident.deliveries.filter(d => d.status === 'failed').map(d => d.error).filter(Boolean)[0]}</p>
                )}
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showVehiclePicker && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6"
              >
                <motion.div
                  initial={{ scale: 0.96, y: 12 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: 12 }}
                  className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-slate-900 p-6 shadow-2xl"
                >
                  <div className="mb-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400">Vehicle Type</p>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-white">Select the vehicle you are driving</h3>
                  </div>

                  <div className="grid gap-3">
                    {(['TWO_WHEELER', 'CAR', 'TRUCK'] as VehicleClass[]).map((vehicle) => (
                      <button
                        key={vehicle}
                        onClick={() => activateDrivingModeForVehicle(vehicle)}
                        className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                          selectedVehicleClass === vehicle
                            ? 'border-cyan-400 bg-cyan-500/10 text-white'
                            : 'border-white/10 bg-slate-950/40 text-slate-200 hover:border-cyan-500/40 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-lg font-black uppercase tracking-tight">
                              {vehicle === 'TWO_WHEELER' ? 'Two-Wheeler' : vehicle === 'CAR' ? 'Car' : 'Truck'}
                            </p>
                            <p className="text-xs text-slate-400">
                              {vehicle === 'TWO_WHEELER'
                                ? 'Bike / scooter profile'
                                : vehicle === 'CAR'
                                  ? 'Passenger car profile'
                                  : 'Heavy vehicle profile'}
                            </p>
                          </div>
                          {selectedVehicleClass === vehicle && <div className="h-3 w-3 rounded-full bg-cyan-400" />}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 flex justify-between gap-3">
                    <button
                      onClick={() => setShowVehiclePicker(false)}
                      className="flex-1 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-[0.25em] text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => activateDrivingModeForVehicle(selectedVehicleClass)}
                      className="flex-1 rounded-2xl bg-cyan-500 px-4 py-3 text-xs font-black uppercase tracking-[0.25em] text-slate-950"
                    >
                      Start Drive
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <header className="mb-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
                <ShieldCheck className="text-blue-500" />
                RoadSoS <span className="text-slate-500 font-normal">v1.0-alpha</span>
              </h1>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <p className="text-sm text-slate-400 font-mono uppercase tracking-widest hidden sm:block">
                  Trauma & Rescue Network
                </p>
                <div className="h-1 w-1 rounded-full bg-slate-700 hidden sm:block" />
                <BatteryIndicator />
                <div className="flex items-center gap-2">
                   {isMonitoring ? (
                     <div className="flex items-center gap-2 px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-md">
                        <div className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
                        <span className="text-[8px] font-black text-cyan-500 uppercase tracking-widest">Live Monitoring Active</span>
                     </div>
                   ) : (
                     <button 
                        onClick={runMLRecovery}
                        className="flex items-center gap-2 px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded-md hover:bg-red-500/30 transition-all cursor-pointer group animate-pulse"
                     >
                        <div className="w-1 h-1 rounded-full bg-red-500" />
                        <span className="text-[8px] font-black text-red-500 uppercase tracking-widest group-hover:text-white transition-colors">
                          System Inactive: Tap to Calibrate
                        </span>
                     </button>
                   )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <div className="flex gap-2 relative">
                <button 
                  onClick={() => setIsChatbotModalOpen(true)}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2 border border-white/10"
                >
                  <Bot size={14} />
                  Chatbot
                </button>
                <button 
                  onClick={toggleDrivingMode}
                  className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-xl flex items-center gap-2 ${
                    isDrivingMode 
                      ? 'bg-amber-500 text-slate-950 shadow-amber-500/30' 
                      : 'bg-slate-900 border border-white/5 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Navigation size={14} className={isDrivingMode ? 'animate-bounce' : ''} />
                  {isDrivingMode ? 'Driving: Do Not Disturb' : 'Driving Mode: OFF'}
                </button>
                
                <button
                  onClick={() => setIsNavMenuOpen(!isNavMenuOpen)}
                  className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-full transition-colors flex items-center justify-center relative z-50"
                  aria-label="Navigation Menu"
                >
                  {isNavMenuOpen ? <X size={18} className="text-slate-400" /> : <Menu size={18} className="text-slate-400" />}
                </button>

                <AnimatePresence>
                  {isNavMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 top-full mt-3 w-64 bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl py-3 z-[100] text-left divide-y divide-slate-800/50"
                    >
                      {[
                        { id: '/', label: 'Home', icon: <ShieldCheck size={16} />, color: 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20' },
                        { id: '/trip-history', label: 'Trip History', icon: <Map size={16} />, color: 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20' },
                        { id: '/accelerometer', label: 'Telemetry', icon: <Activity size={16} />, color: 'text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20' },
                        { id: '/rapid-response', label: 'Rapid Response', icon: <Zap size={16} />, color: 'text-red-400 bg-red-500/10 hover:bg-red-500/20' },
                        { id: '/medical-profile', label: 'Medical Profile', icon: <Heart size={16} />, color: 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20' },
                        { id: '/first-aid', label: 'First-Aid Guide', icon: <ClipboardList size={16} />, color: 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' },
                        { id: '/accident-logs', label: 'Accident Logs', icon: <FileText size={16} />, color: 'text-purple-400 bg-purple-500/10 hover:bg-purple-500/20' },
                        { id: '/settings', label: 'Settings', icon: <Settings size={16} />, color: 'text-slate-400 bg-slate-500/10 hover:bg-slate-500/20' }
                      ].map((item, idx) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setIsNavMenuOpen(false);
                            navigate(item.id);
                          }}
                          className={`w-full flex items-center gap-4 px-5 py-3 transition-all text-xs font-black uppercase tracking-widest group ${
                            locationPath === item.id 
                              ? 'bg-slate-800/80 text-white border-l-2 border-l-blue-500 shadow-inner' 
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/40 border-l-2 border-transparent'
                          }`}
                        >
                          <div className={`p-2 rounded-xl transition-colors ${item.color} ${locationPath === item.id ? 'scale-110 shadow-lg' : ''}`}>
                            {item.icon}
                          </div>
                          <span className="flex-1 text-left">{item.label}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              {!isMonitoring && motionPermission !== 'unsupported' && (
                <button 
                  onClick={requestMotionPermission}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 border border-white/10"
                >
                  <Activity size={14} className="animate-spin-slow" />
                  Request Sensor Access
                </button>
              )}
            </div>
          </header>

          <AnimatePresence>
            {showOnboarding && !isEmergency && !isVoiceActive && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-slate-950 flex items-center justify-center p-6"
              >
                <div className="max-w-md w-full bg-slate-900 border border-white/5 p-8 rounded-[40px] shadow-2xl text-center relative overflow-hidden">
                   <div className="absolute top-0 left-0 w-full h-full bg-blue-500/5 pointer-events-none" />
                   <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px]" />
                   
                   <div className="relative z-10">
                     <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl rotate-3">
                        <ShieldCheck className="text-white" size={40} />
                     </div>
                     <h2 className="text-3xl font-black mb-4 tracking-tighter italic">WELCOME TO ROADSOS</h2>
                     <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                        Your autonomous safety net. Before we start monitoring your transit, please memorize your <b>Safety Word</b>.
                     </p>
                     
                     <div className="bg-slate-950 border border-blue-500/30 p-6 rounded-3xl mb-8 group">
                        <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-3">Distress Safety Word</p>
                        <h3 className="text-5xl font-black tracking-widest text-white">{safetyWord}</h3>
                        <p className="text-[9px] text-slate-500 mt-4 uppercase font-bold tracking-widest">Say it 3 times on its own to send a silent alert · change it in Settings</p>
                     </div>

                     <button 
                       onClick={() => {
                         localStorage.setItem('roadsos_onboarded', 'true');
                         setShowOnboarding(false);
                         runMLRecovery();
                       }}
                       className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all text-xs"
                     >
                       I've Memorized it & Enable Protection
                     </button>
                     
                     <p className="text-[9px] text-slate-600 mt-6 uppercase tracking-widest leading-relaxed">
                       This word will be hidden from the UI for your security.<br/>
                       It should only be used in genuine distress situations.
                     </p>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!isMonitoring && !showOnboarding && (
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="mb-8 p-10 bg-gradient-to-br from-red-600 to-red-700 rounded-[3rem] border-4 border-white/20 shadow-[0_30px_60px_-15px_rgba(220,38,38,0.5)] relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent)] pointer-events-none" />
                <div className="relative z-10 flex flex-col items-center text-center gap-8">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl animate-bounce">
                    <Zap className="text-red-600" size={40} />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2">System Suspended</h3>
                    <div className="inline-block px-4 py-1.5 bg-black/30 backdrop-blur-md rounded-full border border-white/10 mb-4">
                      <p className="text-[10px] font-black text-red-100 uppercase tracking-[0.3em]">Protection is currently OFFLINE</p>
                    </div>
                    <p className="text-base text-red-50 font-medium max-w-sm leading-tight opacity-90">
                      We cannot detect accidents or voice distress without your permission.
                    </p>
                  </div>
                  <button 
                    onClick={runMLRecovery}
                    disabled={isRecovering}
                    className="w-full py-6 bg-white text-red-600 font-black uppercase tracking-[0.25em] rounded-[1.5rem] shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:scale-[1.03] active:scale-95 transition-all text-sm border-b-4 border-red-100 flex items-center justify-center gap-3"
                  >
                    {isRecovering ? (
                      <>
                        <Activity className="animate-spin" size={20} />
                        RE-BINDING PROTECTION...
                      </>
                    ) : (
                      'ENABLE PROTECTION NOW'
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isDrivingMode && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-8 overflow-hidden"
              >
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-slate-950">
                         <Navigation size={24} />
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Status: Active Transit</p>
                         <h4 className="text-sm font-bold">Auto-Reply: "{medicalInfo.name || 'The driver'} is driving and will call you back."</h4>
                      </div>
                   </div>
                   <button 
                      onClick={() => setShowDrivingSimulator(true)}
                      className="px-3 py-1.5 bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-widest rounded-lg"
                   >
                     Test Call
                   </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {showDrivingSimulator && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
               <motion.div 
                 initial={{ scale: 0.9, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl"
               >
                  <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                     <PhoneCall size={40} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-black mb-2">Simulated Incoming Call</h3>
                  <p className="text-slate-400 text-sm mb-6">Dispatch or Contact is trying to reach you...</p>
                  <div className="bg-slate-950 border border-white/5 p-4 rounded-2xl mb-8">
                     <p className="text-xs font-mono text-amber-500 uppercase tracking-widest mb-2">Auto-Message Sent:</p>
                     <p className="text-sm italic font-medium">"{medicalInfo.name || 'The driver'} is driving and will call you back."</p>
                  </div>
                  <button 
                    onClick={() => setShowDrivingSimulator(false)}
                    className="w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-sm font-black uppercase tracking-widest"
                  >
                    Close Simulator
                  </button>
               </motion.div>
            </div>
          )}

          {locationPath === '/' && (
            <section id="traffic-updates-section" className="mb-8 flex flex-col gap-4 w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 border border-slate-800 p-4 rounded-3xl gap-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">Live Traffic & Hazards</h3>
                <p className="text-[10px] text-slate-500 max-w-[200px] mt-1">Get real-time accident and road reports near your location via OpenStreetMap.</p>
              </div>
              <button 
                id="get-updates-btn"
                onClick={() => fetchTrafficUpdates(undefined, true)}
                disabled={fetchingTraffic || (!userLocation && !fetchingTraffic)}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all w-full sm:w-auto"
              >
                {fetchingTraffic ? 'Fetching...' : 'Get Updates'}
              </button>
            </div>
            
            {trafficUpdate && (
              <TrafficUpdatesUI update={trafficUpdate} />
            )}

            <div id="google-map-section">
              {userLocation ? (
                <GoogleMapComponent 
                  center={userLocation} 
                  zoom={15} 
                  markers={[{ ...userLocation, title: 'You', color: '#3b82f6' }]}
                  showTrafficLayer={showTrafficMap}
                  voiceMapQuery={voiceMapQuery}
                  hasValidKey={mapsApiKey !== '' && mapsApiKey !== 'MISSING' && mapsApiKey !== 'MISSING_DEV_KEY'}
                />
              ) : (
                <div className="overflow-hidden rounded-3xl border border-slate-800 shadow-2xl bg-slate-900 h-[300px] relative w-full flex flex-col items-center justify-center gap-3">
                  <div className="animate-spin text-blue-500">
                    <Navigation size={32} />
                  </div>
                  <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Waiting for GPS Fix...</p>
                  
                  <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <div className="bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-mono font-bold text-blue-400">
                      LIVE SIGNAL
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
          )}

          {locationPath === '/trip-history' && <TripHistory trips={trips} currentTripStart={currentTripStart} userLocation={userLocation} />}

          {locationPath === '/accelerometer' && (
          <section id="accelerometer-section" className="mb-12">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl overflow-hidden relative flex flex-col">
              <div className="flex items-start justify-between mb-8 relative z-10">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Activity size={18} />
                    <span className="text-sm font-bold uppercase tracking-tight">System Telemetry</span>
                  </div>
                  <p className="text-[9px] font-mono text-slate-500 mt-1 uppercase tracking-widest">Active Inertial Data</p>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-md">
                   <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                   <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Real-time</span>
                </div>
              </div>
              
              {/* Motion Visualizer Blob */}
              <div className="absolute top-0 right-0 w-32 h-32 opacity-10 pointer-events-none">
                 <motion.div 
                    animate={{ 
                      x: telemetry.x * 2, 
                      y: telemetry.y * 2,
                      scale: 1 + (Math.abs(telemetry.z - 9.8) / 10)
                    }}
                    className="w-full h-full bg-blue-500 rounded-full blur-3xl"
                 />
              </div>

              <div className="flex items-end justify-between relative z-10 mb-6">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">G-Load</p>
                  <h2 className="text-5xl font-black text-blue-400 font-mono">
                    {(Math.sqrt(telemetry.x**2 + telemetry.y**2 + telemetry.z**2) / 9.81).toFixed(2)}G
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">PEAK IMPACT</p>
                  <p className="text-2xl font-bold text-red-500 font-mono">{peakG.toFixed(1)}G</p>
                </div>
              </div>

              <div className="flex-1 min-h-[150px] mb-4 relative z-10 bg-slate-950/50 rounded-xl border border-slate-800">
                <GForceScatterPlot data={history} />
              </div>

              {lastVerdict && (
                <div className="relative z-10 mb-4 p-4 bg-slate-950/60 border border-white/5 rounded-2xl">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Last impact analysis · {new Date(lastVerdict.at).toLocaleTimeString()}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono text-slate-300">
                    <span>score <b className={lastVerdict.confidence === 'HIGH' ? 'text-red-400' : lastVerdict.confidence === 'MEDIUM' ? 'text-amber-400' : 'text-slate-200'}>{lastVerdict.score.toFixed(2)} {lastVerdict.confidence}</b></span>
                    <span>peak <b>{lastVerdict.features.peakG.toFixed(1)} g</b></span>
                    <span>impact <b>{Math.round(lastVerdict.features.impactDurationMs)} ms</b></span>
                    <span>free-fall before <b>{Math.round(lastVerdict.features.preFreeFallMs)} ms</b></span>
                    <span>stillness after <b>{Math.round(lastVerdict.features.postStillness * 100)}%</b></span>
                    <span>speed <b>{lastVerdict.features.speedBefore >= 0 ? `${Math.round(lastVerdict.features.speedBefore * 3.6)}→${Math.round(Math.max(0, lastVerdict.features.speedAfter) * 3.6)} km/h` : 'no GPS'}</b></span>
                    <span>context <b>{lastVerdict.features.drivingContext}</b></span>
                    <span>gyro <b>{lastVerdict.features.gyroPeak.toFixed(1)} rad/s</b></span>
                  </div>
                </div>
              )}

              <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden relative z-10">
                <motion.div 
                   animate={{ width: `${Math.min(100, (Math.sqrt(telemetry.x**2 + telemetry.y**2 + telemetry.z**2) / 9.81) * 20)}%` }}
                   className={`h-full ${peakG > 3 ? 'bg-red-500' : 'bg-blue-500'} shadow-[0_0_10px_rgba(59,130,246,0.5)]`}
                />
              </div>
            </div>
          </section>
          )}

          {locationPath === '/rapid-response' && (
            <div id="rapid-response-section" className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col items-center justify-center relative overflow-hidden mb-12">
              <div className="absolute top-0 left-0 w-full h-full bg-red-500/5 pointer-events-none" />
              <div className="z-10 text-center mb-6">
                <div className="flex items-center justify-center gap-2 text-slate-400 mb-2">
                  <Zap size={18} />
                  <span className="text-sm font-bold uppercase tracking-tight">Rapid Response</span>
                </div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed">
                  Hold for 5s to initiate manual<br/>distress broadcast
                </p>
              </div>
              
              <div className="z-10 bg-slate-950 p-4 rounded-full border border-white/5 shadow-inner">
                <SOSTrigger onTrigger={triggerSOS} isPulsing={isEmergency || isWaitingForIncident || isDistressPending} />
              </div>

              {!isMonitoring && (
                <button 
                  onClick={runMLRecovery}
                  disabled={isRecovering}
                  className="mt-4 z-10 w-full py-3 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-cyan-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <Activity size={14} className={isRecovering ? 'animate-spin' : ''} />
                  {isRecovering ? 'Calibrating ML Models...' : 'Run ML Auto-Recovery'}
                </button>
              )}

              <button 
                onClick={triggerMockCrash}
                className="mt-6 z-10 text-[10px] font-black text-red-500/50 hover:text-red-500 uppercase tracking-widest transition-colors"
              >
                Replay recorded crash signature (demo · runs through the real detector)
              </button>
            </div>
          )}

          {locationPath === '/medical-profile' && (
          <section id="medical-profile-section" className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-xl">
                  <ShieldCheck className="text-red-500" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Medical Profile</h3>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Crucial First-Responder Data</p>
                </div>
              </div>
              <button 
                onClick={() => setShowMedicalProfile(!showMedicalProfile)}
                className="text-[10px] font-black text-blue-500 uppercase tracking-widest px-4 py-2 bg-blue-500/10 rounded-full border border-blue-500/20 hover:bg-blue-500/20 transition-all"
              >
                {showMedicalProfile ? 'Save & Close' : 'Update Info'}
              </button>
            </div>

            {showMedicalProfile ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Full Name</label>
                    <input type="text"
                      value={medicalInfo.name}
                      onChange={(e) => setMedicalInfo({...medicalInfo, name: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Blood Group</label>
                    <input 
                      type="text" 
                      value={medicalInfo.bloodGroup}
                      onChange={(e) => setMedicalInfo({...medicalInfo, bloodGroup: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-4">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block flex justify-between">
                      <span>Emergency Contacts</span>
                    </label>
                    <div className="space-y-2">
                      {(medicalInfo.emergencyContacts || []).map((contact: any, idx: number) => (
                        <div 
                          key={idx}
                          className="flex gap-2 items-center"
                        >
                          <input
                             type="text"
                             placeholder="Label"
                             value={contact.label}
                             onChange={(e) => {
                               const newContacts = [...medicalInfo.emergencyContacts];
                               newContacts[idx].label = e.target.value;
                               setMedicalInfo({ ...medicalInfo, emergencyContacts: newContacts });
                             }}
                             className="flex focus:border-blue-500 w-1/3 bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none cursor-text"
                          />
                          <div className="flex-1 flex flex-col gap-1 w-full sm:w-1/2">
                            <input
                               type="text"
                               placeholder="Phone Number"
                               value={contact.number}
                               onChange={(e) => {
                                 const newContacts = [...medicalInfo.emergencyContacts];
                                 newContacts[idx].number = e.target.value;
                                 setMedicalInfo({ ...medicalInfo, emergencyContacts: newContacts });
                               }}
                               className={`bg-slate-950 border ${contact.number && (contact.number.replace(/\\D/g, '').length > 15 || /[^+\\d\\s()-]/.test(contact.number)) ? 'border-red-500' : 'border-white/10'} rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none w-full cursor-text`}
                            />
                            {contact.number && (contact.number.replace(/\\D/g, '').length > 15 || /[^+\\d\\s()-]/.test(contact.number)) && (
                              <span className="text-[10px] text-red-500 font-bold px-2">Invalid phone number format</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newContacts = medicalInfo.emergencyContacts.filter((_: any, i: number) => i !== idx);
                              setMedicalInfo({ ...medicalInfo, emergencyContacts: newContacts });
                            }}
                            className="flex items-center justify-center p-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors cursor-pointer"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        setMedicalInfo({ 
                          ...medicalInfo, 
                          emergencyContacts: [...(medicalInfo.emergencyContacts || []), { label: 'Other', number: '' }] 
                        });
                      }}
                      className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center justify-center border border-dashed border-blue-500/50 rounded-xl w-full py-3 mt-2 bg-blue-500/5"
                    >
                      + Add another contact manually
                    </button>
                    {'contacts' in navigator && (window as any).ContactsManager && (
                      <button
                        onClick={async () => {
                          try {
                            const props = ['name', 'tel'];
                            const opts = { multiple: true };
                            const contacts = await (navigator as any).contacts.select(props, opts);
                            if (contacts && contacts.length > 0) {
                              const newContacts = contacts.flatMap((c: any) => 
                                (c.tel || []).map((t: string) => ({ label: (c.name && c.name.length > 0) ? c.name[0] : 'Imported', number: t }))
                              );
                              setMedicalInfo({
                                ...medicalInfo,
                                emergencyContacts: [...(medicalInfo.emergencyContacts || []), ...newContacts]
                              });
                            }
                          } catch (ex) {
                            console.error('Contact selection failed:', ex);
                            alert("Could not access contacts. Permission denied or unsupported.");
                          }
                        }}
                        className="text-xs font-bold text-green-400 hover:text-green-300 transition-colors flex items-center justify-center border border-dashed border-green-500/50 rounded-xl w-full py-3 mt-2 bg-green-500/5"
                      >
                        + Import from Phone Contacts
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Known Allergies</label>
                    <input 
                      type="text" 
                      value={medicalInfo.allergies}
                      onChange={(e) => setMedicalInfo({...medicalInfo, allergies: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Pre-Existing Conditions / Diseases</label>
                    <input type="text"
                      placeholder="e.g. Asthma, Diabetes, Hypertension, Cardiac condition"
                      value={medicalInfo.conditions || ''}
                      onChange={(e) => setMedicalInfo({...medicalInfo, conditions: e.target.value})}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div className="p-4 bg-slate-950/80 border border-blue-500/20 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block">Automated Emergency Hospital (.env)</span>
                        <span className="text-sm font-bold text-white">{isHospitalConfigured ? "Secured on server" : "Not configured in .env (HOSPITAL_NUMBER)"}</span>
                      </div>
                      <span className="px-2.5 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-md text-[9px] font-black uppercase tracking-wider">
                        Dispatched on HELP x3
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      When calling "HELP" 3 times, an automated distress call, SMS, and your signed medical handover report with GPS coordinates are automatically sent to this hospital.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-6 flex flex-wrap gap-x-12 gap-y-6">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Holder</p>
                  <p className="text-sm font-black text-white">{medicalInfo.name}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Blood</p>
                  <p className="text-sm font-black text-red-500">{medicalInfo.bloodGroup}</p>
                </div>
                <div className="w-full">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Emergency Contacts</p>
                  <div className="flex flex-col gap-2">
                    {(medicalInfo.emergencyContacts || []).map((contact: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-[8px] font-black px-2 py-1 bg-slate-800 text-slate-300 rounded uppercase tracking-widest">{contact.label || 'Contact'}</span>
                        <span className="text-sm font-black text-white">{contact.number}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Allergies</p>
                  <p className="text-sm font-black text-white">{medicalInfo.allergies}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Conditions</p>
                  <p className="text-sm font-black text-white">{medicalInfo.conditions || 'None'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Hospital Contact</p>
                  <p className="text-sm font-black text-white">{isHospitalConfigured ? "Secured on server" : "N/A"}</p>
                </div>
              </div>
            )}
          </section>
          )}



          {locationPath === '/first-aid' && (
          <section id="first-aid-section" className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-xl">
                  <ClipboardList className="text-emerald-500" size={24} />
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight">First-Aid Guide</h3>
              </div>
              <button 
                onClick={() => setShowTraumaGuide(!showTraumaGuide)}
                className="text-[10px] font-black text-emerald-500 uppercase tracking-widest"
              >
                {showTraumaGuide ? 'Collapse' : 'Open Guide'}
              </button>
            </div>
            
            {showTraumaGuide && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="p-4 bg-slate-950/50 border border-white/5 rounded-2xl flex gap-4">
                  <div className="bg-emerald-500/10 p-2 h-fit rounded-lg"><Info size={16} className="text-emerald-500" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Severe Bleeding</h4>
                    <p className="text-[11px] text-slate-400">Apply direct pressure with clean cloth. Elevate wound. Do not remove soaked cloth, add more on top.</p>
                  </div>
                </div>
                <div className="p-4 bg-slate-950/50 border border-white/5 rounded-2xl flex gap-4">
                  <div className="bg-amber-500/10 p-2 h-fit rounded-lg"><AlertCircle size={16} className="text-amber-500" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Unconscious Patient</h4>
                    <p className="text-[11px] text-slate-400">Check airway. Tilt head back slightly. Check breathing. Do not move if spinal injury suspected.</p>
                  </div>
                </div>
              </div>
            )}
          </section>
          )}

          {locationPath === '/accident-logs' && (
          <section id="accident-logs-section" className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
             <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 rounded-xl">
                    <FileText className="text-purple-500" size={24} />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Accident Logs</h3>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    className="text-[10px] font-black text-purple-500 uppercase tracking-widest px-4 py-2 bg-purple-500/10 rounded-full border border-purple-500/20 hover:bg-purple-500/20 transition-all"
                    onClick={() => {
                      const data = JSON.stringify({ medicalInfo, logs }, null, 2);
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `roadsos_report_${new Date().toLocaleDateString()}.json`;
                      a.click();
                    }}
                  >
                    Export JSON
                  </button>
                  <button 
                    className="text-[10px] font-black text-emerald-500 uppercase tracking-widest px-4 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                    onClick={generatePDFReport}
                  >
                    Generate PDF Report
                  </button>
                </div>
             </div>

             <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
               {logs.length > 0 ? (
                 logs.map((log, idx) => (
                   <div key={`${log.id}-${idx}`} className="bg-slate-950/50 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-purple-500/30 transition-all">
                      <div>
                        <p className="text-[9px] font-mono text-purple-400 uppercase tracking-widest mb-1 italic">
                          {new Date(log.timestamp).toLocaleString()}
                        </p>
                        <h4 className="text-xs font-bold text-white mb-1">{log.reason}</h4>
                        <div className="flex gap-4">
                          <p className="text-[9px] text-slate-500">Impact: <span className="text-red-400 font-bold">{log.peakG.toFixed(1)}G</span></p>
                        </div>
                      </div>
                      <ChevronRight className="text-slate-800 group-hover:text-purple-500 transition-colors" size={16} />
                   </div>
                 ))
               ) : (
                 <div className="text-center py-12">
                   <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">No Incident Reports Logged</p>
                 </div>
               )}
             </div>
          </section>
          )}

          {locationPath === '/' && (
          <>
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/20 rounded-xl">
                <Zap className="text-blue-500" size={24} />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight">Active Roadmap</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest mb-2">Beta v1.0</p>
                <h4 className="text-sm font-bold text-white mb-1">Accident History Log</h4>
                <p className="text-[10px] text-slate-400">Black-box style recording implemented and persistent.</p>
              </div>
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <p className="text-emerald-400 font-black text-[10px] uppercase tracking-widest mb-2">Beta v1.0</p>
                <h4 className="text-sm font-bold text-white mb-1">AI First-Aid Guide</h4>
                <p className="text-[10px] text-slate-400">Visual trauma protocols integrated into dispatcher UI.</p>
              </div>
              <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                <p className="text-purple-400 font-black text-[10px] uppercase tracking-widest mb-2">Beta v1.0</p>
                <h4 className="text-sm font-bold text-white mb-1">Insurance Report</h4>
                <p className="text-[10px] text-slate-400">Export incident data for claim processing.</p>
              </div>

            </div>
          </section>

          <section className="bg-slate-900/50 border border-slate-800/50 rounded-3xl p-8 text-center flex flex-col items-center">
            <div className="inline-flex bg-slate-800 p-3 rounded-2xl mb-4">
              <Gauge className="text-slate-400" size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2 tracking-tight text-slate-300">Emergency Network</h3>
            <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
              Instant access to nearby <b>Trauma Centers</b> and <b>Ambulance Services</b> during road critical incidents.
            </p>
          </section>
          </>
          )}

          {locationPath === '/settings' && (
          <section id="settings-section" className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8 mt-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-slate-700/50 rounded-xl">
                <Settings className="text-slate-300" size={24} />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight">App Settings</h3>
            </div>
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                <h4 className="text-sm font-bold text-white mb-1">Silent safety word</h4>
                <p className="text-[10px] text-slate-400 mb-3">Say it three times on its own to send a silent alert with your location to your contacts. Current word: <b className="text-white">{safetyWord}</b>. Pick something you would never say by accident.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={safetyWordDraft}
                    onChange={(e) => { setSafetyWordDraft(e.target.value); setSafetyWordError(null); }}
                    placeholder="e.g. blue tiger"
                    className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-blue-500 outline-none"
                  />
                  <button
                    onClick={() => {
                      const err = validateSafetyWord(safetyWordDraft);
                      if (err) { setSafetyWordError(err); return; }
                      const next = { word: safetyWordDraft.trim().toLowerCase(), aliases: [], enrolledAt: Date.now() };
                      saveSafetyWord(next); setSafetyWordCfg(next); setSafetyWordDraft('');
                      speakNotification(`Safety word updated. Say ${next.word} three times to send a silent alert.`);
                    }}
                    className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl"
                  >Save</button>
                </div>
                {safetyWordError && <p className="text-[10px] text-red-400 font-bold mt-2">{safetyWordError}</p>}
                <div className="flex flex-wrap gap-2 mt-3 text-[9px] font-black uppercase tracking-widest">
                  <span className="px-2 py-1 rounded-md bg-slate-800 text-slate-300">Engine: {wakeEngineStatus}</span>
                  <span className={`px-2 py-1 rounded-md ${backgroundMode === 'foreground-service' ? 'bg-emerald-900 text-emerald-300' : backgroundMode === 'wake-lock' ? 'bg-amber-900 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>
                    {backgroundMode === 'foreground-service' ? 'Background protection: active' : backgroundMode === 'wake-lock' ? 'Background protection: limited (screen must stay on)' : 'Background protection: off'}
                  </span>                  <span className="px-2 py-1 rounded-md bg-slate-800 text-slate-300">Contacts: {contactsFromProfile(medicalInfo).length}</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Spoken Language / Accent</h4>
                  <p className="text-[10px] text-slate-400">Select your voice recognition locale</p>
                </div>
                <select 
                  value={recognizerLocale} 
                  onChange={(e) => setRecognizerLocale(e.target.value)}
                  className="bg-slate-800 text-white text-xs p-2 rounded-xl border border-slate-700 outline-none"
                >
                  <option value="en-IN">English (India)</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="hi-IN">Hindi (India)</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Background Monitoring</h4>
                  <p className="text-[10px] text-slate-400">Keep accelerometer active when app is minimized</p>
                </div>
                <div 
                  onClick={() => setAllowBackgroundMonitoring(!allowBackgroundMonitoring)}
                  className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${allowBackgroundMonitoring ? 'bg-blue-500' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${allowBackgroundMonitoring ? 'right-1' : 'left-1'}`}></div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Voice Commands</h4>
                  <p className="text-[10px] text-slate-400">Allow background voice recognition</p>
                </div>
                <div 
                  onClick={() => setAllowVoiceCommand(!allowVoiceCommand)}
                  className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${allowVoiceCommand ? 'bg-blue-500' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${allowVoiceCommand ? 'right-1' : 'left-1'}`}></div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Voice Feedback</h4>
                  <p className="text-[10px] text-slate-400">Allow text-to-speech for critical alerts</p>
                </div>
                <div 
                  onClick={() => setAllowVoiceFeedback(!allowVoiceFeedback)}
                  className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${allowVoiceFeedback ? 'bg-blue-500' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${allowVoiceFeedback ? 'right-1' : 'left-1'}`}></div>
                </div>
              </div>
            </div>
          </section>
          )}
        </main>
        <InstallAppBanner />
        <EmergencySOSModal 
          isOpen={isSosModalOpen} 
          isConfirmed={isConfirmedHelpArriving || isConfirmedNeon} 
          onClose={() => setIsSosModalOpen(false)} 
          incident={activeIncident}
          aiAnalysis={currentMedicalAnalysis || activeIncident?.aiMedicalAnalysis}
          recommendedHospitals={currentRecommendedHospitals.length > 0 ? currentRecommendedHospitals : (activeIncident?.recommendedHospitals || [])}
          onSelectHospitalNavigation={handleNavigateToHospital}
        />
      </div>
        </APIProvider>
      ) : (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <p className="text-white">Connecting to Map Services...</p>
        </div>
      )}
    </>
  );
}
