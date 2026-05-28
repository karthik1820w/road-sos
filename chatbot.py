import speech_recognition as sr
import pyttsx3
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate
import os
import sys

# 1. SETUP STRUCTURED LOGGING
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

class VoiceAssistantApp:
    def __init__(self):
        logger.info("Initializing Voice Assistant...")
        self.wake_word = "CHATBOT"
        
        # Ensure API key is set
        if "GEMINI_API_KEY" not in os.environ:
            logger.error("GEMINI_API_KEY environment variable is not set.")
            print("Please set your GEMINI_API_KEY environment variable before running.")
            sys.exit(1)

        # 2. INITIALIZE TTS ENGINE (The Voice)
        try:
            self.tts_engine = pyttsx3.init()
            self.tts_engine.setProperty('rate', 150) # Natural conversational speed
            logger.info("TTS Engine initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize TTS Engine: {e}")
            sys.exit(1)

        # 3. INITIALIZE SPEECH RECOGNITION
        self.recognizer = sr.Recognizer()
        # Adjust for ambient noise dynamically
        self.recognizer.dynamic_energy_threshold = True

        # 4. INITIALIZE LLM (The Brain)
        try:
            self.llm = ChatGoogleGenerativeAI(
                model="gemini-1.5-flash",
                temperature=0.3,
            )
            
            # Application of "The Chatbot System Prompt"
            system_prompt = """You are an elite, highly responsive voice assistant integrated into a smart application. 

Your specialized domains of expertise are climate, traffic conditions, vehicle specifications, rules, regulations, and general knowledge. 

Because your output is fed directly into a Text-to-Speech engine, you MUST strictly adhere to the following voice-first rules:

1. RADICAL CONCISENESS: Limit your answers to 1 to 3 short sentences. Be direct and punchy. Only elaborate if the user explicitly asks for details.
2. ZERO MARKDOWN: Never use bolding, asterisks, bullet points, lists, code blocks, or emojis. Write in completely plain, flat text.
3. SPOKEN FORMATTING: Spell out all numbers, symbols, and acronyms exactly as they should be spoken aloud (e.g., write "one hundred kilometers per hour" instead of "100 km/h", and "U. S. A." instead of "USA").
4. CONVERSATIONAL TONE: Be helpful, natural, and friendly. Do not use robotic or overly formal language.
5. HONESTY: If a user asks a question entirely outside your knowledge base or regarding real-time data you cannot access, simply state, "I don't have that information right now."
"""
            self.prompt_template = ChatPromptTemplate.from_messages([
                SystemMessagePromptTemplate.from_template(system_prompt),
                HumanMessagePromptTemplate.from_template("{user_input}")
            ])
            self.chain = self.prompt_template | self.llm
            
            logger.info("LLM components initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize LLM: {e}")
            sys.exit(1)

    def speak(self, text: str):
        """Converts text to speech and outputs to default audio device."""
        logger.info(f"Speaking: {text}")
        self.tts_engine.say(text)
        self.tts_engine.runAndWait()

    def process_conversation(self, query: str):
        """Passes the query to Gemini and returns the response."""
        logger.info(f"Processing query: {query}")
        try:
            response = self.chain.invoke({"user_input": query})
            # Langchain invoke returns an AIMessage, get the content
            answer = response.content.strip()
            logger.info(f"LLM Response: {answer}")
            self.speak(answer)
        except Exception as e:
            logger.error(f"LLM processing error: {e}")
            self.speak("I experienced an error connecting to my brain. Please try again.")

    def run(self):
        """Main loop: list to microphone and detect wake word, then listen for command."""
        logger.info(f"System ready and listening for wake word: '{self.wake_word}'...")
        
        with sr.Microphone() as source:
            # Calibrate ambient noise on start
            logger.info("Calibrating for ambient noise for 2 seconds...")
            self.recognizer.adjust_for_ambient_noise(source, duration=2)
            logger.info("Calibration complete.")
            print(f"\n--- System Online. Say '{self.wake_word}' to wake me up. ---")

            while True:
                try:
                    # Passive listening loop for wake word
                    audio = self.recognizer.listen(source)
                    transcript = self.recognizer.recognize_google(audio).lower()
                    
                    if self.wake_word.lower() in transcript:
                        logger.info(f"Wake word detected in: '{transcript}'")
                        self.speak("I'm listening.")
                        
                        # Active listening phase for user query
                        print("\nListening for your command...")
                        command_audio = self.recognizer.listen(source, timeout=10, phrase_time_limit=15)
                        command_transcript = self.recognizer.recognize_google(command_audio)
                        
                        logger.info(f"User command recognized: '{command_transcript}'")
                        if command_transcript.strip():
                            self.process_conversation(command_transcript)
                        else:
                            logger.info("Command transcript was empty.")
                    
                except sr.WaitTimeoutError:
                    pass # Ignore timeouts
                except sr.UnknownValueError:
                    pass # Ignore unintelligible noise
                except sr.RequestError as e:
                    logger.error(f"Speech recognition service error: {e}")
                except Exception as e:
                    logger.error(f"Unexpected error in run loop: {e}")

if __name__ == "__main__":
    app = VoiceAssistantApp()
    app.run()
