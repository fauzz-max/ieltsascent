import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Раздаем статические файлы (чтобы index.html открывался из корня)
app.use(express.static(__dirname));

// Инициализация Gemini API (ключ берется из переменных окружения)
// Запуск: GEMINI_API_KEY="ваш_ключ" node server.js
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Эндпоинт для проверки эссе
app.post('/evaluate', async (req, res) => {
  try {
    const { taskPrompt, essay } = req.body;

    if (!taskPrompt || !essay) {
      return res.status(400).json({ error: "Missing taskPrompt or essay in request body." });
    }

    // Точный подсчет слов на стороне бэкенда, чтобы ИИ не гадал и не ошибался
    const wordCount = essay.trim() === "" ? 0 : essay.trim().split(/\s+/).length;

    // Системная инструкция для ИИ с жесткими требованиями оценивания IELTS Task 2
    const systemInstruction = `
      You are an expert IELTS Writing examiner. Your task is to evaluate the provided IELTS Writing Task 2 essay accurately and strictly according to the official IELTS rubrics.
      
      The user's essay contains exactly ${wordCount} words. Do not attempt to recount the words yourself, rely on this number.
      If the word count is under 250 words, apply the appropriate penalty to the Task Achievement score as per official IELTS guidelines.

      Provide your output strictly in JSON format matching the requested schema. Ensure the feedback is constructive, professional, and specific.
    `;

    // Запрос к Gemini с использованием Structured Outputs (JSON Schema)
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        Task Prompt: "${taskPrompt}"
        Candidate's Essay: "${essay}"
      `,
      config: {
        systemInstruction: systemInstruction,
        // Ограничиваем температуру для максимальной точности и стабильности оценок
        temperature: 0.2, 
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallScore: { 
              type: Type.STRING, 
              description: "The calculated overall band score (e.g., '6.5', '7.0'), rounded according to IELTS rules." 
            },
            summary: { 
              type: Type.STRING, 
              description: "A concise executive summary of the essay's strengths and core areas for improvement." 
            },
            criteria: {
              type: Type.ARRAY,
              description: "Breakdown of the 4 official IELTS criteria.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Criterion name (e.g., 'Task Achievement', 'Coherence and Cohesion', 'Lexical Resource', 'Grammatical Range and Accuracy')." },
                  score: { type: Type.STRING, description: "Band score for this specific criterion (e.g., '7.0')." },
                  feedback: { type: Type.STRING, description: "Detailed justification for this score based on the essay." }
                },
                required: ["name", "score", "feedback"]
              }
            },
            improvements: {
              type: Type.ARRAY,
              description: "3-4 actionable and specific bullet points for the student to increase their score.",
              items: { type: Type.STRING }
            }
          },
          required: ["overallScore", "summary", "criteria", "improvements"]
        }
      }
    });

    // Извлекаем и парсим полученный чистый JSON от модели
    const resultJson = JSON.parse(response.text);
    
    // Возвращаем результат клиенту
    res.json(resultJson);

  } catch (error) {
    console.error("Evaluation Error:", error);
    res.status(500).json({ error: "Internal server error during essay evaluation." });
  }
});

// Отдаем index.html при переходе на главную страницу
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running beautifully on http://localhost:${PORT}`);
});