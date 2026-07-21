/**
 * Camada de IA provider-agnóstica.
 * Configuração via variáveis de ambiente (.env):
 *   AI_PROVIDER=gemini    + GEMINI_API_KEY=...           (tier gratuito do Google)
 *   AI_PROVIDER=anthropic + ANTHROPIC_API_KEY=...        (pago, melhor qualidade)
 *   AI_PROVIDER=ollama    + OLLAMA_MODEL=llama3.1        (local, gratuito)
 * Sem configuração → { available: false } e as features de IA ficam ocultas.
 */

const PROVIDER = (process.env.AI_PROVIDER || '').toLowerCase();

export function aiAvailable() {
  if (PROVIDER === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
  if (PROVIDER === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (PROVIDER === 'ollama') return true;
  return false;
}

export function aiProviderName() {
  return aiAvailable() ? PROVIDER : '';
}

/**
 * Gera texto. Retorna { ok, text, provider, error }.
 * @param {object} options - { system, prompt, maxTokens, temperature }
 */
export async function generateText({ system = '', prompt, maxTokens = 800, temperature = 0.2 } = {}) {
  if (!prompt) return { ok: false, error: 'prompt vazio' };
  if (!aiAvailable()) return { ok: false, error: 'Nenhum provedor de IA configurado (defina AI_PROVIDER no .env).' };

  try {
    if (PROVIDER === 'gemini') return await geminiGenerate({ system, prompt, maxTokens, temperature });
    if (PROVIDER === 'anthropic') return await anthropicGenerate({ system, prompt, maxTokens, temperature });
    if (PROVIDER === 'ollama') return await ollamaGenerate({ system, prompt, maxTokens, temperature });
    return { ok: false, error: `Provedor desconhecido: ${PROVIDER}` };
  } catch (error) {
    return { ok: false, provider: PROVIDER, error: error.message || String(error) };
  }
}

async function geminiGenerate({ system, prompt, maxTokens, temperature }) {
  // gemini-flash-latest é o alias que tem cota no tier gratuito: os nomes fixos
  // (gemini-2.0-flash, -lite) voltavam HTTP 429 com "limit: 0" nas chaves novas
  // ("AQ."), então parecia que o limite diário estava sempre esgotado.
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  // Os modelos 2.5 "pensam" por padrão, e esses tokens de raciocínio consomem o
  // maxOutputTokens — truncando a resposta. thinkingBudget:0 desliga isso.
  const supportsThinking = /latest|2\.5/.test(model);
  const generationConfig = { maxOutputTokens: maxTokens, temperature };
  if (supportsThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const response = await fetch(url, {
    method: 'POST',
    // Header oficial — compatível com chaves novas (AQ.) e antigas (AIza).
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const retry = detail.match(/retry in ([\d.]+)s/i);
    const friendly =
      response.status === 429
        ? `Gemini sem cota no momento (HTTP 429)${retry ? `, tente de novo em ~${Math.ceil(Number(retry[1]))}s` : ''}. Se persistir, a chave/modelo pode não ter tier gratuito (veja ai.dev/rate-limit).`
        : `Gemini HTTP ${response.status}: ${detail.slice(0, 200)}`;
    throw new Error(friendly);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  return { ok: Boolean(text), text, provider: 'gemini', model };
}

async function anthropicGenerate({ system, prompt, maxTokens, temperature }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Anthropic HTTP ${response.status}: ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const text = (data?.content || []).map((block) => block.text || '').join('');
  return { ok: Boolean(text), text, provider: 'anthropic', model };
}

async function ollamaGenerate({ system, prompt, maxTokens, temperature }) {
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.1';
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      system: system || undefined,
      prompt,
      stream: false,
      options: { num_predict: maxTokens, temperature }
    })
  });
  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status} (Ollama está rodando? ${baseUrl})`);
  }
  const data = await response.json();
  return { ok: Boolean(data?.response), text: data?.response || '', provider: 'ollama', model };
}

/** Extrai o primeiro objeto JSON válido de uma resposta de LLM. */
export function extractJson(text) {
  const raw = String(text || '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
