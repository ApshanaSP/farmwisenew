/** v6 bake-off step 1: which models the existing free Groq and Gemini keys can see (ids only; keys are read from .env and never printed). */
process.loadEnvFile(".env");
const g = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } });
const gj = await g.json();
console.log("groq", g.status, (gj.data ?? []).map((m) => `${m.id}${m.context_window ? `(${m.context_window})` : ""}${m.active === false ? "[inactive]" : ""}`).sort().join(" "));
const m = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" } });
const mj = await m.json();
console.log("gemini", m.status, (mj.models ?? []).filter((x) => (x.supportedGenerationMethods ?? []).includes("generateContent")).map((x) => x.name.replace("models/", "")).join(" "));
