const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateLimitStore = new Map();

const SYSTEM_PROMPT = `You are an expert coach helping managers define the right outcomes for their team members, based on Marcus Buckingham's methodology.

CORE PRINCIPLES YOU TEACH:
- An outcome is the END RESULT, not the activity. Test: if you removed the person and the result still existed in the world, that's an outcome.
- Outcomes let managers maintain accountability (define what must be achieved) while granting freedom (don't dictate how).
- When outcomes feel hard to define, managers default to prescribing steps. This is giving up too quickly.
- Even intangibles (morale, culture, satisfaction) CAN be defined as outcomes -- usually as emotional statements.

THE CONVERSION PROCESS:
1. Sort: Is this an outcome or an activity/step?
2. Convert: "If this activity succeeded perfectly, what would change? What would the customer notice?"
3. Pressure-test: "If I walked away for a year and came back, how would I KNOW this was done well?"
4. Filter through three questions:
   - What is right for the CUSTOMER (external or internal)?
   - What is right for the COMPANY STRATEGY right now?
   - What is right for the INDIVIDUAL'S STRENGTHS?

EXAMPLES OF CONVERSIONS:
- Activity: "Conducting weekly check-ins" -> Outcome: "Clients renew their contracts"
- Activity: "Running onboarding sessions" -> Outcome: "New hires reach full productivity 3 weeks faster"
- Activity: "Coaching direct reports weekly" -> Outcome: "Direct reports say 'I know what's expected of me'"

For intangible outcomes, convert to emotional statements:
- "Build strong team culture" -> "Team members say they feel cared about, recognized, and able to do their best work"

YOUR COACHING STYLE:
- Ask one question at a time
- Be direct and practical
- Help them see the difference between activities and outcomes
- Push back gently when they describe steps instead of results
- Celebrate when they nail an outcome
- Keep responses concise (2-4 sentences usually)

Start by asking what role or person they're trying to define outcomes for.`;

const getClientId = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
};

const checkRateLimit = (clientId) => {
  const now = Date.now();
  const entry = rateLimitStore.get(clientId);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { limited: false, retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { limited: true, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  entry.count += 1;
  return { limited: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
};

const setupSse = (res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
};

const sendSse = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' });
  }

  const wantsStream =
    req.query?.stream === '1' ||
    req.query?.stream === 'true' ||
    req.body?.stream === true ||
    (req.headers.accept && req.headers.accept.includes('text/event-stream'));

  const clientId = getClientId(req);
  const { limited, retryAfter } = checkRateLimit(clientId);
  if (limited) {
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `Rate limit exceeded. Try again in ${retryAfter}s.` });
  }

  const messages = Array.isArray(req.body?.messages)
    ? req.body.messages
        .filter(message => message && message.role && typeof message.content === 'string')
        .map(message => ({ role: message.role, content: message.content }))
    : [];

  if (messages.length === 0) {
    return res.status(400).json({ error: 'Messages are required.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages,
        stream: wantsStream
      })
    });

    if (!response.ok) {
      let errorMessage = 'Failed to get response.';
      try {
        const errorBody = await response.json();
        if (errorBody?.error?.message) {
          errorMessage = errorBody.error.message;
        }
      } catch (error) {
        // Ignore parsing errors.
      }
      return res.status(response.status).json({ error: errorMessage });
    }

    if (!wantsStream) {
      const data = await response.json();
      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      const assistantMessage = data.content?.[0]?.text || "I'm having trouble responding. Please try again.";
      return res.status(200).json({ message: assistantMessage });
    }

    setupSse(res);

    const reader = response.body?.getReader();
    if (!reader) {
      sendSse(res, { type: 'error', message: 'Streaming unavailable. Please try again.' });
      return res.end();
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.replace(/^data:\s*/, '');
        if (!data || data === '[DONE]') continue;

        try {
          const payload = JSON.parse(data);
          if (payload.type === 'content_block_delta' && payload.delta?.text) {
            sendSse(res, { type: 'delta', text: payload.delta.text });
          }

          if (payload.type === 'error') {
            const message = payload.error?.message || 'Streaming error.';
            sendSse(res, { type: 'error', message });
          }
        } catch (error) {
          // Ignore malformed events.
        }
      }
    }

    sendSse(res, { type: 'done' });
    return res.end();
  } catch (error) {
    console.error('API Error:', error);
    if (wantsStream) {
      setupSse(res);
      sendSse(res, { type: 'error', message: 'Failed to get response' });
      return res.end();
    }
    return res.status(500).json({ error: 'Failed to get response' });
  }
}
