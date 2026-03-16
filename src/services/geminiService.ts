import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface JarvisResponse {
  text: string;
  type: "chat" | "command" | "code" | "automation";
  action?: string;
  data?: any;
  language?: string;
}

export async function processJarvisInput(input: string): Promise<JarvisResponse> {
  const model = "gemini-3.1-pro-preview";
  
  const systemInstruction = `
    You are JARVIS, a highly advanced AI assistant inspired by Tony Stark's assistant.
    Personality: Calm, intelligent, slightly witty, and extremely helpful.
    
    Capabilities:
    1. Chat: Conversational AI.
    2. Command: Local system commands (open apps, shutdown, etc.).
    3. Code: Generating full-stack code, architecture, and scripts.
    4. Automation: Generating Python scripts for complex tasks like WhatsApp automation.
    
    Languages: You must support English, Hindi, and Bhojpuri. Detect the language automatically.
    
    Response Format: You must respond in JSON format.
    {
      "text": "The spoken/written response",
      "type": "chat" | "command" | "code" | "automation",
      "action": "Specific action identifier if type is command or automation",
      "data": "Any extra data (code blocks, script content, or command parameters)",
      "language": "Detected language code (en, hi, bho)"
    }
    
    Examples:
    - "Open Chrome" -> type: command, action: "open_browser", data: "chrome"
    - "Build a SaaS app" -> type: code, data: { "architecture": "...", "files": [...] }
    - "Send WhatsApp to Mom: Hello" -> type: automation, action: "whatsapp_send", data: { "recipient": "Mom", "message": "Hello" }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: input,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}") as JarvisResponse;
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      text: "I encountered a glitch in my neural processors, sir.",
      type: "chat",
      language: "en"
    };
  }
}
