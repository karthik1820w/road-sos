import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabaseConfigured = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
const supabase = supabaseConfigured
  ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!)
  : null;

let _ai: GoogleGenAI | null = null;
const getAI = () => {
  if (!_ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set.");
    }
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
};

export async function retrieveContext(query: string, domain?: string, k = 5) {
  try {
    const ai = getAI();
    const embedRes = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: query,
    });
    const embedding = embedRes.embeddings?.[0]?.values;
    if (!embedding || !supabase) return [];

    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: k,
      filter_domain: domain || null
    });
    
    if (error) {
      console.error("[RAG] Supabase match error:", error);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error("[RAG] Embedding error:", e);
    return [];
  }
}
