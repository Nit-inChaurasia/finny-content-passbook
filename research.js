import Anthropic from '@anthropic-ai/sdk';

// Increase Vercel function timeout (requires Pro for >10s; works in dev always)
export const config = { maxDuration: 60 };

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a research scout for Finny, an Indian FIRE (financial independence) advisory app. Search the web for what is trending right now in Indian personal finance conversation: Reddit communities like r/IndiaInvestments and r/FIREIndia, finance Twitter/X, recent Indian financial news, and viral personal finance posts or blogs. Find angles a 20s-30s Indian audience would stop scrolling for.

Return ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:
{"topics": [{"topic": "short topic name", "angle": "one sentence on why this is relevant or surprising right now"}]}
Return exactly 6 topics.`;

function parseJSON(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const startIdx = cleaned.search(/[{\[]/);
  if (startIdx === -1) throw new Error('No JSON object found in response');
  const lastCurly = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const endIdx = Math.max(lastCurly, lastBracket);
  return JSON.parse(cleaned.slice(startIdx, endIdx + 1));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set. Add it to .env.local (dev) or Vercel environment variables (production).' });
  }

  try {
    let messages = [
      { role: 'user', content: "Find this week's trending Indian personal finance and FIRE angles. Return your answer as the JSON specified in your instructions." }
    ];
    let allText = '';

    // Agentic loop: built-in web_search may require multiple turns
    for (let turn = 0; turn < 8; turn++) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: SYSTEM,
        messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      });

      // Collect all text blocks from this turn
      for (const block of response.content) {
        if (block.type === 'text') allText += block.text;
      }

      if (response.stop_reason === 'end_turn') break;

      // Claude wants to do more (another search turn) — continue the loop
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: 'Continue and provide the final JSON output.' });
    }

    const data = parseJSON(allText);
    return res.status(200).json(data);
  } catch (err) {
    console.error('[research] error:', err);
    return res.status(500).json({ error: err.message || 'Unknown error in research step' });
  }
}
