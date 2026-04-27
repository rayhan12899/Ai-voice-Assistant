import { GoogleGenAI, Type } from "@google/genai";

const getAI = (customKey?: string) => {
  const apiKey = customKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined. Please configure it in your secrets or enter it manually.");
  }
  return new GoogleGenAI({ apiKey });
};

// Use flash-preview for general fast transcription/multimodal tasks
const MODEL = "gemini-3-flash-preview";

export async function refineTextToAI(text: string, mode: 'Refine' | 'AI Prompt', promptType: string = 'ChatGPT', customKey?: string): Promise<string> {
  if (!text.trim()) return "";
  const ai = getAI(customKey);
  
  let systemInstruction = "";
  if (mode === 'Refine') {
    systemInstruction = "You are a professional editor. Remove filler words (like 'um', 'uh', 'mane', 'er', 'এ', 'ও', 'আর'), stutters, and fix grammatical errors from the text while preserving the original meaning. Keep the language exactly as provided (Bangla or English or mixed). Return ONLY the clean, refined text.";
  } else {
    systemInstruction = `You are an expert prompt engineer. Convert the user's input into a highly detailed, extremely effective prompt tailored for ${promptType}. Respond in English unless the user's prompt specifically needs to be in Bangla. Return ONLY the final ready-to-use prompt without preamble.`;
  }
  
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: text,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });
    return response.text?.trim() || "";
  } catch (err: any) {
    console.error("Gemini Error:", err);
    throw new Error(err.message || "Failed to process text.");
  }
}

export async function transcribeAudio(base64Data: string, mimeType: string, langHint: string = "English or Bangla", customKey?: string): Promise<string> {
  const ai = getAI(customKey);
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: {
        parts: [
           { inlineData: { data: base64Data, mimeType } },
           { text: `Listen carefully. Transcribe this audio exactly as it is spoken. The primary language is likely ${langHint}, but it could be a mix of English and Bangla. Only return the final transcript text without any extra narrative, markdown, or greetings.` }
        ]
      }
    });
    return response.text?.trim() || "";
  } catch (err: any) {
    console.error("Transcription Error:", err);
    throw new Error("Failed to transcribe audio. Ensure it is a valid supported format and not too large.");
  }
}

export async function translateWithVocab(text: string, targetLang: 'Bangla' | 'English', customKey?: string) {
  if (!text.trim()) return { translation: "", vocabulary: [] };
  const ai = getAI(customKey);
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Translate the following text into ${targetLang}. Also extract up to 6 important words or phrases as vocabulary with their meanings in ${targetLang}. Text: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translation: { type: Type.STRING, description: "The translated text" },
            vocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  meaning: { type: Type.STRING }
                }
              }
            }
          },
          required: ["translation", "vocabulary"]
        }
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    return {
      translation: parsed.translation || "",
      vocabulary: parsed.vocabulary || []
    };
  } catch (err: any) {
    console.error("Translation Error:", err);
    throw new Error("Failed to translate text.");
  }
}
