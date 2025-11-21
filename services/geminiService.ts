
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ChunkAnalysis, AppSettings } from "../types";

// --- PROMPTS ---

export const SYSTEM_INSTRUCTION_ANALYSIS = `
You are a literary analysis engine. Your job is to analyze segments of a novel.
IMPORTANT: Output ALL content in Simplified Chinese (简体中文).
1. Summarize the plot.
2. Identify key characters.
3. Extract relationships between characters EXPLICITLY mentioned or implied in this segment (Subject -> Relation -> Object).
4. Determine sentiment.
`;

const JSON_SCHEMA_STR = `
{
  "summary": "string",
  "sentimentScore": "number",
  "keyCharacters": [{ "name": "string", "role": "string", "traits": ["string"] }],
  "relationships": [{ "source": "string (Name A)", "target": "string (Name B)", "relation": "string (e.g. enemy)" }],
  "plotPoints": ["string"]
}
`;

// --- HELPER: GEMINI IMPLEMENTATION ---

const analyzeWithGemini = async (text: string, previousContext: string, modelName: string, systemInstruction: string): Promise<ChunkAnalysis> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }
  
  const ai = new GoogleGenAI({ apiKey: apiKey });

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING, description: "本段落的剧情简介 (简体中文)" },
      sentimentScore: { type: Type.NUMBER, description: "A float between -1 and 1 representing the mood." },
      keyCharacters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "角色名字" },
            role: { type: Type.STRING, description: "在该片段中的角色作用 (简体中文)" },
            traits: { type: Type.ARRAY, items: { type: Type.STRING, description: "性格特征 (简体中文)" } }
          },
          required: ["name", "role", "traits"] 
        }
      },
      relationships: {
        type: Type.ARRAY,
        description: "Relationships identified in this text segment. Keep names consistent with previous context if possible.",
        items: {
            type: Type.OBJECT,
            properties: {
                source: { type: Type.STRING, description: "Character Name A" },
                target: { type: Type.STRING, description: "Character Name B" },
                relation: { type: Type.STRING, description: "Relationship description (e.g. friend, enemy, loves)" }
            },
            required: ["source", "target", "relation"]
        }
      },
      plotPoints: {
        type: Type.ARRAY,
        items: { type: Type.STRING, description: "关键剧情点 (简体中文)" }
      }
    },
    required: ["summary", "sentimentScore", "keyCharacters", "plotPoints", "relationships"]
  };

  // Construct Prompt with Memory
  const promptText = previousContext 
    ? `PREVIOUS STORY CONTEXT (Use this to understand who characters are, but ONLY analyze the NEW TEXT):\n${previousContext}\n\nNEW TEXT TO ANALYZE:\n${text}`
    : `TEXT TO ANALYZE:\n${text}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: promptText }
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.3,
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error("No response text received from Gemini");
    return JSON.parse(resultText) as ChunkAnalysis;
  } catch (e: any) {
    console.error("Gemini Analysis Error Details:", e);
    throw new Error(`Gemini Analysis Failed: ${e.message || 'Unknown error'}`);
  }
};

const chatWithGemini = async (context: string, prompt: string, modelName: string): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return "请在设置中连接您的 Google 账户以使用聊天功能。";

  const ai = new GoogleGenAI({ apiKey: apiKey });
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: context },
          { text: prompt }
        ]
      }
    });
    return response.text || "无回复。";
  } catch (e) {
    console.error("Chat Error:", e);
    return "抱歉，处理您的请求时遇到错误，请重试。";
  }
};

// --- HELPER: OPENAI COMPATIBLE IMPLEMENTATION ---

const analyzeWithOpenAI = async (text: string, previousContext: string, settings: AppSettings, systemInstruction: string): Promise<ChunkAnalysis> => {
  if (!settings.openaiApiKey) throw new Error("OpenAI API Key is missing");

  const finalPrompt = previousContext 
  ? `PREVIOUS CONTEXT:\n${previousContext}\n\nANALYZE THIS TEXT:\n${text}`
  : `ANALYZE THIS TEXT:\n${text}`;

  const messages = [
    { role: "system", content: systemInstruction + `\nOutput must be valid JSON matching this structure: ${JSON_SCHEMA_STR}` },
    { role: "user", content: finalPrompt }
  ];

  const baseUrl = settings.openaiBaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify({
      model: settings.openaiModelName,
      messages: messages,
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API Error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) throw new Error("Empty response from OpenAI");

  try {
    return JSON.parse(content) as ChunkAnalysis;
  } catch (e) {
    throw new Error("Failed to parse JSON from OpenAI response");
  }
};

const chatWithOpenAI = async (context: string, question: string, settings: AppSettings): Promise<string> => {
  if (!settings.openaiApiKey) throw new Error("OpenAI API Key is missing");

  const messages = [
    { role: "system", content: "You are a helpful literary assistant. Answer in Simplified Chinese (简体中文). Answer based on the context provided." },
    { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${question}` }
  ];

  const baseUrl = settings.openaiBaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify({
      model: settings.openaiModelName,
      messages: messages,
      temperature: 0.7
    })
  });

  if (!res.ok) throw new Error(`OpenAI API Error: ${res.status}`);

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "无回复。";
};

// --- EXPORTED FUNCTIONS ---

export const analyzeChunkText = async (text: string, settings: AppSettings, previousSummary: string = ""): Promise<ChunkAnalysis> => {
  // Use custom prompt if available, otherwise use default
  const systemInstruction = settings.customPrompt || SYSTEM_INSTRUCTION_ANALYSIS;

  try {
    if (settings.provider === 'openai') {
      return await analyzeWithOpenAI(text, previousSummary, settings, systemInstruction);
    } else {
      try {
        return await analyzeWithGemini(text, previousSummary, settings.geminiModelName, systemInstruction);
      } catch (e) {
        console.warn("First attempt failed, retrying...", e);
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        return await analyzeWithGemini(text, previousSummary, settings.geminiModelName, systemInstruction);
      }
    }
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

export const askQuestionAboutContext = async (
  question: string, 
  currentChunkText: string, 
  settings: AppSettings,
  previousSummary?: string
): Promise<string> => {
  
  const context = `
    ${previousSummary ? `PREVIOUS CONTEXT SUMMARY:\n${previousSummary}\n\n` : ''}
    CURRENT TEXT SEGMENT:\n${currentChunkText}
  `;

  try {
    if (settings.provider === 'openai') {
      return await chatWithOpenAI(context, question, settings);
    } else {
      const prompt = `Answer the user's question based ONLY on the provided text context. Answer in Simplified Chinese (简体中文). Question: ${question}`;
      return await chatWithGemini(context, prompt, settings.geminiModelName);
    }
  } catch (error) {
    console.error("Q&A failed:", error);
    return "抱歉，处理您的问题时遇到错误。";
  }
};