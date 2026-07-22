/**
 * Personaliza o FSRS a partir do histórico real do aluno.
 *
 * Mede a retenção observada nas revisões (respostas que foram a 2ª+ vez na
 * mesma questão) e deriva um multiplicador de estabilidade que alinha os
 * intervalos ao ritmo real de memória:
 *   - retém MELHOR que o alvo → multiplicador > 1 (estica os intervalos);
 *   - retém PIOR → multiplicador < 1 (encurta).
 * Fórmula (curva FSRS): mult = (alvo^-2 - 1) / (Robs^-2 - 1). Clamp [0.6, 2.0].
 *
 * Grava em study_settings.fsrs_stability_multiplier, lido por
 * getFsrsRuntimeOptions no servidor. Requer amostra mínima para não overfitar.
 *
 * Uso:
 *   node scripts/personalize-fsrs.mjs            (calcula e grava)
 *   node scripts/personalize-fsrs.mjs --dry-run  (só mostra, não grava)
 *   node scripts/personalize-fsrs.mjs --reset     (volta ao padrão = 1)
 */
import '../src/load-env.mjs';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';
import { FSRS_CONFIG } from '../src/study/study-config.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const RESET = args.includes('--reset');
const MIN_REVIEWS = 30;
const TARGET = FSRS_CONFIG.requestRetention; // 0.88

const { db, client } = openStudyDatabase({ databaseUrl: process.env.DATABASE_URL });
const one = (sql, ...p) => db.prepare(sql).get(...p);
const setSetting = (key, value) => db.prepare(`
  INSERT INTO study_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
`).run(key, String(value));

console.log(`Banco: ${client} | alvo de retenção: ${(TARGET * 100).toFixed(0)}%`);

if (RESET) {
  if (!DRY) setSetting('fsrs_stability_multiplier', '1');
  console.log('[RESET] multiplicador voltou para 1 (parâmetros padrão).');
  process.exit(0);
}

const isReviewFilter = `EXISTS (
  SELECT 1 FROM study_answers p
  WHERE p.question_id = sa.question_id
    AND (p.answered_at < sa.answered_at OR (p.answered_at = sa.answered_at AND p.id < sa.id)))`;
const reviews = one(`SELECT COUNT(*) AS n FROM study_answers sa WHERE ${isReviewFilter}`).n;
const correct = one(`SELECT COUNT(*) AS n FROM study_answers sa WHERE sa.is_correct = 1 AND ${isReviewFilter}`).n;

console.log(`revisões: ${reviews} | corretas: ${correct}`);
if (reviews < MIN_REVIEWS) {
  console.log(`Amostra pequena (< ${MIN_REVIEWS}). Mantém multiplicador = 1 até ter mais histórico.`);
  if (!DRY) setSetting('fsrs_stability_multiplier', '1');
  process.exit(0);
}

const Robs = correct / reviews;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let mult = 1;
if (Robs > 0 && Robs < 1) {
  mult = (Math.pow(TARGET, -2) - 1) / (Math.pow(Robs, -2) - 1);
}
mult = clamp(mult, 0.6, 2.0);

console.log(`retenção observada: ${(Robs * 100).toFixed(1)}%`);
console.log(`multiplicador de estabilidade: ${mult.toFixed(3)} (${mult > 1 ? 'estica' : mult < 1 ? 'encurta' : 'neutro'} os intervalos ~${Math.abs(Math.round((mult - 1) * 100))}%)`);

if (DRY) {
  console.log('[DRY-RUN] nada gravado.');
} else {
  setSetting('fsrs_stability_multiplier', mult.toFixed(4));
  setSetting('fsrs_personal_meta', JSON.stringify({ reviews, correct, retentionObserved: Number(Robs.toFixed(4)), multiplier: Number(mult.toFixed(4)) }));
  console.log('[GRAVADO] fsrs_stability_multiplier =', mult.toFixed(4));
}
process.exit(0);
