// api/generate.js
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  // 1. Handle CORS (Optional but good for safety)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, instruments, key, scale, bpm } = req.body;

    const systemPrompt = `
      You are a Hard House MIDI generator. Respond ONLY with a JSON object.
      SCHEMA: { "data": [{ "instId": "string", "pitch": "string", "step": number, "duration": "string", "velocity": number }] }
      
      CONSTRAINTS:
      - instId must be from: ${instruments.join(", ")}
      - step is 0-15 (for a 16-step loop)
      - pitch must be in ${key} ${scale} (e.g., C2 for kick, F3 for bass)
      - duration is "1" (short) to "4" (long)
    `;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content received from AI");
    }

    const aiData = JSON.parse(content);
    return res.status(200).json(aiData);

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}