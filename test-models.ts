import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
process.env.GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  apiKey: process.env.GEMINI_API_KEY,
  temperature: 0.3,
});
model.invoke("hi").then(() => console.log('langchain OK')).catch(e => console.log('langchain ERR', e.message));
