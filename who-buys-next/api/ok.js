// Health check. Tells the page the helpers are up and which server-side AI keys exist (never the keys).
export default function handler(req, res) {
  const has = k => Boolean(process.env[k]);
  res.status(200).json({
    ok: true,
    providers: {
      claude: has('ANTHROPIC_API_KEY'), gemini: has('GEMINI_API_KEY'), openai: has('OPENAI_API_KEY'),
      groq: has('GROQ_API_KEY'), openrouter: has('OPENROUTER_API_KEY')
    }
  });
}
