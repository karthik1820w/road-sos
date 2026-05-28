import unittest
from unittest.mock import patch, MagicMock
from chatbot import VoiceAssistantApp
import os

class TestVoiceAssistantApp(unittest.TestCase):
    
    @patch.dict(os.environ, {"GEMINI_API_KEY": "test_key_dummy"})
    @patch("chatbot.pyttsx3.init")
    @patch("chatbot.ChatGoogleGenerativeAI")
    def setUp(self, mock_llm_class, mock_tts_init):
        # Mock TTS engine
        self.mock_tts_engine = MagicMock()
        mock_tts_init.return_value = self.mock_tts_engine
        
        # Mock LLM and Chain
        self.mock_llm_instance = MagicMock()
        mock_llm_class.return_value = self.mock_llm_instance
        
        # Setup application
        self.app = VoiceAssistantApp()
        
        # Explicitly mock out the chain invoke to prevent actual API calls during test
        self.app.chain = MagicMock()
    
    def test_initialization(self):
        """Test if the VoiceAssistantApp initializes correctly."""
        self.assertEqual(self.app.wake_word, "CHATBOT")
        self.assertIsNotNone(self.app.recognizer)
        self.mock_tts_engine.setProperty.assert_called_with('rate', 150)
        
    def test_speak(self):
        """Test that the speak function interacts correctly with pyttsx3."""
        self.app.speak("Testing voice")
        self.mock_tts_engine.say.assert_called_with("Testing voice")
        self.mock_tts_engine.runAndWait.assert_called_once()
        
    def test_process_conversation_success(self):
        """Test the process_conversation method properly invoking the chain and speaking the result."""
        # Setup mock response
        mock_response = MagicMock()
        mock_response.content = "This is a test response without markdown."
        self.app.chain.invoke.return_value = mock_response
        
        # Run
        self.app.process_conversation("What is the speed limit?")
        
        # Assertions
        self.app.chain.invoke.assert_called_once_with({"user_input": "What is the speed limit?"})
        self.mock_tts_engine.say.assert_called_with("This is a test response without markdown.")
        
    def test_process_conversation_error(self):
        """Test process_conversation handles errors robustly."""
        # Setup mock to raise an exception
        self.app.chain.invoke.side_effect = Exception("API Timeout")
        
        # Run
        self.app.process_conversation("Hello?")
        
        # Assertions - it should catch the error and output a safe fallback phrase
        self.mock_tts_engine.say.assert_called_with("I experienced an error connecting to my brain. Please try again.")

if __name__ == '__main__':
    unittest.main()
