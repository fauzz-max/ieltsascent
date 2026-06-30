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

    const systemInstruction = `
      You are an official, strict, and highly critical IELTS Writing examiner. 
      Your task is to evaluate the provided IELTS Writing Task 2 essay strictly according to the official public band descriptors.
      
      CRITICAL EVALUATION RULES:
      1. DO NOT be overly generous. Be completely realistic.
      2. Evaluate each of the 4 criteria independently.
      3. For all scores, use official IELTS formats (e.g., 5.0, 5.5, 6.0, 6.5, 7.0). 
      4. The essay has exactly ${wordCount} words. If it is under 250 words, apply a penalty to the Task Achievement score.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: `
        Task Prompt: "${taskPrompt}"
        Candidate's Essay: "${essay}"
      `,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1, 
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { 
              type: Type.STRING, 
              description: "Temporary placeholder for overall score." 
            },
            summary: { 
              type: Type.STRING, 
              description: "A constructive summary of the essay's real performance." 
            },
            criteria: {
              type: Type.ARRAY,
              description: "Independent breakdown of the four official IELTS criteria.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Official IELTS criterion name." },
                  score: { type: Type.STRING, description: "The strict band score assigned to this specific criterion." },
                  feedback: { type: Type.STRING, description: "Specific reasons justifying this exact score." }
                },
                required: ["name", "score", "feedback"]
              }
            },
            improvements: {
              type: Type.ARRAY,
              description: "3-4 highly specific steps to fix the errors noticed.",
              items: { type: Type.STRING }
            }
          },
          required: ["overallScore", "summary", "criteria", "improvements"]
        }
      }
    });

  
    const resultJson = JSON.parse(response.text);

   
    if (resultJson.criteria && Array.isArray(resultJson.criteria)) {
    
      const scores = resultJson.criteria
        .map(c => parseFloat(c.score))
        .filter(s => !isNaN(s));

      if (scores.length === 4) {
        const sum = scores.reduce((a, b) => a + b, 0);
        const avg = sum / 4; 
        
        const intPart = Math.floor(avg); 
        const fraction = avg - intPart;  

        let officialOverall;

        if (fraction < 0.25) {
          officialOverall = intPart;        
        } else if (fraction < 0.75) {
          officialOverall = intPart + 0.5;  
        } else {
          officialOverall = Math.ceil(avg); 
        }


        resultJson.overallScore = officialOverall.toFixed(1);
      }
    }


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