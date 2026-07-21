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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Cada tentativa é limitada no tempo: sem isso um request travado deixava a
// chamada pendurada (~86s num teste) e estouraria o maxDuration da Vercel (60s).
const GEMINI_TIMEOUT_MS = 12000;

async function geminiGenerate({ system, prompt, maxTokens, temperature }) {
  // gemini-flash-latest é o alias que tem cota no tier gratuito: os nomes fixos
  // (gemini-2.0-flash, -lite) voltavam HTTP 429 com "limit: 0" nas chaves novas
  // ("AQ."), então parecia que o limite diário estava sempre esgotado.
  // A lista funciona como fallback: se o modelo principal estiver sobrecarregado
  // (HTTP 503 "high demand") ou lento, cai para o "lite" (mais disponível) —
  // ambos têm cota no tier gratuito.
  const primary = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const models = [...new Set([primary, 'gemini-flash-latest', 'gemini-flash-lite-latest'])];
  let lastError = 'sem resposta';

  for (const model of models) {
    // Os modelos 2.5 "pensam" por padrão, e esses tokens de raciocínio consomem
    // o maxOutputTokens — truncando a resposta. thinkingBudget:0 desliga isso.
    const supportsThinking = /latest|2\.5/.test(model);
    const generationConfig = { maxOutputTokens: maxTokens, temperature };
    if (supportsThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const body = JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        // Header oficial — compatível com chaves novas (AQ.) e antigas (AIza).
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body,
        signal: controller.signal
      });
      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
        return { ok: Boolean(text), text, provider: 'gemini', model };
      }
      const detail = await response.text().catch(() => '');
      lastError = `HTTP ${response.status}: ${detail.slice(0, 160)}`;
    } catch (error) {
      lastError = error?.name === 'AbortError'
        ? `timeout após ${GEMINI_TIMEOUT_MS / 1000}s`
        : (error?.message || String(error));
    } finally {
      clearTimeout(timer);
    }
    await sleep(300); // pequena pausa antes de tentar o próximo modelo
  }

  const retry = lastError.match(/retry in ([\d.]+)s/i);
  const friendly = /HTTP 429/.test(lastError)
    ? `Gemini sem cota no momento${retry ? `, tente de novo em ~${Math.ceil(Number(retry[1]))}s` : ''}. Se persistir, a chave/modelo pode não ter tier gratuito (veja ai.dev/rate-limit).`
    : /HTTP 5\d\d|UNAVAILABLE|high demand|timeout/i.test(lastError)
      ? 'O modelo de IA está sobrecarregado agora (muita demanda). Tente de novo em alguns segundos.'
      : `Gemini ${lastError}`;
  throw new Error(friendly);
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
