/**
 * FSRS (Free Spaced Repetition Scheduler) — implementação FSRS-4.5, sem dependências.
 * Modelo DSR: Difficulty (1..10), Stability (dias), Retrievability (0..1).
 * Referência: https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs
 *
 * Compatível com SQLite e Postgres (não toca em banco — funções puras).
 */

export const FSRS_VERSION = 'fsrs-4.5';

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // 19/81

/** Parâmetros padrão FSRS-4.5 (otimizáveis futuramente com o histórico do aluno). */
export const DEFAULT_PARAMS = Object.freeze([
  0.4872, 1.4003, 3.7145, 13.8206,
  5.1618, 1.2298, 0.8975, 0.031,
  1.6474, 0.1367, 1.0461, 2.1072,
  0.0793, 0.3246, 1.587, 0.2272, 2.8755
]);

export const Rating = Object.freeze({ Again: 1, Hard: 2, Good: 3, Easy: 4 });

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

/** Probabilidade de recordar após elapsedDays com dada estabilidade. */
export function retrievability(elapsedDays, stability) {
  if (!Number.isFinite(stability) || stability <= 0) return 0;
  const t = Math.max(0, Number(elapsedDays) || 0);
  return Math.pow(1 + FACTOR * (t / stability), DECAY);
}

/** Intervalo (dias) para atingir a retenção-alvo. */
export function intervalForRetention(stability, requestRetention, { minIntervalDays = 1, maxIntervalDays = 120 } = {}) {
  if (!Number.isFinite(stability) || stability <= 0) return minIntervalDays;
  const interval = (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
  return clampNumber(Math.round(interval), minIntervalDays, maxIntervalDays);
}

function initDifficulty(rating, w) {
  return clampNumber(w[4] - (rating - 3) * w[5], 1, 10);
}

function initStability(rating, w) {
  return Math.max(w[rating - 1], 0.1);
}

function nextDifficulty(difficulty, rating, w) {
  const next = difficulty - w[6] * (rating - 3);
  const meanReverted = w[7] * initDifficulty(Rating.Easy, w) + (1 - w[7]) * next;
  return clampNumber(meanReverted, 1, 10);
}

function nextRecallStability(difficulty, stability, r, rating, w) {
  const hardPenalty = rating === Rating.Hard ? w[15] : 1;
  const easyBonus = rating === Rating.Easy ? w[16] : 1;
  return stability * (
    1 + Math.exp(w[8])
      * (11 - difficulty)
      * Math.pow(stability, -w[9])
      * (Math.exp(w[10] * (1 - r)) - 1)
      * hardPenalty
      * easyBonus
  );
}

function nextForgetStability(difficulty, stability, r, w) {
  const next = w[11]
    * Math.pow(difficulty, -w[12])
    * (Math.pow(stability + 1, w[13]) - 1)
    * Math.exp(w[14] * (1 - r));
  return Math.min(next, stability);
}

/**
 * Converte o resultado de uma resposta do sistema em rating FSRS.
 * wrong → Again; correct+guess → Hard; correct+doubt → Good;
 * correct+sure → Good (ou Easy se recall rápido).
 */
export function gradeAnswer({ isCorrect, confidence, elapsedMs }, { fastAnswerMs = 15000 } = {}) {
  if (isCorrect === 0) return Rating.Again;
  if (confidence === 'guess') return Rating.Hard;
  if (confidence === 'doubt') return Rating.Good;
  if (Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs <= fastAnswerMs) return Rating.Easy;
  return Rating.Good;
}

/**
 * Agenda a próxima revisão.
 * @param {object|null} state - { stability, difficulty, reps, lapses, lastReviewAt } ou null (cartão novo)
 * @param {number} rating - Rating.Again..Easy
 * @param {Date} now
 * @param {object} options - { requestRetention, minIntervalDays, maxIntervalDays, params }
 * @returns {{ stability, difficulty, reps, lapses, retrievability, intervalDays, dueAt, rating, version }}
 */
export function scheduleReview(state, rating, now = new Date(), options = {}) {
  const w = options.params || DEFAULT_PARAMS;
  const requestRetention = options.requestRetention ?? 0.9;
  const bounds = {
    minIntervalDays: options.minIntervalDays ?? 1,
    maxIntervalDays: options.maxIntervalDays ?? 120
  };

  const hasState = state
    && Number.isFinite(Number(state.stability)) && Number(state.stability) > 0
    && Number.isFinite(Number(state.difficulty)) && Number(state.difficulty) > 0;

  let stability;
  let difficulty;
  let reps = Number(state?.reps || 0);
  let lapses = Number(state?.lapses || 0);
  let r = null;

  if (!hasState) {
    stability = initStability(rating, w);
    difficulty = initDifficulty(rating, w);
  } else {
    const lastReview = state.lastReviewAt ? new Date(state.lastReviewAt) : null;
    const elapsedDays = lastReview && !Number.isNaN(lastReview.getTime())
      ? Math.max(0, (now.getTime() - lastReview.getTime()) / 86400000)
      : 0;
    const prevStability = Number(state.stability);
    const prevDifficulty = Number(state.difficulty);
    r = retrievability(elapsedDays, prevStability);
    difficulty = nextDifficulty(prevDifficulty, rating, w);
    if (rating === Rating.Again) {
      stability = nextForgetStability(prevDifficulty, prevStability, r, w);
    } else if (elapsedDays < 1) {
      // Revisão no mesmo dia: não há esquecimento mensurável; ganho mínimo de estabilidade.
      stability = prevStability * (rating === Rating.Hard ? 1 : 1.05);
    } else {
      stability = nextRecallStability(prevDifficulty, prevStability, r, rating, w);
    }
  }

  stability = Math.max(stability, 0.1);
  reps += 1;
  if (rating === Rating.Again) lapses += 1;

  const intervalDays = rating === Rating.Again
    ? bounds.minIntervalDays
    : intervalForRetention(stability, requestRetention, bounds);

  const dueAt = new Date(now.getTime() + intervalDays * 86400000);

  return {
    stability: Number(stability.toFixed(4)),
    difficulty: Number(difficulty.toFixed(4)),
    reps,
    lapses,
    retrievability: r === null ? null : Number(r.toFixed(4)),
    intervalDays,
    dueAt,
    rating,
    version: FSRS_VERSION
  };
}
