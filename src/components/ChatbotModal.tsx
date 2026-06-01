import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Bot, Mic, ArrowLeft, Loader2, Volume2 } from 'lucide-react';

import { TrafficUpdate } from '../services/trafficService';

interface ChatbotModalProps {
  onClose: () => void;
  userLocation?: { lat: number; lng: number };
  trafficData?: TrafficUpdate | null;
  onTriggerDispatch?: (type: string) => void;
  onMapNearestHospital?: () => void;
  onToggleTraffic?: (state: boolean) => void;
  onFetchTrafficUpdates?: (locationName?: string) => void;
}

export const ChatbotModal: React.FC<ChatbotModalProps> = ({ 
  onClose, 
  userLocation,
  trafficData,
  onTriggerDispatch,
  onMapNearestHospital,
  onToggleTraffic,
  onFetchTrafficUpdates
}) => {
  const stateRef = useRef<'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR'>('IDLE');
  const [state, _setState] = useState<'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR'>('IDLE');
  
  const setState = (newState: 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR') => {
    stateRef.current = newState;
    _setState(newState);
  };

  const [transcript, setTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState<string>('');
  
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>('');

  const cleanUpAudio = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try { recognitionRef.current.abort(); } catch(e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        setState('LISTENING');
        transcriptBufferRef.current = '';
        setTranscript('');
      };

      recognitionRef.current.onresult = (event: any) => {
        let chunkFinal = '';
        let chunkInterim = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
           if (event.results[i].isFinal) {
             chunkFinal += event.results[i][0].transcript;
           } else {
             chunkInterim += event.results[i][0].transcript;
           }
        }
        
        const currentFullText = transcriptBufferRef.current + chunkFinal + chunkInterim;
        
        // --- BARGE-IN SUPPORT ---
        if (stateRef.current === 'SPEAKING' && chunkInterim.trim().length > 3) {
           console.log("Barge-in detected - cancelling speech.");
           window.speechSynthesis.cancel();
           setState('LISTENING');
        }

        setTranscript(currentFullText);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        
        if (currentFullText.trim().length > 0) {
          const lowerText = currentFullText.toLowerCase();
          if (lowerText.includes('close chatbot') || lowerText.includes('exit chatbot') || lowerText.includes('close assistant') || lowerText.includes('exit assistant') || lowerText.includes('stop chatbot') || lowerText.includes('stop assistant') || lowerText.includes('close voice assistant') || lowerText.includes('cancel')) {
              cleanUpAudio();
              onClose();
              return;
          }
          
          silenceTimerRef.current = setTimeout(() => {
            const textToSend = currentFullText.trim();
            if (recognitionRef.current) {
              try { recognitionRef.current.stop(); } catch(e){}
            }
            if (textToSend) {
               handleQuery(textToSend);
            }
          }, 1500); // 1.5 second silence means user stopped talking (faster perceived latency)
        }

        if (chunkFinal) {
          transcriptBufferRef.current += chunkFinal + ' ';
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.error("Chatbot Voice Error:", event.error);
          setState('ERROR');
          if (event.error === 'not-allowed') {
            setVoiceError("Microphone permission was denied. Please allow microphone access in your browser or type with the keyboard instead.");
          } else {
            setVoiceError(`Voice Error: ${event.error}`);
          }
        }
      };

      recognitionRef.current.onend = () => {
        // If we drop out of listening and we're not processing or speaking, restart listening
        if (stateRef.current === 'LISTENING' || stateRef.current === 'IDLE') {
           setTimeout(() => {
             if (recognitionRef.current) {
               try { recognitionRef.current.start(); } catch(e) {}
             }
           }, 300);
        }
      };
    }

    // Auto-start speaking on mount, which will trigger listening on end
    const timer = setTimeout(() => {
      speak("How can I help?");
    }, 500);

    // prevent memory overflow by periodically restarting
    const memoryLeakInterval = setInterval(() => {
        if (stateRef.current === 'LISTENING' && recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch(e) {}
        }
    }, 45000);

    const watchdogInterval = setInterval(() => {
        if ((stateRef.current === 'LISTENING' || stateRef.current === 'IDLE') && recognitionRef.current) {
            try {
                recognitionRef.current.start();
            } catch (err: any) {
                // Ignore InvalidStateError, throw others to console
                if (err.name !== 'InvalidStateError') console.error(err);
            }
        }
    }, 2000);

    return () => {
      clearTimeout(timer);
      clearInterval(memoryLeakInterval);
      clearInterval(watchdogInterval);
      cleanUpAudio();
    };
  }, []);

  const startListening = () => {
    if (voiceError) return;
    if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || state === 'PROCESSING') return;
    
    // Stop recognition if active
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(err){}
    }
    
    const query = textInput.trim();
    setTextInput('');
    setTranscript(query); // show typed message
    handleQuery(query);
  };

  const handleQuery = async (text: string) => {
    setState('PROCESSING');
    
    const getUpdateMatch = text.match(/(?:get updates|get updates ones|get update|traffic updates?)(?:\s+(?:about|on|in|for|at)\s+(.+))?/i);
    if (getUpdateMatch) {
       console.log("Chatbot: Get Updates intercepted");
       const locationName = getUpdateMatch[1];
       onFetchTrafficUpdates?.(locationName);
       const updateResponse = locationName ? `Getting traffic updates for ${locationName}.` : "Getting traffic updates for your current location.";
       setLastResponse(updateResponse);
       speak(updateResponse);
       return;
    }

    // Store dialogue in local history for context
    const conversationHistory = JSON.parse(localStorage.getItem('chatbot_context') || '[]');
    conversationHistory.push({ role: 'user', text });
    
    try {
      if (!navigator.onLine) {
        throw new Error("OFFLINE");
      }
      
      let trafficContext = undefined;
      if (trafficData) {
        trafficContext = `LIVE TRAFFIC DATA:
Location: ${trafficData.location}
Congestion: ${trafficData.congestionLevel}
Incidents: ${trafficData.incidents.length > 0 ? trafficData.incidents.slice(0, 5).map(i => i.name).join(', ') : 'None'}
Routes: ${trafficData.routes.map(r => `${r.name}: ${r.duration}min, ${r.distance}km`).join('; ')}
Last Updated: ${trafficData.lastUpdated.toLocaleTimeString()}`;
      }

      const response = await fetch('/api/ai/voice-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcript: text, 
          location: userLocation, 
          trafficContext: trafficContext,
          history: conversationHistory.slice(-5) 
        })
      });
      
      if (!response.ok) throw new Error("API_FAIL");
      
      const data = await response.json();
      const answer = data.text || "I'm having trouble connecting to my brain.";
      
      conversationHistory.push({ role: 'assistant', text: answer });
      localStorage.setItem('chatbot_context', JSON.stringify(conversationHistory.slice(-10)));
      
      setLastResponse(answer);
      speak(answer);
      
      if (data.toolCall) {
         const { name, args } = data.toolCall;
         if (name === 'execute_sos_dispatch') {
             onTriggerDispatch?.(args.type);
         } else if (name === 'Maps_to_nearest_hospital') {
             onMapNearestHospital?.();
         } else if (name === 'toggle_traffic_layer') {
             onToggleTraffic?.(args.state);
         }
      }
      
    } catch (err: any) {
      console.error(err);
      
      // OFFLINE FALLBACK
      let fallbackText = "I experienced an error connecting to my brain. Please try again.";
      if (err.message === "OFFLINE" || !navigator.onLine) {
         fallbackText = "It looks like you are offline. I am switching to basic on-device logic. I can still help you dial emergency services locally if you say help.";
         if (text.toLowerCase().includes("help") || text.toLowerCase().includes("emergency")) {
             fallbackText = "Offline mode active. Connecting you to emergency dispatch automatically.";
             onTriggerDispatch?.('offline_distress');
         }
      }
      
      setLastResponse(fallbackText);
      speak(fallbackText);
      
      // Log for observability
      window.dispatchEvent(new CustomEvent('chatbot-error-log', { detail: { error: err.message, query: text } }));
    }
  };

  const speak = (msg: string) => {
    if ('speechSynthesis' in window) {
      setState('SPEAKING');
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(msg);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      utterance.onend = () => {
        // Resume listening after speaking
        setTimeout(() => {
           startListening();
        }, 500);
      };
      
      utterance.onerror = () => {
        setTimeout(() => {
           startListening();
        }, 500);
      };
      
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex flex-col p-6 items-center justify-center"
    >
      <button onClick={onClose} className="absolute top-8 left-8 text-slate-500 hover:text-white transition-colors flex items-center gap-2">
        <ArrowLeft size={24} />
        <span className="font-bold uppercase tracking-widest text-xs">Back</span>
      </button>

      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-[40px] p-8 shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
        
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 border transition-all duration-700 ${state === 'LISTENING' ? 'bg-blue-500/20 border-blue-500/50 animate-pulse' : state === 'PROCESSING' ? 'bg-amber-500/20 border-amber-500/50' : state === 'SPEAKING' ? 'bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.3)]' : 'bg-slate-800 border-slate-700'}`}>
           {state === 'LISTENING' && <Mic className="text-blue-500" size={40} />}
           {state === 'PROCESSING' && <Loader2 className="text-amber-500 animate-spin" size={40} />}
           {state === 'SPEAKING' && <Volume2 className="text-emerald-500 animate-bounce" size={40} />}
           {state === 'IDLE' && <Bot className="text-slate-500" size={40} />}
           {state === 'ERROR' && <Bot className="text-red-500" size={40} />}
        </div>
        
        <h2 className="text-xl font-black mb-6 uppercase tracking-widest text-white">
            {state === 'LISTENING' ? 'Listening...' : state === 'PROCESSING' ? 'Thinking...' : state === 'SPEAKING' ? 'Speaking' : state === 'ERROR' ? 'Mic Error' : 'Chatbot Status'}
        </h2>

        {voiceError && (
          <div className="w-full bg-red-950/40 border border-red-500/20 p-4 rounded-2xl mb-4 text-center">
             <p className="text-red-400 text-xs font-semibold mb-2">{voiceError}</p>
             <button
               id="retry-voice-mic-btn"
               onClick={() => {
                 setVoiceError(null);
                 setState('IDLE');
                 if (recognitionRef.current) {
                   try { recognitionRef.current.start(); } catch(e){}
                 }
               }}
               className="px-4 py-2 bg-blue-650 hover:bg-blue-550 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all"
             >
               Retry Microphone
             </button>
          </div>
        )}

        {transcript && state === 'LISTENING' && (
            <div className="w-full bg-slate-950 border border-blue-500/20 p-5 rounded-2xl mb-4">
                <p className="text-slate-300 font-medium italic text-lg leading-relaxed">"{transcript}"</p>
            </div>
        )}

        {lastResponse && state !== 'LISTENING' && (
            <div className="w-full bg-slate-800 border border-slate-700 p-5 rounded-2xl mb-4">
                <p className="text-white font-medium text-lg leading-relaxed">{lastResponse}</p>
            </div>
        )}

        <form onSubmit={handleManualSubmit} className="w-full mt-4 flex gap-2">
          <input
            id="chatbot-text-input"
            type="text"
            placeholder="Type your question or destination..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={state === 'PROCESSING'}
            className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-2xl px-4 py-3 text-white placeholder-slate-500 outline-none text-sm transition-all"
          />
          <button
            id="send-chatbot-query-btn"
            type="submit"
            disabled={state === 'PROCESSING' || !textInput.trim()}
            className="bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:scale-100 disabled:opacity-40 transition-all text-white px-5 py-3 rounded-2xl font-bold uppercase tracking-widest text-[10px]"
          >
            Send
          </button>
        </form>
      </div>
    </motion.div>
  );
};
