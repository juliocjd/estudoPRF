/**
 * Configuração central do motor de estudo.
 * Centraliza os "magic numbers" para ajuste sem caça ao código.
 */

export const FSRS_CONFIG = {
  /** Retenção-alvo: probabilidade de lembrar no momento da revisão agendada.
   *  Sem edital: 0.88. Com data de prova, subir para 0.92+ na reta final. */
  requestRetention: 0.88,
  /** Intervalo máximo entre revisões (dias). Cap conservador para concurso. */
  maxIntervalDays: 120,
  /** Intervalo mínimo (dias). */
  minIntervalDays: 1,
  /** Resposta correta + "sure" abaixo deste tempo vira rating Easy (recall rápido e confiante). */
  fastAnswerMs: 15000
};

/** Deltas legados de mastery_score (mantidos para exibição/compatibilidade). */
export const MASTERY_CONFIG = {
  deltaWrong: -0.25,
  deltaWrongOutdated: -0.08,
  deltaGuess: 0.05,
  deltaDoubt: 0.12,
  deltaSure: 0.2,
  fragileThreshold: 0.35,
  masteredThreshold: 0.85
};

/** Itens C/E derivados de múltipla escolha ocupam ids >= este valor.
 *  São usados em modos de estudo/revisão, mas NUNCA em simulados
 *  (gabarito derivado, não validado por banca). */
export const DERIVED_CE_ID_START = 910000000;

/** Simulado realista (perfil PRF 2021 / Cebraspe). */
export const EXAM_CONFIG = {
  totalItems: 120,
  durationMinutes: 240,
  scoring: { correct: 1, wrong: -1, blank: 0 },
  cutoffs2021: { block1: 15, block2: 10, block3: 10, total: 50 },
  lastCallScore2021: 73
};
