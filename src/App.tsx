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
import { TrafficUpdate, fetchLiveTrafficData } from './services/trafficService';
import { TrafficUpdatesUI } from './components/TrafficUpdatesUI';


const INITIAL_GOOGLE_MAPS_KEY = '';

import { SOSTrigger } from './components/SOSTrigger';
import { geoapifyService } from './services/geoapifyService';
import { BatteryIndicator } from './components/BatteryIndicator';
import TripHistory from './components/TripHistory';
import { PermissionsModal } from './components/PermissionsModal';
import { EmergencySOSModal } from './components/EmergencySOSModal';

import { io } from 'socket.io-client';

const socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: Infinity }); // connect to the same host

export default function App() {
  const navigate = useNavigate();
  const locationPath = useLocation().pathname;
  
  const [setupComplete, setSetupComplete] = useState(false);
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
  const [userPhone, setUserPhone] = useState("");
  const userPhoneRef = useRef(userPhone);
  useEffect(() => {
    userPhoneRef.current = userPhone;
  }, [userPhone]);
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

  // Ping heartbeat to keep connection alive
  useEffect(() => {
    const pingInterval = setInterval(() => {
       if (socket.connected) {
          socket.emit('ping', { time: Date.now() });
       }
    }, 25000);
    return () => clearInterval(pingInterval);
  }, []);

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
      setOfflineQueue(prev => [...prev, { url, method, body: JSON.stringify(body) }]);
      return;
    }
    try {
       await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
       });
    } catch (e) {
       setOfflineQueue(prev => [...prev, { url, method, body: JSON.stringify(body) }]);
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
           const processSync = async () => {
               for (const req of queue) {
                  try {
                     await fetch(req.url, {
                        method: req.method,
                        headers: { 'Content-Type': 'application/json' },
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
    
    window.addEventListener('health-mic-active', handleMicState);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('health-mic-active', handleMicState);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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
  const [safetyWord] = useState('NEON');
  const [isDrivingMode, setIsDrivingMode] = useState(false);
  const isDrivingModeRef = useRef(isDrivingMode);
  useEffect(() => {
    isDrivingModeRef.current = isDrivingMode;
  }, [isDrivingMode]);

  const toggleDrivingMode = async () => {
    const newState = !isDrivingModeRef.current;
    setIsDrivingMode(newState);
    
    const loc = userLocationRef.current;
    
    // Trip Logging
    if (newState) {
       // Starting driving mode
       let startAddress = loc ? `Lat: ${loc.lat.toFixed(4)}, Lng: ${loc.lng.toFixed(4)}` : 'Unknown Location';
       if (loc) {
         try {
           startAddress = await geoapifyService.reverseGeocode(loc.lat, loc.lng);
         } catch(e) {}
       }
       setCurrentTripStart({
          time: Date.now(),
          location: loc,
          address: startAddress
       });
    } else {
       // Stopping driving mode
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
          
          let distanceStr = 'Tracking...';
          if (curTrip.location && loc) {
             // Approximation of distance in km using Haversine
             const R = 6371; // Radius of the earth in km
             const dLat = (loc.lat - curTrip.location.lat) * Math.PI / 180;
             const dLon = (loc.lng - curTrip.location.lng) * Math.PI / 180;
             const a = 
               Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(curTrip.location.lat * Math.PI / 180) * Math.cos(loc.lat * Math.PI / 180) * 
               Math.sin(dLon/2) * Math.sin(dLon/2);
             const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
             const d = R * c; // Distance in km
             distanceStr = `${d.toFixed(1)} km`;
          }

          const newTrip = {
             id: Date.now().toString(),
             date: new Date().toLocaleDateString(),
             type: 'safe',
             start: curTrip.address,
             end: endAddress,
             duration: `${mins} min`,
             distance: distanceStr
          };
          setTrips(prev => [newTrip, ...prev]);
          setCurrentTripStart(null);
       }
    }

    try {
      await executeWithOfflineFallback('/api/status/driving', 'POST', { active: newState, phone: userPhone });
      
      try {
        const res = await fetch('/api/config/twilio');
        const data = await res.json();
        const twilioNum = data.phoneNumber || "YOUR_TWILIO_NUMBER";
        
        if (newState) {
           speakNotification("Driving Mode Engaged. Safe travels.");
        } else {
           speakNotification("Driving Mode Disabled.");
        }
      } catch (err) {
        console.error("Could not fetch twilio config for call forwarding", err);
      }
      
    } catch (e) {
      console.error("Failed to sync driving status:", e);
    }
  };

  const toggleDrivingModeRef = useRef(toggleDrivingMode);
  useEffect(() => {
    toggleDrivingModeRef.current = toggleDrivingMode;
  }, [toggleDrivingMode]);

  useEffect(() => {
    // Initial sync
    executeWithOfflineFallback('/api/status/driving', 'POST', { active: isDrivingMode, phone: userPhone }).catch(e => {
        // Suppress initial failed to fetch if server is just starting up, 
        // to avoid noisy console errors on hot reloads.
        console.warn("Initial driving sync pending server availability.");
    });
  }, [userPhone]);

  const [showDrivingSimulator, setShowDrivingSimulator] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('roadsos_onboarded');
  });
  const [isDistressPending, setIsDistressPending] = useState(false);
  const isDistressPendingRef = useRef(false);
  const [countdownSeconds, setCountdownSeconds] = useState(5);

  const [showMedicalProfile, setShowMedicalProfile] = useState(false);
  const [quickContactLabel, setQuickContactLabel] = useState("");
  const [quickContactNumber, setQuickContactNumber] = useState("");
  const [medicalInfo, setMedicalInfo] = useState(() => {
    const saved = localStorage.getItem('roadsos_medical');
    const parsed = saved ? JSON.parse(saved) : null;
    let fallback = {
      name: 'User',
      bloodGroup: 'B+',
      allergies: 'None',
      emergencyContacts: [{ label: 'Primary', number: '+91 7892375787' }]
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

  const [showTraumaGuide, setShowTraumaGuide] = useState(false);


  const [aiFirstAidResponse, setAiFirstAidResponse] = useState<string>("Listening for incident description...");
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



  useEffect(() => {
    socket.on("help_arriving", async (data) => {
      console.log("[Socket] Help arriving notification:", data);
      speakNotification("HELP IS COMING!! HELP IS COMING!! Please stay calm and do not panic");
      setIsConfirmedHelpArriving(true);

      // Check if this was likely triggered by the 3x voice command check.
      // We look at our logs to see if the trigger "HELP spoken 3 times" was logged recently.
      const requestedByVoice = logsRef.current.some(l => 
        l.message.includes("HELP spoken 3 times") && (Date.now() - l.timestamp < 3600000)
      );

      if (requestedByVoice && data.responder) {
        console.log("[App] Sending auto PDF report to responder:", data.responder);
        try {
          await fetch('/api/sos/send-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              responder: data.responder,
              logs: logsRef.current.slice(0, 50),
              medicalInfo: medicalInfoRef.current
            })
          });
        } catch (e) {
          console.error("Failed to send report:", e);
        }
      }
    });

    socket.on("neon_confirmed", (data) => {
      console.log("[Socket] Neon confirmed notification:", data);
      if (navigator.vibrate) {
        // Vibrate to denote person has received safe word signal
        navigator.vibrate([500, 200, 500, 200, 1000]);
      }
      setIsConfirmedNeon(true);
    });

    return () => {
      socket.off("help_arriving");
      socket.off("neon_confirmed");
    };
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
          const getLiveGPS = () => new Promise<{lat: number, lng: number}>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                  pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
                  err => reject(err),
                  { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
              );
          });
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
             const getLiveGPS = () => new Promise<{lat: number, lng: number}>((resolve, reject) => {
                 navigator.geolocation.getCurrentPosition(
                     pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
                     err => reject(err),
                     { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                 );
             });
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
             const getLiveGPS = () => new Promise<{lat: number, lng: number}>((resolve, reject) => {
                 navigator.geolocation.getCurrentPosition(
                     pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
                     err => reject(err),
                     { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                 );
             });
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
             const getLiveGPS = () => new Promise<{lat: number, lng: number}>((resolve, reject) => {
                 navigator.geolocation.getCurrentPosition(
                     pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
                     err => reject(err),
                     { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                 );
             });
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
                    radius: ''
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

  useEffect(() => {
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api/emergencies/confirmation-status');
        const data = await res.json();
        if (data.confirmed) {
          if (!isConfirmedHelpArrivingRef.current) {
            isConfirmedHelpArrivingRef.current = true;
          }
        } else {
          isConfirmedHelpArrivingRef.current = false;
        }
      } catch (err) {
        // ignore
      }
    }, 2000);
    return () => clearInterval(intervalId);
  }, []);

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

  const executeNeonDistress = async () => {
    if (isBroadcastingRef.current) return;
    isBroadcastingRef.current = true;
    const reason = "Secret Distress word NEON triggered";

    // Provide a way to get the latest location if userLocation is null or stale
    let loc = null;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 10000 });
      });
      loc = { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      loc = null; // fallback to whatever we can if we had a ref
    }

    saveLogEntry(reason, loc);
    const targetNumbers = ["+916361892311"];

    let addressStr = "Unknown Location";
    if (loc) {
      try {
         const addr = await geoapifyService.reverseGeocode(loc.lat, loc.lng);
         addressStr = addr;
      } catch (e) {
         addressStr = `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
      }
    }

    const mInfo = medicalInfoRef.current;
    const phone = userPhoneRef.current || 'Unknown User';

    const smsMessage = `SECRET DISTRESS ALERT: User ${phone} is in danger.
Location: ${loc ? `${addressStr} (https://www.google.com/maps?q=${loc.lat},${loc.lng})` : 'Unknown Location'}
Time: ${new Date().toLocaleTimeString()}
Recent Trip History: No Recent Trip History Available
IMMEDIATE ASSISTANCE REQUIRED.`;

    try {
      // 1. Send SMS to all targets
      await executeWithOfflineFallback('/api/sos/notify', 'POST', { 
          recipients: targetNumbers, 
          message: smsMessage
      });
      
      // Delay slightly between SMS and Calls to ensure Twilio network order
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Initiate Call concurrently for all targets
      await Promise.all(targetNumbers.map(target => 
        executeWithOfflineFallback('/api/sos/call-neon', 'POST', { to: target, patientName: mInfo.name || phone })
      ));

      // Dial from the user's phone directly
      if (targetNumbers.length > 0) {
        window.location.href = `tel:${targetNumbers[0].replace('+', '')}`;
      }
      
      console.log("[Neon Distress] SMS and Calls sent successfully.");
    } catch (err) {
      console.error("[Neon Distress] Failed to send distress payload.", err);
    } finally {
      setTimeout(() => {
        isBroadcastingRef.current = false;
      }, 30000); 
    }
  };

  const executeDistressBroadcast = async (reason: string, silent: boolean = false, targetOverride?: string) => {
    if (isBroadcastingRef.current) return;
    isBroadcastingRef.current = true;

    if (!silent) {
      setIsSosModalOpen(true);
    }

    const mInfo = medicalInfoRef.current;
    
    // Provide a way to get the latest location if userLocation is null or stale
    let loc = null;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 10000 });
      });
      loc = { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      loc = null; // fallback to whatever we can if we had a ref
    }
    
    saveLogEntry(reason, loc);

    const mappedContacts = (mInfo.emergencyContacts || []).map((c: any) => c.number).filter((n: string) => n && /^\\+?[\\d\\s()-]{7,20}$/.test(n));
    const targetNumbers = targetOverride ? [targetOverride] : (mappedContacts.length > 0 ? mappedContacts : ["+916361892311"]);

    let addressStr = "Unknown Location";
    let locationDescription = "Location data is currently unavailable.";
    
    if (loc) {
      locationDescription = `at latitude ${loc.lat.toFixed(6)} and longitude ${loc.lng.toFixed(6)}`;
      try {
        const resolvedAddress = await geoapifyService.reverseGeocode(loc.lat, loc.lng);
        if (resolvedAddress && resolvedAddress !== "Unknown Location") {
          addressStr = resolvedAddress;
          locationDescription = `${resolvedAddress}, at latitude ${loc.lat.toFixed(6)} and longitude ${loc.lng.toFixed(6)}`;
        }
      } catch (err) {
        console.error("Geocoding failed inside distress broadcast:", err);
      }
    }

    const isHelpCommand = reason.includes("HELP spoken 3 times");
    const pName = mInfo.name || userPhoneRef.current || 'the user';
    const distressCallMessage = isHelpCommand ? `${pName} needs help. ${pName} needs help.` : `${pName} IN Danger!! ${pName} Needs help. ${pName} IN Danger!! ${pName} Needs help.`;
    
    const smsMessage = `DISTRESS ALERT: ${distressCallMessage}
Location: ${loc ? `${addressStr} (https://www.google.com/maps?q=${loc.lat},${loc.lng})` : 'Unknown Location'}
Time: ${new Date().toLocaleTimeString()}
Patient: ${mInfo.name || 'Unknown'}
Blood Group: ${mInfo.bloodGroup}
IMMEDIATE ASSISTANCE REQUIRED.
If information is received and ambulance is sent press 1`;

    try {
      if (!silent || isHelpCommand) {
        if (isHelpCommand && 'speechSynthesis' in window) {
           speakNotification(`${pName} needs help.`);
           setTimeout(() => speakNotification(`${pName} needs help.`), 2000);
        } else if (!silent) {
           speakNotification("Initiating emergency broadcast protocols.");
        }
      }
      
      // Delay slightly so the voice notification isn't abruptly cut off, but do NOT
      // trigger native dialer since we are handling Twilio calls.
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Send SMS
      await executeWithOfflineFallback('/api/sos/notify', 'POST', { 
          recipients: targetNumbers, 
          message: smsMessage 
      });

      // Delay slightly between SMS and Calls to ensure correct delivery order
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Initiate Call concurrently for all targets
      await Promise.all(targetNumbers.map((targetNumber: string) => 
        executeWithOfflineFallback('/api/sos/call-initiate', 'POST', { 
            to: targetNumber,
            message: isHelpCommand ? distressCallMessage : "Emergency Alert. Patient in danger. Please press 1 to confirm dispatch.",
            host: window.location.origin
        })
      ));

      // Dial from the user's phone directly
      if (targetNumbers.length > 0) {
        window.location.href = `tel:${targetNumbers[0].replace('+', '')}`;
      }

      // Send PDF Report to targets via messenger
      await Promise.all(targetNumbers.map((targetNumber: string) => 
        executeWithOfflineFallback('/api/sos/send-report', 'POST', {
            responder: targetNumber,
            logs: logsRef.current.slice(0, 50),
            medicalInfo: medicalInfoRef.current
        }).catch(err => console.error("Report sending failed for " + targetNumber, err))
      ));

      if (!silent) {
        setIsEmergency(false);
        setInitialVoiceState('DISPATCH_PENDING');
        setIsVoiceActive(true);
      }
    } catch (err) {
      console.error("Broadcast Error:", err);
      if (!silent) {
        speakNotification("Broadcast interference detected. Please use manual override.");
      }
    } finally {
      // Cooldown to prevent spam
      setTimeout(() => {
        isBroadcastingRef.current = false;
      }, 30000); 
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

  const callNearestHospital = async (forcedTargetNumber: string = "+917892375787") => {
    isBroadcastingRef.current = true;
    const reason = "Severe accident detected via AI intent. Calling nearest hospital.";
    saveLogEntry(reason, userLocation);
    speakNotification("Calling nearest hospital.");

    // Google Places API text search for nearest hospital
    let targetHospitalNumber = forcedTargetNumber;
    let fallbackToForced = true;
    try {
      if (userLocation) {
        const placesUrl = `/api/places/nearby`;
        const headers = { 
          'Content-Type': 'application/json',
          'X-Goog-FieldMask': 'places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber'
        };
        const body = {
          includedTypes: ["hospital", "medical_clinic"],
          maxResultCount: 1,
          locationRestriction: {
            circle: { center: { latitude: userLocation.lat, longitude: userLocation.lng }, radius: 10000.0 }
          }
        };

        const res = await fetch(placesUrl, { method: 'POST', headers, body: JSON.stringify(body) });
        if (res.ok) {
          const data = await res.json();
          if (data.places && data.places.length > 0) {
            const hospital = data.places[0];
            const phone = hospital.internationalPhoneNumber || hospital.nationalPhoneNumber;
            if (phone) {
               console.log(`[Places API] Nearest Hospital Found: ${hospital.displayName?.text}, Phone: ${phone}`);
               targetHospitalNumber = phone;
               fallbackToForced = false;
            }
          }
        }
      }
    } catch (e) {
      console.error("[Places API] Failed to fetch nearest hospital:", e);
    }
    
    // As per requirement: call +91 7892375787 but display nearest hospital calling.
    targetHospitalNumber = forcedTargetNumber; // Override to strictly call the required specific number, but we kept the fetch logic if we wanted dynamic numbers.

    // Allow executeDistressBroadcast to run
    isBroadcastingRef.current = false;
    await executeDistressBroadcast(`Emergency dispatch to nearest hospital`, false, targetHospitalNumber);
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
          setAiFirstAidResponse("Listening for incident description...");
          speakNotification("First aid assistant session closed. Stay safe.");
        }
      }, 20000); 

    } catch (err) {
      console.error("AI First Aid Error:", err);
      setIsAIFirstAidActive(false);
      isAIFirstAidActiveRef.current = false;
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
  const startSafetyVerification = () => {
    if (isBroadcastingRef.current || isEmergency || isDistressPendingRef.current) return;
    console.log("[Safety Probe] Starting safety verification due to high G-load/suspected fall.");
    setIsSafetyChecking(true);
    isSafetyCheckingRef.current = true;
    setSafetyCheckRound(1);
    speakNotification("Are you okay?");
    
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    safetyCheckTimerRef.current = setTimeout(() => {
      if (isSafetyCheckingRef.current) {
        console.log("[Safety Probe] No response within 10 seconds. Executing HELP functionality.");
        executeHelpFunctionality("User unresponsive after suspected fall (10s timeout)");
      }
    }, 10000);
  };

  const executeHelpFunctionality = async (reason: string) => {
    if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
    setIsSafetyChecking(false);
    isSafetyCheckingRef.current = false;
    setSafetyCheckRound(0);

    console.log(`[HELP Functionality] Executing distress sms and call due to: ${reason}`);
    
    // Call the secret distress broadcast which handles both call and SMS
    await executeSecretDistressBroadcast();
    
    // Also trigger local emergency state for UI feedback
    setIsEmergency(true);
    speakNotification("Help is on the way. Emergency services and your contact have been notified.");
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
    
    console.log(`[Safety Probe] Incident reported: "${incident}". Executing silent SOS.`);
    executeDistressBroadcast(`Auto-Detected Impact Incident: ${incident}`, true);
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

  const executeSecretDistressBroadcast = async () => {
    if (isBroadcastingRef.current) return;
    isBroadcastingRef.current = true;

    saveLogEntry("Secret distress hold trigger (SOS Hold)", userLocation);
    const mappedContacts = (medicalInfo.emergencyContacts || []).map((c: any) => c.number).filter((n: string) => n && /^\\+?[\\d\\s()-]{7,20}$/.test(n));
    const targetNumbers = mappedContacts.length > 0 ? mappedContacts : ["+916361892311", "+917892375787"];
    
    let addressStr = "Unknown Location";
    if (userLocation) {
      try {
        const resolvedAddress = await geoapifyService.reverseGeocode(userLocation.lat, userLocation.lng);
        if (resolvedAddress && resolvedAddress !== "Unknown Location") {
          addressStr = resolvedAddress;
        }
      } catch (err) {
        console.error("Geocoding failed inside secret distress broadcast:", err);
      }
    }

    const liveLocationLink = userLocation 
      ? `https://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}`
      : "Unknown Location";
      
    const pName = medicalInfoRef.current.name || userPhoneRef.current || 'the user';
    const smsMessage = `${pName} is in danger and help is needed. Live Location: ${addressStr} (${liveLocationLink})`;
    const callMessage = `Emergency Alert. ${pName} is in danger and help is needed.`;

    try {
      // 1. Send SMS to targets
      await executeWithOfflineFallback('/api/sos/notify', 'POST', { 
          recipients: targetNumbers, 
          message: smsMessage 
      });

      // Delay slightly between SMS and Calls to ensure Twilio network order
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Initiate Call concurrently for all targets
      await Promise.all(targetNumbers.map((targetNumber: string) => 
        executeWithOfflineFallback('/api/sos/call-initiate', 'POST', { 
            to: targetNumber,
            message: callMessage,
            host: window.location.origin
        })
      ));

      // 3. Send PDF Report to targets via messenger
      await Promise.all(targetNumbers.map((targetNumber: string) => 
        executeWithOfflineFallback('/api/sos/send-report', 'POST', {
            responder: targetNumber,
            logs: logsRef.current.slice(0, 50),
            medicalInfo: medicalInfoRef.current
        }).catch(err => console.error("Report sending failed for " + targetNumber, err))
      ));

      console.log(`[Secret Distress] Secret SMS, Call, and Report initiated successfully to ${targetNumbers.join(', ')}`);
    } catch (err) {
      console.error("[Secret Distress] Failed to send secret distress payload.", err);
    } finally {
      setTimeout(() => {
        isBroadcastingRef.current = false;
      }, 30000); 
    }
  };

  const triggerSOS = () => {
    if (!isMonitoring) {
      runMLRecovery();
      return;
    }
    executeSecretDistressBroadcast();
  };

  // Background Speech Recognition for Safety Word
  useEffect(() => {
    if (isEmergency || isVoiceActive || isChatbotModalOpen) {
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      backgroundRecognitionRef.current = new SpeechRecognition();
      backgroundRecognitionRef.current.continuous = true;
      backgroundRecognitionRef.current.interimResults = true;
      backgroundRecognitionRef.current.lang = 'en-US';

      backgroundRecognitionRef.current.onresult = (event: any) => {
        if (isSpeakingRef.current) return;
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript + ' ';
          }
        }
        
        // Normalize transcripts: lowercase and strip all punctuation/special characters
        const normalizeStr = (str: string) => str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        
        const cleanFinal = normalizeStr(finalTranscript);
        const cleanInterim = normalizeStr(interimTranscript);
        const cleanCombined = normalizeStr(finalTranscript + ' ' + interimTranscript);

        const isWakeupCommand = cleanCombined.includes('wakeup the application') || cleanCombined.includes('wake up the application') || cleanCombined.includes('start the application') || cleanCombined.includes('start the app') || cleanCombined.includes('wake up the app') || cleanCombined.includes('wakeup the app') || cleanCombined.includes('activate the application') || cleanCombined.includes('activate the app');

        if (!isMonitoring) {
           if (isWakeupCommand) {
              speakNotification("Waking up the application. Road SOS protection is now active.");
              setIsMonitoring(true);
              if(backgroundRecognitionRef.current) {
                backgroundRecognitionRef.current.abort();
              }
           }
           // IMPORTANT: If not monitoring and not a wakeup command, IGNORE everything else.
           return;
        }

        // Unified Rolling Transcript for Core Panic Words (Fallback & Safety Word Check)
        if (cleanFinal.length > 0) {
           rollingTranscriptsRef.current.push({ text: cleanFinal, time: Date.now() });

           if (isAIFirstAidActiveRef.current) {
             if (ignoreNextFinalRef.current) {
               ignoreNextFinalRef.current = false; // consume ignore flag
             } else {
               if (aiFirstAidTimeoutRef.current) clearTimeout(aiFirstAidTimeoutRef.current);
               const incident = cleanFinal.replace(/\bfirst aid\b/g, "").trim();
               if (incident !== "") {
                 console.log(`[AI First Aid] Processing incident: "${incident}"`);
                 handleAIFirstAid(incident);
                 if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return; 
               }
             }
           }
        }
        
        const currentNow = Date.now();
        rollingTranscriptsRef.current = rollingTranscriptsRef.current.filter(x => currentNow - x.time <= 20000);
        const rollingText = rollingTranscriptsRef.current.map(x => x.text).join(' ') + ' ' + cleanInterim;

        // 1. Instant Wake Word Checks (Interim or Final)
        if (cleanCombined.includes("chatbot") || cleanCombined.includes("chat bot")) {
           console.log("[Wake Word] CHATBOT detected, opening Voice Assistant.");
           window.dispatchEvent(new CustomEvent('wake-chatbot'));
           if (backgroundRecognitionRef.current) {
             backgroundRecognitionRef.current.abort();
           }
           return;
        }

        if (cleanCombined.includes("first aid") && !isAIFirstAidActiveRef.current) {
            console.log("[Wake Word] FIRST AID detected instantly.");
            
            const splitText = cleanCombined.split("first aid"); 
            const trailingText = splitText[splitText.length - 1].trim();

            setIsAIFirstAidActive(true);
            isAIFirstAidActiveRef.current = true;

            if (trailingText.length > 5) {
                handleAIFirstAid(trailingText);
            } else {
                speakNotification("I heard you need first aid. What happened?");
                setAiFirstAidResponse("I heard you need first aid. What happened?");
                if (aiFirstAidTimeoutRef.current) clearTimeout(aiFirstAidTimeoutRef.current);
                aiFirstAidTimeoutRef.current = setTimeout(() => {
                  if (isAIFirstAidActiveRef.current) {
                    setIsAIFirstAidActive(false);
                    isAIFirstAidActiveRef.current = false;
                    speakNotification("First aid assistant timed out.");
                  }
                }, 15000);
            }
            if (backgroundRecognitionRef.current) {
              ignoreNextFinalRef.current = true;
              backgroundRecognitionRef.current.abort();
            }
            return;
        }

        const neonRegex = /\b(neon|leon|ne on|knee on|nian|beyond|new one|nyon|neeon)\b/g;
        if ((rollingText.match(neonRegex) || []).length >= 3 && !isBroadcastingRef.current) {
            const recentlyTriggered = logsRef.current.some(l => 
                l.reason.includes("NEON triggered 3 times") && (Date.now() - new Date(l.timestamp).getTime() < 60000)
            );
            if (!recentlyTriggered) {
                console.log("[Wake Word] NEON 3x Triggered instantly.");
                saveLogEntry(`Secret word NEON triggered 3 times`, userLocation);
                executeNeonDistress();
            }
            rollingTranscriptsRef.current = [];
            return;
        }

        const helpRegex = /\b(help|helps|helping|howp|health)\b/g;
        if ((rollingText.match(helpRegex) || []).length >= 3 && !isBroadcastingRef.current) {
            const recentlyTriggered = logsRef.current.some(l => 
                l.reason.includes("HELP triggered 3 times") && (Date.now() - new Date(l.timestamp).getTime() < 60000)
            );
            if (!recentlyTriggered) {
                console.log("[Wake Word] HELP 3x Triggered. Initiating distress.");
                saveLogEntry(`Emergency word HELP triggered 3 times`, userLocation);
                executeDistressBroadcast("Voice activated emergency distress alert (HELP spoken 3 times)", false);
            }
            rollingTranscriptsRef.current = [];
            return;
        }

        // 2. Cancellation Check (Instant)
        const wantsToCancel = ["cancel", "safe", "stop", "abort", "reset", "wait", "dismiss", "false"].some(word => cleanCombined.includes(word)) || 
                              cleanCombined.includes("i am safe") || 
                              cleanCombined.includes("i'm safe");
        
        if (wantsToCancel) {
          let canceledSomething = false;
          if (isDistressPendingRef.current) {
            console.log(`[Safety] Voice Cancellation Detected: "${cleanCombined}"`);
            cancelDistress();
            canceledSomething = true;
          }
          if (isSafetyCheckingRef.current) {
            console.log(`[Safety] Voice Cancellation of Safety Probe: "${cleanCombined}"`);
            cancelSafetyVerification();
            canceledSomething = true;
          }
          if (isWaitingForIncidentRef.current) {
            if (safetyCheckTimerRef.current) clearTimeout(safetyCheckTimerRef.current);
            setIsWaitingForIncident(false);
            isWaitingForIncidentRef.current = false;
            speakNotification("Incident report cancelled.");
            canceledSomething = true;
          }
          if (isAIFirstAidActiveRef.current) {
            setIsAIFirstAidActive(false);
            isAIFirstAidActiveRef.current = false;
            speakNotification("First aid assistant closed.");
            canceledSomething = true;
          }
          if (canceledSomething) return;
        }

        const safeWordNormalized = safetyWord.toLowerCase().trim();
        if (safeWordNormalized.length > 0) {
            const matches = (rollingText.match(new RegExp(`\\b${safeWordNormalized}\\b`, 'g')) || []).length;
            if (matches >= 3 && !isBroadcastingRef.current) {
                console.log(`CRITICAL: Safety Word (${safetyWord}) 3x Triggered via Rolling Transcript.`);
                rollingTranscriptsRef.current = [];
                initiateDistressBroadcast(`Safety Word (${safetyWord} x3) Activation`, true);
                return;
            }
        }

        // 3. Process robust occurrences on FINALized results (to prevent duplicate interim counts)
        if (cleanCombined.length > 0) {
           const executeAndClear = () => { if (backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); };
           const _realCleanFinal = cleanCombined;
           const cleanCombinedAlias = cleanCombined;
           // Handle Safety Verification Flow responses
           if (isSafetyCheckingRef.current) {
             const lowerVal = cleanCombined.toLowerCase();
             if (
               lowerVal.includes("i am ok") || 
               lowerVal.includes("im ok") || 
               lowerVal.includes("i'm ok") || 
               lowerVal.includes("i m ok") || 
               lowerVal.includes("i am okay") || 
               lowerVal.includes("i'm okay") || 
               lowerVal.includes("im okay") || 
               lowerVal.includes("i m okay") ||
               lowerVal === "ok" ||
               lowerVal === "okay" ||
               lowerVal === "safe" ||
               lowerVal.includes("i am safe") ||
               lowerVal.includes("i'm safe")
             ) {
               console.log("[Safety Probe] User confirmed: I am OK. Cancelling safety features.");
               cancelSafetyVerification();
               if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
             }
             if (
               lowerVal.includes("i need help") || 
               lowerVal.includes("need help") || 
               lowerVal.includes("help") || 
               lowerVal.includes("danger")
             ) {
               console.log("[Safety Probe] User stated: I NEED HELP. Triggering HELP functionality.");
               executeHelpFunctionality("User said I NEED HELP during safety verification probe");
               if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
             }
           }

           if (isWaitingForIncidentRef.current) {
             handleIncidentResponse(cleanCombined);
             if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
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
             if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
           } else if (turnOffDriveRegex.test(cleanCombined)) {
             if (isDrivingModeRef.current) {
               toggleDrivingModeRef.current();
             } else {
               speakNotification("Driving mode is already off.");
             }
             if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
           }

           if (cleanCombined.includes('wakeup the application') || cleanCombined.includes('wake up the application') || cleanCombined.includes('start the application') || cleanCombined.includes('start the app') || cleanCombined.includes('wake up the app') || cleanCombined.includes('wakeup the app')) {
             if (!isMonitoring) {
               speakNotification("Waking up the application. Road SOS protection is now active.");
               setIsMonitoring(true);
             } else {
               speakNotification("The application is already awake and active.");
             }
             if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
           }

           if (cleanCombined.includes('shutdown the application') || cleanCombined.includes('shut down the application') || cleanCombined.includes('close the application') || cleanCombined.includes('close the app') || cleanCombined.includes('shutdown the app') || cleanCombined.includes('shut down the app')) {
             speakNotification("Shutting down the application. Voice wake up is still active.");
             setIsMonitoring(false);
             if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
           }
           
           if (cleanCombined.includes("open voice assistant") || cleanCombined.includes("open chatbot") || cleanCombined.includes("start voice assistant")) {
             setIsVoiceActive(true);
             setIsChatbotModalOpen(true);
             setChatbotGreeting("Voice assistant opened. How can I help you?");
             speakNotification("Voice assistant opened. How can I help you?");
             if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
           } else if (cleanCombined.includes("close voice assistant") || cleanCombined.includes("close chatbot") || cleanCombined.includes("stop voice assistant") || cleanCombined.includes("close assistant") || cleanCombined.includes("stop chatbot") || cleanCombined.includes("exit assistant") || cleanCombined.includes("exit chatbot")) {
             setIsVoiceActive(false);
             setIsChatbotModalOpen(false);
             setIsAIFirstAidActive(false);
             isAIFirstAidActiveRef.current = false;
             speakNotification("Assistant closed.");
             if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
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
                    if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
                }
            }

           if (isWaitingForEmergencyChoiceRef.current) {
             if (cleanCombined.includes("emergency") || cleanCombined.includes("number") || cleanCombined.includes("contact")) {
               isWaitingForEmergencyChoiceRef.current = false;
               speakNotification("Calling emergency contact.");
               executeDistressBroadcast("User requested emergency contact via voice", false);
               if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
             } else if (cleanCombined.includes("nearest") || cleanCombined.includes("hospital")) {
               isWaitingForEmergencyChoiceRef.current = false;
               speakNotification("Calling nearest hospital.");
               // It calls the specific number but displays the name via Places API in callNearestHospital
               callNearestHospital("+917892375787"); 
               if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
             }
           }

           if (cleanCombined.includes("i had an accident") || cleanCombined.includes("had an accident") || cleanCombined === "accident") {
             isWaitingForEmergencyChoiceRef.current = true;
             speakNotification("Should I contact emergency number or nearest hospital?");
             if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
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
               if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
           }

           if (cleanCombined === "hello" || cleanCombined.includes("hello") || cleanCombined === "hi" || cleanCombined === "heilo" || cleanCombined.includes("hi ") || cleanCombined.includes("hey ")) {
               console.log("Voice Command: Hello");
               setChatbotGreeting("HEILO bob how are you doing!");
               setIsChatbotModalOpen(true);
               if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
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
               if(backgroundRecognitionRef.current) backgroundRecognitionRef.current.abort(); return;
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
      };

      backgroundRecognitionRef.current.onstart = () => {
        window.dispatchEvent(new CustomEvent('health-mic-active', { detail: true }));
      };

      backgroundRecognitionRef.current.onend = () => {
        window.dispatchEvent(new CustomEvent('health-mic-active', { detail: false }));
        if (!isEmergency && !isVoiceActive && !isChatbotModalOpen) {
          setTimeout(() => {
            if (backgroundRecognitionRef.current) {
               try {
                 backgroundRecognitionRef.current.start();
               } catch (e) {
                 console.log("[Watchdog] Background Voice Rec failed to restart automatically.", e);
               }
            }
          }, 300);
        }
      };

      backgroundRecognitionRef.current.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn("[Watchdog] Speech Recognition Error:", event.error);
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          // fatal error
          return;
        }
        // other errors => we rely on onend to restart
      };

      try {
        if (!isChatbotModalOpen) {
          backgroundRecognitionRef.current.start();
        }
      } catch (e) {
        console.error("Speech Recognition Start Error:", e);
      }
    }
    
    // Auto-restart interval to prevent event.results buffer memory leak in Chrome
    const memoryLeakInterval = setInterval(() => {
        if (backgroundRecognitionRef.current) {
            try {
               backgroundRecognitionRef.current.stop(); // onend will auto-restart it
            } catch(e) {}
        }
    }, 45000);
    
    // Watchdog Interval to ensure it stays alive unconditionally
    const watchdogInterval = setInterval(() => {
        if (!isEmergency && !isVoiceActive && !isChatbotModalOpen && backgroundRecognitionRef.current) {
            try {
                // If it's already started, this will throw "InvalidStateError". We catch and ignore it.
                // If it silently died (without onend, common on Chrome), this will jumpstart it.
                backgroundRecognitionRef.current.start();
            } catch (err: any) {
                if (err.name !== 'InvalidStateError') {
                    console.log("[Watchdog] Kickstart encountered non-standard error:", err);
                }
            }
        }
    }, 2000);

    return () => {
      clearInterval(memoryLeakInterval);
      clearInterval(watchdogInterval);
      if (backgroundRecognitionRef.current) {
          backgroundRecognitionRef.current.onend = null; // prevent auto-restart loop
          backgroundRecognitionRef.current.abort();
      }
    };
  }, [isEmergency, isVoiceActive, isMonitoring, safetyWord, isChatbotModalOpen]);

  useEffect(() => {
    // Check if motion is supported
    if (!window.DeviceMotionEvent) {
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
    // Fast initial fix (low accuracy)
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("[GPS] Initial fix failed:", err),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.warn("[GPS] Geolocation failed:", err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (!isMonitoring) return;

    let lastStateUpdate = 0;

    // Accelerometer
    const handleMotion = (e: DeviceMotionEvent) => {
      if (e.accelerationIncludingGravity) {
        const { x, y, z } = e.accelerationIncludingGravity;
        const curX = x || 0;
        const curY = y || 0;
        const curZ = z || 0;
        
        const g = Math.sqrt(curX**2 + curY**2 + curZ**2) / 9.81;

        if (g > 12.0 && !isEmergencyRef.current && !isDistressPendingRef.current) {
          console.log("[Crash Detection] Critical G-force exceeded (>12G). Triggering immediate broadcast.");
          initiateDistressBroadcast("Auto-Detected Severe Impact (>12G)", true);
        } else if (g > 8.0 && !isSafetyCheckingRef.current && !isEmergencyRef.current && !isDistressPendingRef.current) {
          startSafetyVerification();
        }

        const now = Date.now();
        if (now - lastStateUpdate > 250) {
          lastStateUpdate = now;
          setTelemetry({ x: curX, y: curY, z: curZ });
          setPeakG(current => g > current ? g : current);
          
          setHistory(prev => {
            const nextId = prev.length > 0 ? (prev[prev.length - 1].id + 1) : 0;
            const next = [...prev, { g, time: Date.now(), id: nextId }];
            if (next.length > 30) return next.slice(1);
            return next;
          });
        }
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isMonitoring]);

  const requestMotionPermission = async () => {
    try {
      // iOS 13+ requires explicit permission
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        const response = await (DeviceMotionEvent as any).requestPermission();
        if (response === 'granted') {
          setMotionPermission('granted');
          setIsMonitoring(true);
          return true;
        } else {
          setMotionPermission('denied');
          return false;
        }
      } else {
        // Non-iOS or older versions
        setMotionPermission('granted');
        setIsMonitoring(true);
        return true;
      }
    } catch (e) {
      console.error("Motion Permission Error:", e);
      setMotionPermission('unsupported');
      return false;
    }
  };

  const triggerMockCrash = () => {
    setPeakG(4.5);
    startSafetyVerification();
  };

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
       navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
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
                  Attempt {safetyCheckRound} of 3
                  <br/>
                  <span className="text-blue-400 animate-pulse">Speak: "YES I AM SAFE"</span>
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
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-white/5 mb-8">
                  <p className="text-emerald-400 font-medium text-lg leading-relaxed">
                    {aiFirstAidResponse}
                  </p>
                </div>
                <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 text-[10px] text-slate-500 uppercase tracking-[0.2em]">
                  Speak clearly: "My arm is bleeding", "I have a headache", etc.
                </div>
                <button 
                  onClick={() => {
                    setIsAIFirstAidActive(false);
                    isAIFirstAidActiveRef.current = false;
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
            />
          )}
          {isChatbotModalOpen && (
            <ChatbotModal 
              key="chatbot-modal"
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
                       <h2 className="text-3xl font-black uppercase tracking-tight">HELP IS COMING!!</h2>
                       <p className="text-green-100 font-medium">Please stay calm and do not panic. Responders have acknowledged the emergency.</p>
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
                        <p className="text-[9px] text-slate-500 mt-4 uppercase font-bold tracking-widest">Repeat 3 times in quick succession to trigger SOS</p>
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
                         <h4 className="text-sm font-bold">Auto-Reply: "Bob is driving and will reach to you later."</h4>
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
                     <p className="text-sm italic font-medium">"Bob is driving and will reach to you later."</p>
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

              <div className="flex-1 min-h-[100px] mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <YAxis hide domain={[0, 5]} />
                    <Line 
                      type="monotone" 
                      dataKey="g" 
                      stroke="#3b82f6" 
                      strokeWidth={3} 
                      dot={false} 
                      animationDuration={300}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

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
                Mock Crash Sensor
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
                    <input 
                      type="text" 
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
