
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ChunkAnalysis, AppSettings, ChapterOutline } from "../types";
import { splitTextIntoChapters } from "../utils/textProcessing";

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

// --- HELPER: ROBUST JSON PARSER ---

const safeParseJSONArray = (str: string): any[] => {
  if (!str) return [];
  // Remove markdown code blocks if present
  let clean = str.replace(/```json/g, '').replace(/```/g, '').trim();
  
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.warn("JSON parse failed, attempting repair for array...");
    const start = clean.indexOf('[');
    if (start === -1) return [];
    const lastObjEnd = clean.lastIndexOf('}');
    if (lastObjEnd === -1) return [];
    const repaired = clean.slice(start, lastObjEnd + 1) + ']';
    try {
        const parsed = JSON.parse(repaired);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e2) {
        console.error("JSON repair failed", e2);
        return [];
    }
  }
};

// --- HELPER: RETRY LOGIC ---

const retryWithBackoff = async <T>(
  fn: () => Promise<T>, 
  retries: number = 5, 
  delay: number = 2000
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const errStr = JSON.stringify(error, Object.getOwnPropertyNames(error)).toLowerCase();
    const msg = (error.message || "").toLowerCase();
    
    const isRetriable = 
        msg.includes("xhr error") || 
        msg.includes("network") || 
        msg.includes("fetch failed") || 
        msg.includes("500") || 
        msg.includes("503") || 
        msg.includes("overloaded") ||
        errStr.includes("error code: 6") ||
        errStr.includes("rpc failed");

    if (retries > 0 && isRetriable) {
      console.warn(`Request failed (Attempt ${6 - retries}). Retrying in ${delay}ms... Error: ${msg}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

// --- HELPER: GEMINI IMPLEMENTATION ---

const analyzeWithGemini = async (text: string, previousContext: string, modelName: string, systemInstruction: string, maxOutputTokens?: number): Promise<ChunkAnalysis> => {
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

  const promptText = previousContext 
    ? `PREVIOUS STORY CONTEXT (Use this to understand who characters are, but ONLY analyze the NEW TEXT):\n${previousContext}\n\nNEW TEXT TO ANALYZE:\n${text}`
    : `TEXT TO ANALYZE:\n${text}`;

  console.log(`[Gemini Request] Analyzing chunk with model ${modelName}. Token Limit: ${maxOutputTokens || 8192}. Length: ${text.length} chars.`);

  try {
    const response = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
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
                maxOutputTokens: maxOutputTokens || 8192,
            }
        });
    }, 5, 2000); 

    const resultText = response.text;
    if (!resultText) throw new Error("No response text received from Gemini");
    
    return JSON.parse(resultText) as ChunkAnalysis;
  } catch (e: any) {
    console.error("Gemini Analysis Error Details:", JSON.stringify(e));
    throw new Error(`Gemini Analysis Failed: ${e.message || 'Unknown error'}`);
  }
};

const chatWithGemini = async (context: string, prompt: string, modelName: string): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return "请在设置中连接您的 Google 账户以使用聊天功能。";

  const ai = new GoogleGenAI({ apiKey: apiKey });
  try {
    const response = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                { text: context },
                { text: prompt }
                ]
            }
        });
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

  const callOpenAI = async () => {
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
        max_tokens: settings.maxOutputTokens || 16384,
        response_format: { type: "json_object" }
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API Error: ${res.status} - ${err}`);
    }
    return res.json();
  };

  try {
      const data = await retryWithBackoff(callOpenAI);
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from OpenAI");
      return JSON.parse(content) as ChunkAnalysis;
  } catch (e) {
      console.error("OpenAI Analysis Failed", e);
      throw e;
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

  const callOpenAI = async () => {
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
    return res.json();
  }

  try {
    const data = await retryWithBackoff(callOpenAI);
    return data.choices?.[0]?.message?.content || "无回复。";
  } catch (e) {
      return "OpenAI Chat Error";
  }
};

// --- HELPER: CHAPTER BREAKDOWN IMPLEMENTATION ---

const summarizeSingleChapterGemini = async (title: string, text: string, settings: AppSettings): Promise<ChapterOutline> => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key is missing.");
    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    const systemInstruction = `You are a novel editor. Summarize the provided chapter in Simplified Chinese.
    Chapter Title: ${title}
    Output JSON: { "title": "${title}", "summary": "string" }`;

    const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING, description: "Detailed summary" }
        },
        required: ["title", "summary"]
    };

    const response = await retryWithBackoff(async () => {
        return await ai.models.generateContent({
            model: settings.geminiModelName,
            contents: { parts: [{ text }] },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                maxOutputTokens: 4096 
            }
        });
    });
    
    const json = JSON.parse(response.text || "{}");
    return { title: title, summary: json.summary || "Summary failed." };
};

const generateChapterOutlinesGemini = async (text: string, settings: AppSettings): Promise<ChapterOutline[]> => {
  // 1. Use Regex to split content into chapters locally.
  const chapters = splitTextIntoChapters(text);
  
  console.log(`[Gemini Outline] Found ${chapters.length} chapters in chunk via regex.`);

  // If multiple chapters found, summarize them individually
  if (chapters.length > 0) {
      const results: ChapterOutline[] = [];
      // Process in batches of 3 to allow some concurrency but respect limits
      for (let i = 0; i < chapters.length; i += 3) {
          const batch = chapters.slice(i, i + 3);
          try {
            const batchResults = await Promise.all(batch.map(ch => 
                summarizeSingleChapterGemini(ch.title, ch.content, settings).catch(e => ({
                    title: ch.title,
                    summary: `Error summarizing: ${e.message}`
                }))
            ));
            results.push(...batchResults);
          } catch (e) {
            console.error("Batch summary failed", e);
          }
      }
      return results;
  }

  // Fallback: If no specific chapters found (e.g. just text), treat as one block
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  const systemInstruction = `You are a novel editor. 
  Analyze the provided text segment.
  1. Identify any implied chapters or just summarize the segment if no header exists.
  2. Output in Simplified Chinese.`;

  const responseSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Chapter title" },
        summary: { type: Type.STRING, description: "Detailed summary" }
      },
      required: ["title", "summary"]
    }
  };

  const response = await retryWithBackoff(async () => {
    return await ai.models.generateContent({
        model: settings.geminiModelName,
        contents: { parts: [{ text }] },
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            maxOutputTokens: settings.maxOutputTokens || 16384 
        }
    });
  });

  return safeParseJSONArray(response.text || "");
};

export const analyzeChunkText = async (text: string, settings: AppSettings, previousSummary: string = ""): Promise<ChunkAnalysis> => {
  const systemInstruction = settings.customPrompt || SYSTEM_INSTRUCTION_ANALYSIS;
  try {
    if (settings.provider === 'openai') {
      return await analyzeWithOpenAI(text, previousSummary, settings, systemInstruction);
    } else {
      return await analyzeWithGemini(text, previousSummary, settings.geminiModelName, systemInstruction, settings.maxOutputTokens);
    }
  } catch (error) {
    console.error("Analysis failed final:", error);
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
    return "抱歉，处理您的问题时遇到错误。";
  }
};

export const generateChapterOutlines = async (text: string, settings: AppSettings): Promise<ChapterOutline[]> => {
  try {
    if (settings.provider === 'openai') {
       return await generateChapterOutlinesGemini(text, settings); 
    } else {
       return await generateChapterOutlinesGemini(text, settings);
    }
  } catch (e) {
    console.error("Chapter Breakdown Failed", e);
    throw e;
  }
};
