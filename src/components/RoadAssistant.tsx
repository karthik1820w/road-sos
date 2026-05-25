import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, Send, Mic, Square, Loader2 } from 'lucide-react';

type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';

export const RoadAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chatbot-state-change', { detail: { isOpen } }));
  }, [isOpen]);

  const [messages, setMessages] = useState<{ role: 'user' | 'bot', content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef<string>('');
  const handleSendRef = useRef<any>(null);

  useEffect(() => {
    // Keep a reference to the latest handleSend to avoid stale closures inside onresult
    handleSendRef.current = handleSend;
  });

  useEffect(() => {
    const handleWake = () => {
      setIsOpen(true);
    };
    window.addEventListener('wake-chatbot', handleWake);
    return () => window.removeEventListener('wake-chatbot', handleWake);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          console.log("[VOICE DEBUG] Microphone Authorized / Active");
          setVoiceState('LISTENING');
          transcriptBufferRef.current = '';
        };
        
        recognition.onresult = (event: any) => {
          let chunkFinal = '';
          let chunkInterim = '';
          
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              chunkFinal += event.results[i][0].transcript;
            } else {
              chunkInterim += event.results[i][0].transcript;
            }
          }
          
          if (chunkFinal || chunkInterim) {
             console.log("[VOICE DEBUG] Sound Detected (User is speaking...)");
          }

          const currentFullText = transcriptBufferRef.current + chunkFinal + chunkInterim;
          setInput(currentFullText);

          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          
          if (currentFullText.trim().length > 0) {
            silenceTimerRef.current = setTimeout(() => {
              console.log("[VOICE DEBUG] Silence Detected - Sending to Gemini");
              const textToSend = currentFullText.trim();
              console.log(`[VOICE DEBUG] Final Transcription: "${textToSend}"`);
              
              if (recognitionRef.current) {
                 try { recognitionRef.current.stop(); } catch(e){}
              }
              
              if (textToSend && handleSendRef.current) {
                 handleSendRef.current(textToSend);
              }
            }, 1500);
          }
          
          if (chunkFinal) {
            transcriptBufferRef.current += chunkFinal + ' ';
          }
        };
        
        recognition.onerror = (event: any) => {
          console.error("[VOICE DEBUG] Speech recognition error:", event.error);
          if (event.error === 'not-allowed') {
             console.error("[VOICE DEBUG] Permission denied by OS/Browser.");
          }
          if (event.error === 'no-speech' || event.error === 'aborted') return;
          setVoiceState((prev) => prev === 'LISTENING' ? 'IDLE' : prev);
        };
        
        recognition.onend = () => {
          setVoiceState((prev) => prev === 'LISTENING' ? 'IDLE' : prev);
        };
        
        recognitionRef.current = recognition;
      }
      synthRef.current = window.speechSynthesis;
    }
    
    return () => {
       if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
       if (recognitionRef.current) {
         try { recognitionRef.current.stop(); } catch(e){}
       }
       if (synthRef.current) synthRef.current.cancel();
    }
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
       try { recognitionRef.current.stop(); } catch(e){}
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  };

  const playAudio = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    stopListening(); // Mute mic

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    
    let hasStarted = false;
    const fallbackTimer = setTimeout(() => {
      if (!hasStarted) {
        console.warn("[VOICE DEBUG] SpeechSynthesis blocked by browser. Resuming...");
        setVoiceState('IDLE');
      }
    }, 1000);
    
    utterance.onstart = () => {
      hasStarted = true;
      clearTimeout(fallbackTimer);
      setVoiceState('SPEAKING');
      stopListening(); // Double enforce mute
    };
    
    utterance.onend = () => {
      setVoiceState('IDLE');
    };
    
    utterance.onerror = () => {
      setVoiceState('IDLE');
    };
    
    synthRef.current.speak(utterance);
  };

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[VOICE DEBUG] Microphone Authorized / Active (Stream captured)");
      // Release the stream immediately since SpeechRecognition uses its own internal stream handling
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      console.error("[VOICE DEBUG] OS or Browser blocked microphone access:", err);
      return false;
    }
  };

  const [micGranted, setMicGranted] = useState(false);

  // Setup microphone check
  useEffect(() => {
    if (isOpen) {
       checkMicrophonePermission().then(granted => {
         if (granted) {
            setMicGranted(true);
            if (messages.length === 0) {
              const greeting = "Hello! I am your AI Road Assistant. How can I help you today?";
              setMessages([{ role: 'bot', content: greeting }]);
              playAudio(greeting);
            }
         }
       });
    } else {
       stopListening();
       setMicGranted(false);
       if (synthRef.current) synthRef.current.cancel();
       setVoiceState('IDLE');
    }
  }, [isOpen]);

  // Voice Loop Hook: Auto-start listening when IDLE and mic is granted
  useEffect(() => {
    if (isOpen && micGranted && voiceState === 'IDLE') {
      // Small delay to prevent rapid bouncing
      const timer = setTimeout(() => {
        startListening();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, micGranted, voiceState]);

  const startListening = () => {
    if (recognitionRef.current && voiceState === 'IDLE') {
      try {
        console.log("[VOICE DEBUG] Calling recognition.start()");
        recognitionRef.current.start();
      } catch (err) {
        console.error("[VOICE DEBUG] Failed to start recognition:", err);
      }
    }
  };

  const handleSend = async (overrideInput?: string | React.MouseEvent | React.KeyboardEvent) => {
    const text = typeof overrideInput === 'string' ? overrideInput : input;
    if (!text.trim() || voiceState === 'THINKING') return;
    
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    stopListening();
    
    setInput('');
    transcriptBufferRef.current = '';
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    setVoiceState('THINKING');

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text })
      });
      if (!res.ok) {
         throw new Error("Server response was not ok");
      }
      const data = await res.json();
      const answer = data.answer || "I did not understand that.";
      setMessages(prev => [...prev, { role: 'bot', content: answer }]);
      playAudio(answer);
    } catch {
      const errorMsg = "I'm having trouble connecting to the ai server.";
      setMessages(prev => [...prev, { role: 'bot', content: errorMsg }]);
      playAudio(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 left-8 z-30 bg-slate-900 border border-white/10 p-4 rounded-2xl shadow-2xl hover:bg-slate-800 transition-all group"
      >
        <Bot size={24} className="text-blue-500 group-hover:scale-110 transition-transform" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="fixed bottom-24 left-8 z-50 w-[350px] bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            <header className="bg-slate-950 p-6 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-3">
                <Bot size={20} className="text-blue-500" />
                <h3 className="text-sm font-black uppercase tracking-widest text-white italic">Voice Assistant</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white">
                <X size={20} />
              </button>
            </header>

            <div className="flex-1 p-6 space-y-4 max-h-[400px] overflow-y-auto">
              {messages.length === 0 && (
                <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest font-bold mt-8">
                   Speak directly to the assistant.
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-xs leading-relaxed ${
                    m.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-slate-800 text-slate-200 rounded-tl-none'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              
              {/* Live Transcription Bubble */}
              {input && voiceState === 'LISTENING' && (
                <div className="flex justify-end opacity-75">
                  <div className="max-w-[80%] p-3 rounded-2xl text-xs leading-relaxed bg-blue-600/50 text-white rounded-tr-none italic border border-blue-400/30">
                    {input}
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 p-4 rounded-3xl rounded-tl-none flex gap-1">
                    <span className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-950 border-t border-white/5 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={voiceState === 'LISTENING' ? '' : input}
                  onChange={(e) => {
                    if (voiceState === 'LISTENING') {
                      stopListening();
                    }
                    setInput(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSend(input);
                    }
                  }}
                  disabled={isLoading || voiceState === 'THINKING'}
                  placeholder="Type a message..."
                  className="flex-1 bg-slate-900 border border-slate-800 text-white text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || isLoading || voiceState === 'THINKING' || voiceState === 'LISTENING'}
                  className="p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-xl transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div 
                  className={`flex-1 flex justify-center items-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
                    voiceState === 'LISTENING' ? 'bg-red-500/20 text-red-500 border border-red-500/30 animate-pulse' :
                    voiceState === 'THINKING' ? 'bg-blue-500/20 text-blue-500 border border-blue-500/30' :
                    voiceState === 'SPEAKING' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' : 
                    'bg-slate-800 text-slate-400'
                  }`}
                >
                  {voiceState === 'IDLE' && <><Mic size={14} /> Voice Ready (Auto)</>}
                  {voiceState === 'LISTENING' && <><Mic size={14} /> Listening...</>}
                  {voiceState === 'THINKING' && <><Loader2 size={14} className="animate-spin" /> Thinking...</>}
                  {voiceState === 'SPEAKING' && <><Bot size={14} /> AI Speaking...</>}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
