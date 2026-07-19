/**
 * Importa cards de teoria aplicada gerados (preview_batch.json) para
 * question_applied_theory_cards.
 *
 * Reaproveita as colunas existentes (v5 + v6): nenhuma migração de schema.
 *   - ai_anchored: exact_anchor_verified=true + dispositivo/trecho verbatim
 *     do CTB. Passa pelo portão rigoroso de exibição.
 *   - ai_reviewed: sem dispositivo; publicado com show_warning (selo). O
 *     portão de exibição foi relaxado para aceitar generated_by ~ 'ai_reviewed'.
 *
 * DRY-RUN por padrão. Use --apply para gravar.
 *   node scripts/import-applied-theory-preview.mjs --file data/applied_theory_ai/preview_batch.json --apply
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next; i += 1;
  }
  return args;
}

const REQUIRED = ['title', 'questionFocus', 'appliedExplanation', 'studyConclusion'];

function validateCard(card) {
  const problems = [];
  for (const field of REQUIRED) {
    if (!String(card[field] || '').trim()) problems.push(`campo vazio: ${field}`);
  }
  if (card.sourceMode === 'ai_anchored') {
    if (!card.legalLocator || !card.legalExcerpt) problems.push('ancorado sem locator/excerpt');
    if (!card.legalSectionKey) problems.push('ancorado sem sectionKey');
  }
  if (card.sourceMode === 'ai_reviewed' && !String(card.showWarning || '').trim()) {
    problems.push('reviewed sem selo (showWarning)');
  }
  return problems;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  const file = path.resolve(ROOT_DIR, args.file || 'data/applied_theory_ai/preview_batch.json');
  const payload = JSON.parse(await fsp.readFile(file, 'utf8'));
  const cards = payload.cards || [];

  const { client, db } = openStudyDatabase({ dbPath: args.db || 'questoes-prf.sqlite' });
  console.log(`Banco: ${client} | cards no arquivo: ${cards.length} | modo: ${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  // Reverifica cada âncora contra o banco antes de gravar — nunca confia no arquivo.
  const selectSection = db.prepare(
    'SELECT text, is_current, is_revoked FROM law_compendium_sections WHERE section_key = ?'
  );

  const upsert = db.prepare(`
    INSERT INTO question_applied_theory_cards (
      question_id, card_status, publish_status, source_mode,
      title, question_focus, rule_that_solves_this_question, legal_basis,
      applied_explanation, rule_summary_bullets, professor_tip, common_traps,
      study_conclusion, primary_legal_locator, primary_exact_excerpt,
      exact_anchor_verified, should_show_as_applied_theory, show_before_answer,
      show_after_answer, show_warning, generated_by, verified_status, updated_at
    ) VALUES (
      ?, 'published', 'published', 'historical_law',
      ?, ?, ?, ?,
      ?, ?::jsonb, ?, ?::jsonb,
      ?, ?, ?,
      ?, TRUE, FALSE,
      TRUE, ?, ?, ?, CURRENT_TIMESTAMP
    )
    ON CONFLICT (question_id) DO UPDATE SET
      card_status = 'published', publish_status = 'published', source_mode = 'historical_law',
      title = excluded.title, question_focus = excluded.question_focus,
      rule_that_solves_this_question = excluded.rule_that_solves_this_question,
      legal_basis = excluded.legal_basis, applied_explanation = excluded.applied_explanation,
      rule_summary_bullets = excluded.rule_summary_bullets, professor_tip = excluded.professor_tip,
      common_traps = excluded.common_traps, study_conclusion = excluded.study_conclusion,
      primary_legal_locator = excluded.primary_legal_locator,
      primary_exact_excerpt = excluded.primary_exact_excerpt,
      exact_anchor_verified = excluded.exact_anchor_verified,
      should_show_as_applied_theory = TRUE, show_warning = excluded.show_warning,
      generated_by = excluded.generated_by, verified_status = excluded.verified_status,
      updated_at = CURRENT_TIMESTAMP
  `);

  let imported = 0;
  let skipped = 0;
  for (const card of cards) {
    const problems = validateCard(card);

    // Re-âncora: confirma que o trecho é verbatim e vigente no banco.
    if (card.sourceMode === 'ai_anchored' && card.legalSectionKey) {
      const row = selectSection.get(card.legalSectionKey);
      const verbatim = row && String(row.text).trim() === String(card.legalExcerpt).trim();
      const vigente = row && row.is_current && !row.is_revoked;
      if (!verbatim) problems.push('âncora não confere (texto diferente do banco)');
      if (!vigente) problems.push('âncora revogada/não vigente');
    }

    if (problems.length) {
      console.log(`  [${card.questionId}] PULADO — ${problems.join('; ')}`);
      skipped += 1;
      continue;
    }

    const anchored = card.sourceMode === 'ai_anchored';
    const generatedBy = anchored ? 'claude_ai_anchored' : 'claude_ai_reviewed';
    const verifiedStatus = anchored ? 'anchor_verified' : 'ai_reviewed';
    const ruleThatSolves = (card.ruleSummaryBullets && card.ruleSummaryBullets[0]) || card.studyConclusion || card.questionFocus;

    if (apply) {
      upsert.run(
        card.questionId,
        card.title, card.questionFocus, ruleThatSolves, card.legalLocator || '',
        card.appliedExplanation, JSON.stringify(card.ruleSummaryBullets || []),
        card.professorTip || '', JSON.stringify(card.commonTraps || []),
        card.studyConclusion, card.legalLocator || '', card.legalExcerpt || '',
        anchored, card.showWarning || '', generatedBy, verifiedStatus
      );
    }
    console.log(`  [${card.questionId}] ${anchored ? 'ANCORADO' : 'revisado'} ${card.legalLocator ? `(${card.legalLocator})` : ''} — ${card.title.slice(0, 50)}`);
    imported += 1;
  }

  console.log(`\n${apply ? 'Gravados' : 'Prontos p/ gravar'}: ${imported} | pulados: ${skipped}`);
  if (!apply) console.log('DRY-RUN — rode com --apply para gravar.');
  db.close?.();
}

main().catch((error) => { console.error(error); process.exit(1); });
