/** Gemini's prebuilt voices that are women's voices, for Jarvis (api/jarvis/say); the first is the default. */
export const JARVIS_VOICES = ["Despina", "Sulafat", "Kore", "Aoede", "Leda", "Achernar"] as const;
export type JarvisVoice = (typeof JARVIS_VOICES)[number];
