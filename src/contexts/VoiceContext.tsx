import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { sharedWakeWordEngine } from '../safety/wakeWord';

interface VoiceContextType {
  isListening: boolean;
  transcript: string;
  speak: (text: string) => void;
  startListening: () => void;
  stopListening: () => void;
  processVoiceIntent: (transcript: string, locationContext?: any) => Promise<any>;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startListening = () => {
    setTranscript('');
    setIsListening(true);
  };

  const stopListening = () => {
    setIsListening(false);
  };

  const processVoiceIntent = async (text: string, locationContext?: any) => {
    try {
      const res = await fetch('/api/ai/voice-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, location: locationContext })
      });
      const data = await res.json();
      return data;
    } catch (e) {
      console.error("Voice process error", e);
      return null;
    }
  };

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let isActive = true;
    
    if (isListening) {
      sharedWakeWordEngine.subscribe(
        { word: 'neon' }, // arbitrary, since it's just listening
        (t, f, c, a) => {
          if (!isActive || !isListening) return;
          if (f && c > 0 && c < 0.3) {
             // low confidence filter
             return;
          }
          if (f) {
            setTranscript(t);
            setIsListening(false); // capture discrete commands, then restart
          }
        },
        (status) => {
          if (status === 'blocked' || status === 'idle' || status === 'unsupported') {
            setIsListening(false);
          }
        }
      ).then(unsubscribe => { unsub = unsubscribe; });
    }

    return () => {
      isActive = false;
      if (unsub) unsub();
    };
  }, [isListening]);

  return (
    <VoiceContext.Provider value={{ isListening, transcript, speak, startListening, stopListening, processVoiceIntent }}>
      {children}
    </VoiceContext.Provider>
  );
};

export const useVoice = () => {
  const context = useContext(VoiceContext);
  if (!context) throw new Error("useVoice must be used within a VoiceProvider");
  return context;
};
