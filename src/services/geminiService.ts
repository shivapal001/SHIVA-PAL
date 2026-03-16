import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface JarvisResponse {
  text: string;
  type: "chat" | "command" | "code" | "automation" | "system";
  action?: string;
  data?: any;
  language?: string;
}

export async function processJarvisInput(input: string): Promise<JarvisResponse> {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are JARVIS, a highly advanced AI assistant inspired by Tony Stark's assistant.
    Personality: Calm, intelligent, slightly witty, and extremely helpful.
    
    Capabilities:
    1. Chat: Conversational AI.
    2. Command: Local system commands (open apps, shutdown, etc.).
    3. Code: Generating full-stack code, architecture, and scripts.
    4. Automation: Generating Python scripts for complex tasks like WhatsApp automation.
    5. System: PC access, hardware control, and media playback (Spotify).
    
    Languages: You must support English, Hindi, and Bhojpuri. Detect the language automatically.
    
    Response Format: You must respond in JSON format.
    {
      "text": "The spoken/written response",
      "type": "chat" | "command" | "code" | "automation" | "system",
      "action": "Specific action identifier if type is command, automation, or system",
      "data": "Any extra data (code blocks, script content, or command parameters)",
      "language": "Detected language code (en, hi, bho)"
    }
    
    Examples:
    - "Open Chrome" -> type: system, action: "open_browser", data: "chrome"
    - "Spotify pe Arijit Singh ke gaane chalao" -> type: system, action: "spotify_play", data: "Arijit Singh"
    - "Play Starboy on Spotify" -> type: system, action: "spotify_play", data: "Starboy"
    - "Shutdown PC" -> type: system, action: "shutdown", data: null
    - "Build a SaaS app" -> type: code, data: { "architecture": "...", "files": [...] }
    - "Send WhatsApp to Mom: Hello" -> type: automation, action: "whatsapp_send", data: { "recipient": "Mom", "message": "Hello" }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: input }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    // Clean JSON if needed (though responseMimeType should handle it)
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanJson) as JarvisResponse;
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      text: "I encountered a glitch in my neural processors, sir. Please check the console for details.",
      type: "chat",
      language: "en"
    };
  }
}
