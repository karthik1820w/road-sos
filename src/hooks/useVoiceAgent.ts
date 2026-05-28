import { useEffect, useRef } from 'react';
import { useVoice } from '../contexts/VoiceContext';

export const useVoiceAgent = (
  locationContext: any,
  callbacks: {
    onTriggerDispatch: (type: string) => void;
    onMapNearestHospital: () => void;
    onToggleTraffic: (state: boolean) => void;
    onProvideFirstAid: (symptom: string) => void;
  }
) => {
  const { transcript, processVoiceIntent, speak } = useVoice();
  const lastProcessedTranscript = useRef<string>("");

  useEffect(() => {
    // Only process new transcripts
    if (!transcript || transcript === lastProcessedTranscript.current) return;
    
    // Check if the user used the wake word (e.g. "NEON" or "Help")
    const lowerTranscript = transcript.toLowerCase();
    const hasWakeWord = lowerTranscript.includes('neon') || 
                        lowerTranscript.includes('help') || 
                        lowerTranscript.includes('chatbot');
                        
    if (!hasWakeWord) return;

    lastProcessedTranscript.current = transcript;

    const executeIntent = async () => {
      const response = await processVoiceIntent(transcript, locationContext);
      if (!response) return;

      if (response.toolCall) {
        const { name, args } = response.toolCall;
        
        switch (name) {
          case 'execute_sos_dispatch':
            speak(`Initiating emergency dispatch for ${args.type}.`);
            callbacks.onTriggerDispatch(args.type);
            break;
          case 'Maps_to_nearest_hospital':
            speak("Navigating to the nearest hospital on the map.");
            callbacks.onMapNearestHospital();
            break;
          case 'toggle_traffic_layer':
            speak(args.state ? "Turning on traffic overlay." : "Hiding traffic overlay.");
            callbacks.onToggleTraffic(args.state);
            break;
          case 'provide_first_aid':
            speak(`Getting first aid instructions for ${args.symptom}. One moment.`);
            callbacks.onProvideFirstAid(args.symptom);
            break;
          default:
            speak("I received a command, but I do not know how to execute it.");
        }
      } else if (response.text) {
        speak(response.text);
      }
    };

    executeIntent();
  }, [transcript, locationContext, processVoiceIntent, speak, callbacks]);
};
