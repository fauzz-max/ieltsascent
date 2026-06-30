import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Инициализируем клиент Google Gen AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/evaluate', async (req, res) => {
  try {
    const { taskPrompt, essay } = req.body;

    if (!taskPrompt || !essay) {
      return res.status(400).json({ error: "Missing taskPrompt or essay in request body." });
    }

    // Подсчет слов на стороне сервера
    const wordCount = essay.trim() === "" ? 0 : essay.trim().split(/\s+/).length;

    const systemInstruction = `
      You are an expert IELTS Writing examiner. Your task is to evaluate the provided IELTS Writing Task 2 essay accurately and strictly according to the official IELTS rubrics.
      
      The user's essay contains exactly ${wordCount} words. Do not attempt to recount the words yourself, rely on this number.
      If the word count is under 250 words, apply the appropriate penalty to the Task Achievement score as per official IELTS guidelines.

      Provide your output strictly in JSON format matching the requested schema. Ensure the feedback is constructive, professional, and specific.
    `;

    // Запрос к ИИ с использованием актуальной модели gemini-2.5-flash
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: `
        Task Prompt: "${taskPrompt}"
        Candidate's Essay: "${essay}"
      `,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2, 
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { 
              type: Type.STRING, 
              description: "The calculated overall band score (e.g., '6.5', '7.0')." 
            },
            summary: { 
              type: Type.STRING, 
              description: "A concise executive summary of the essay's strengths and weaknesses." 
            },
            criteria: {
              type: Type.ARRAY,
              description: "Breakdown of the 4 official IELTS criteria.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Criterion name." },
                  score: { type: Type.STRING, description: "Band score for this specific criterion." },
                  feedback: { type: Type.STRING, description: "Detailed justification for this score." }
                },
                required: ["name", "score", "feedback"]
              }
            },
            improvements: {
              type: Type.ARRAY,
              description: "3-4 actionable bullet points for the student to increase their score.",
              items: { type: Type.STRING }
            }
          },
          required: ["overallScore", "summary", "criteria", "improvements"]
        }
      }
    });

    const resultJson = JSON.parse(response.text);
    res.json(resultJson);

  } catch (error) {
    console.error("Evaluation Error:", error);
    
    // Красивый перехват временной перегрузки серверов Google
    if (error.message && error.message.includes("high demand")) {
      return res.status(503).json({ error: "AI servers are busy right now. Please try again in 1 minute." });
    }

    res.status(500).json({ error: "Internal server error during essay evaluation." });
  }
});

// Отдаем фронтенд на любые другие запросы
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

export default app;