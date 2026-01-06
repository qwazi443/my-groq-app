// api/chat.js
import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message } = req.body;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: message }],
            model: "llama-3.3-70b-versatile",        });

        res.status(200).json({ reply: chatCompletion.choices[0]?.message?.content || "" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error processing request' });
    }
}