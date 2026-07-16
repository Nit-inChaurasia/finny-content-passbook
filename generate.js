import Anthropic from '@anthropic-ai/sdk';

export const config = { maxDuration: 60 };

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You write short-form Instagram reel concepts for Finny, an AI-first FIRE (financial independence) advisory app for young Indians (20s-30s), built on the Account Aggregator framework, backed by SEBI-registered advisers. Voice: direct, plain language, a little cheeky, never preachy, no corporate jargon. Never use em dashes anywhere in your output.

Use this content assembly framework:

1. Every idea has a HOOK matched to an awareness stage:
   - Unaware: pure curiosity, they don't know they have a problem yet
   - Problem-Aware: names a pain they already feel but haven't solved
   - Solution-Aware: they know solutions exist, sell them the promise
   - Product-Aware: they know the category, build proof and credibility
   - Most-Aware: they know Finny, this is the direct offer

2. Every idea has a FORMAT, pick whichever fits best:
   - Demonstration: screen-record the app doing something live
   - Testimonial: a real or reenacted user talking direct to camera
   - Education: explainer style, whiteboard or on-screen text teaching a concept
   - Story: personal narrative, confession, scam story, founder journey
   - Faceless: screenshots, text-on-screen slideshow, no camera needed

3. Every idea has a CTA that shows and tells what to do next, kept short and clear.

Given a list of trending topics and two target awareness stages, write exactly 2 content ideas, each grounded in one of the trending topics. Return ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:
[{"awareness_stage":"...", "format":"...", "hook":"...", "script":"...", "on_screen_text":["...","..."], "shot_list":["...","..."], "cta":"..."}]`;

function parseJSON(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const startIdx = cleaned.search(/[{\[]/);
  if (startIdx === -1) throw new Error('No JSON found in generation response');
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
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set.' });
  }

  const { topics, stages, groupLabel } = req.body || {};

  if (!topics || !stages) {
    return res.status(400).json({ error: 'Missing required fields: topics and stages' });
  }

  const userMsg = `Trending topics:\n${topics.map(t => `- ${t.topic}: ${t.angle}`).join('\n')}\n\nTarget awareness stages for this batch: ${stages.join(', ')} (${groupLabel}).`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    const data = parseJSON(text);
    // Always return an array
    return res.status(200).json(Array.isArray(data) ? data : [data]);
  } catch (err) {
    console.error('[generate] error:', err);
    return res.status(500).json({ error: err.message || 'Unknown error in generate step' });
  }
}
