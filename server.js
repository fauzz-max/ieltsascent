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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/evaluate', async (req, res) => {
  try {
    const { taskPrompt, essay } = req.body;

    if (!taskPrompt || !essay) {
      return res.status(400).json({ error: "Missing taskPrompt or essay." });
    }

    const wordCount = essay.trim() === "" ? 0 : essay.trim().split(/\s+/).length;

    // Крутой и строгий промпт для точной калибровки оценок
    const systemInstruction = `
      You are an official, strict, and highly critical IELTS Writing examiner. 
      Your task is to evaluate the provided IELTS Writing Task 2 essay strictly according to the official public band descriptors.
      
      CRITICAL EVALUATION RULES:
      1. DO NOT be overly generous or nice. Be completely realistic. If an essay is a 5.5, grade it strictly as a 5.5.
      2. Evaluate each of the 4 criteria independently. It is highly unusual for an essay to get the exact same score across all 4 criteria unless the performance is completely identical.
      3. For all scores, use official IELTS formats (e.g., 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0). 
      4. The essay has exactly ${wordCount} words. If it is under 250 words, apply a heavy penalty to the Task Achievement score according to official guidelines.
      5. Base your feedback on grammatical accuracy, sentence variety, vocabulary precision, and logical progression.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: `
        Task Prompt: "${taskPrompt}"
        Candidate's Essay: "${essay}"
      `,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1, // Снизили до 0.1 для максимальной точности и исключения фантазий
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { 
              type: Type.STRING, 
              description: "The final calculated official IELTS overall band score (e.g., a single value like 5.5 or 6.0 based on standard IELTS averaging rules)." 
            },
            summary: { 
              type: Type.STRING, 
              description: "A brutally honest and constructive summary of the essay's real performance." 
            },
            criteria: {
              type: Type.ARRAY,
              description: "Independent breakdown of the four official IELTS criteria.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Official IELTS criterion name." },
                  score: { type: Type.STRING, description: "The strict band score assigned to this specific criterion." },
                  feedback: { type: Type.STRING, description: "Specific reasons, flaws, or strengths that justify this exact score." }
                },
                required: ["name", "score", "feedback"]
              }
            },
            improvements: {
              type: Type.ARRAY,
              description: "3-4 highly specific, actionable steps to fix the errors noticed in this essay.",
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
    if (error.message && error.message.includes("high demand")) {
      return res.status(503).json({ error: "AI servers are busy right now. Please try again in 1 minute." });
    }
    res.status(500).json({ error: "Internal server error during essay evaluation." });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

export default app;