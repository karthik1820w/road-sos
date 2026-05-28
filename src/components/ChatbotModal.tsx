import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Bot, Mic, ArrowLeft, Loader2, Volume2 } from 'lucide-react';

interface ChatbotModalProps {
  onClose: () => void;
  userLocation?: { lat: number; lng: number };
  onTriggerDispatch?: (type: string) => void;
  onMapNearestHospital?: () => void;
  onToggleTraffic?: (state: boolean) => void;
}

export const ChatbotModal: React.FC<ChatbotModalProps> = ({ 
  onClose, 
  userLocation,
  onTriggerDispatch,
  onMapNearestHospital,
  onToggleTraffic
}) => {
  const stateRef = useRef<'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR'>('IDLE');
  const [state, _setState] = useState<'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR'>('IDLE');
  
  const setState = (newState: 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'ERROR') => {
    stateRef.current = newState;
    _setState(newState);
  };

  const [transcript, setTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>('');

  const cleanUpAudio = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
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
        setTranscript(currentFullText);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        
        if (currentFullText.trim().length > 0) {
          const lowerText = currentFullText.toLowerCase();
          if (lowerText.includes('close chatbot') || lowerText.includes('exit chatbot')) {
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
          }, 2000); // 2 second silence means user stopped talking
        }

        if (chunkFinal) {
          transcriptBufferRef.current += chunkFinal + ' ';
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          console.error("Chatbot Voice Error:", event.error);
          setState('ERROR');
        }
      };

      recognitionRef.current.onend = () => {
        // If we drop out of listening and we're not processing or speaking, restart listening
        if (stateRef.current === 'LISTENING' || stateRef.current === 'IDLE') {
           try { recognitionRef.current.start(); } catch(e) {}
        }
      };
    }

    // Auto-start speaking on mount, which will trigger listening on end
    const timer = setTimeout(() => {
      speak("How can I help?");
    }, 500);

    return () => {
      clearTimeout(timer);
      cleanUpAudio();
    };
  }, []);

  const startListening = () => {
    if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch(e) {}
    }
  };

  const handleQuery = async (text: string) => {
    setState('PROCESSING');
    try {
      const response = await fetch('/api/ai/voice-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, location: userLocation })
      });
      const data = await response.json();
      const answer = data.text || "I'm having trouble connecting to my brain.";
      
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
      
    } catch (err) {
      console.error(err);
      setLastResponse("I experienced an error connecting to my brain. Please try again.");
      speak("I experienced an error connecting to my brain. Please try again.");
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
            {state === 'LISTENING' ? 'Listening...' : state === 'PROCESSING' ? 'Thinking...' : state === 'SPEAKING' ? 'Speaking' : 'Chatbot Status'}
        </h2>

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
      </div>
    </motion.div>
  );
};
