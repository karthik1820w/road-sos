import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const TRAINED_QA = [
  { q: "What should you do first after witnessing a road accident?", a: "Ensure your own safety, move to a safe location, and call emergency services immediately." },
  { q: "What should you do if a biker is unconscious after a crash?", a: "Check breathing and pulse without moving the neck or spine unnecessarily." },
  { q: "What is the first aid for severe bleeding in a road accident?", a: "Apply firm pressure on the wound using a clean cloth or bandage to stop bleeding." },
  { q: "What should you do if a car accident victim is trapped inside the vehicle?", a: "Do not pull them out unless there is fire or immediate danger. Call emergency responders." },
  { q: "What is the first aid for fractures after a bike accident?", a: "Keep the injured limb still and support it using a splint or cloth." },
  { q: "What should you do if someone is bleeding from the head after an accident?", a: "Apply gentle pressure with a clean cloth unless a skull fracture is suspected." },
  { q: "What is the first aid for road rash injuries?", a: "Wash the wound gently with clean water and cover it with a sterile dressing." },
  { q: "What should you do if a victim is not breathing after a road accident?", a: "Begin CPR immediately and continue until medical help arrives." },
  { q: "What is the first aid for burns caused by vehicle fires?", a: "Cool the burn under running water for at least 10 minutes and cover it loosely." },
  { q: "What should you do if someone has neck pain after a collision?", a: "Keep the person still and avoid moving the head or neck." },
  { q: "What is the first aid for shock after a road accident?", a: "Lay the person down, keep them warm, and reassure them until help arrives." },
  { q: "What should you do if a victim has chest pain after a crash?", a: "Keep them calm and seek emergency medical help immediately." },
  { q: "What is the first aid for a broken leg after a vehicle accident?", a: "Immobilize the leg and avoid unnecessary movement." },
  { q: "What should you do if fuel is leaking from a crashed vehicle?", a: "Move everyone away from the vehicle and avoid sparks or flames." },
  { q: "What is the first aid for eye injuries caused by shattered glass?", a: "Do not rub the eye and seek immediate medical attention." },
  { q: "What should you do if a person faints after a road accident?", a: "Lay them flat on their back and raise their legs slightly." },
  { q: "What is the first aid for a spinal injury in a road accident?", a: "Keep the victim completely still and wait for trained medical personnel." },
  { q: "What should you do if a helmeted biker is unconscious?", a: "Do not remove the helmet unless necessary for CPR or breathing support." },
  { q: "What is the first aid for deep cuts caused by metal or glass?", a: "Apply pressure to stop bleeding and cover the wound with a clean dressing." },
  { q: "What should you do if someone is having difficulty breathing after a crash?", a: "Help them sit upright and loosen tight clothing while waiting for help." },
  { q: "What is the first aid for swelling after a bike accident?", a: "Apply a cold pack wrapped in cloth to reduce swelling." },
  { q: "What should you do if a victim is vomiting after a head injury?", a: "Turn them carefully onto their side while keeping the neck supported." },
  { q: "What is the first aid for unconscious accident victims who are breathing?", a: "Place them in the recovery position while monitoring breathing." },
  { q: "What should you do if someone has glass embedded in a wound?", a: "Do not remove large glass pieces and seek medical help immediately." },
  { q: "What is the first aid for a dislocated shoulder after a crash?", a: "Keep the arm still using a sling and avoid forcing it back into place." },
  { q: "What should you do if a road accident victim is panicking?", a: "Speak calmly, reassure them, and encourage slow breathing." },
  { q: "What is the first aid for internal bleeding suspicion after an accident?", a: "Lay the person down, keep them still, and seek emergency medical care immediately." },
  { q: "What should you do if a pedestrian is hit by a vehicle?", a: "Call emergency services and avoid moving them unless there is danger." },
  { q: "What is the first aid for hand injuries caused by road accidents?", a: "Clean minor wounds and bandage them while keeping the hand elevated." },
  { q: "What should you do if an accident victim stops responding during transport?", a: "Stop safely, check breathing and pulse, and begin CPR if necessary." }
];

async function generateEmbedding(text: string) {
  const response = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: text,
  });
  return response.embeddings?.[0]?.values;
}

async function run() {
  console.log("Seeding knowledge chunks...");
  for (const item of TRAINED_QA) {
    const content = `Q: ${item.q}\nA: ${item.a}`;
    const embedding = await generateEmbedding(content);
    if (embedding) {
      const { error } = await supabase.from('knowledge_chunks').insert({
        domain: 'medical',
        content,
        embedding,
        source: 'Trained QA Dataset'
      });
      if (error) console.error("Error inserting:", error.message);
    }
  }
  console.log("Done.");
}

run();
