# Voice & Noise Robustness Architecture

## The Ceiling of Browser SpeechRecognition
The Road SOS application currently relies on the browser's native SpeechRecognition API (the Web Speech API). It is important to understand the capabilities and limitations of this API, especially in the context of a safety-critical application deployed in potentially noisy environments (e.g., driving, traffic, accidents).

1. **Closed Box:** The Web Speech API is essentially a closed, cloud-side black box. The browser records audio and streams it to a provider (usually Google or Apple) for processing.
2. **No Client-Side Fine-Tuning:** There is no client-side acoustic model that we can fine-tune for specific keywords or noise profiles. We cannot adjust weights, provide a custom noise profile, or train the model on specific accents beyond selecting a locale (like en-IN).
3. **Implicit Audio Processing:** The browser implicitly handles audio acquisition, echo cancellation, and noise suppression before sending the stream to the cloud. We do not have direct control over these getUserMedia constraints within the SpeechRecognition interface.

## Current Mitigation Strategies

To get the most out of the current setup, Road SOS employs several strategies:

*   **Fuzzy Matching for Critical Keywords:** We have implemented a Levenshtein distance-based phonetic tolerance (fuzzy match) for our offline safety words. This ensures that minor misrecognitions (e.g., "kelp" instead of "help") due to background noise or poor signal do not block life-saving emergency triggers.
*   **Confidence-Aware Handling:** We intercept the confidence score from SpeechRecognition. For critical triggers, if the confidence is low (e.g., < 0.3), we do not immediately discard the input. Instead, we bias toward safety by clarifying or re-prompting the user ("I heard something like help, please repeat if you need emergency assistance"). For conversational queries, low confidence triggers a short re-prompt.
*   **Network Resilience:** We specifically trap 'network' errors and apply exponential backoff to handle brief disconnects while traveling. This allows the background safety monitor to survive cellular dead zones without crashing or terminating permanently.

## The Path to Controllable Streaming ASR

For true noise robustness in high-stakes environments, the application must eventually migrate away from the browser's black-box Web Speech API to a controlled, streaming Automatic Speech Recognition (ASR) architecture.

### Recommended Future Architecture:

1.  **Explicit getUserMedia Control:** Capture the audio stream directly using 
avigator.mediaDevices.getUserMedia(). This allows us to explicitly enable/disable hardware noise suppression, echo cancellation, and auto-gain control (AGC), which can sometimes interfere with keyword detection in noisy environments.
2.  **Streaming ASR Provider:** Stream the raw audio data (e.g., via WebSockets) to a dedicated ASR provider (like Google Cloud Speech-to-Text, Deepgram, or AssemblyAI).
3.  **Custom Acoustic Models & Speech Adaptation:** Using a dedicated provider allows us to leverage speech adaptation (providing a list of expected phrases like our safety words) to heavily bias the model towards recognizing those specific critical phrases, drastically improving accuracy in noise.
4.  **Client-Side Wake Word Engine:** Integrate a robust client-side wake word engine (like Picovoice Porcupine) that processes the raw audio stream locally. This provides instantaneous, offline detection of the safety word without relying on constant network connectivity for the background monitor. (Note: We have laid the groundwork for this via the PorcupineWakeWordEngine implementation).
