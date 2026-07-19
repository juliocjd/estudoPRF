/**
 * Processa a saída do run multiagente (tmp/theory_out/cards_*.json): resolve
 * a âncora legal de cada card contra o CTB no banco e importa em
 * question_applied_theory_cards.
 *
 * A IA (os agentes) só sugere o dispositivo em "suggestedLocator". O texto da
 * lei NUNCA vem da IA: se o artigo existir no compêndio, o trecho é lido
 * verbatim do banco (card ai_anchored); senão, vira ai_reviewed com selo.
 *
 * DRY-RUN por padrão; --apply grava. --dir aponta a pasta de saída.
 *   node scripts/resolve-and-import-applied-theory.mjs --dir tmp/theory_out --apply
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CTB_SLUG = 'lei_9503_1997_ctb_compilado';

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

/** "art. 165-A do CTB" -> "Art. 165-A" (display_ref do compêndio). */
function parseCtbLocator(locator) {
  const raw = String(locator || '').toLowerCase();
  if (!/\bart/.test(raw)) return null;
  const m = raw.match(/art(?:igo|\.)?\s*(\d+)\s*(-\s*[a-z])?/i);
  if (!m) return null;
  const suffix = m[2] ? `-${m[2].replace(/[\s-]/g, '').toUpperCase()}` : '';
  return `Art. ${m[1]}${suffix}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  const dir = path.resolve(ROOT_DIR, args.dir || 'tmp/theory_out');

  const files = (await fsp.readdir(dir)).filter((f) => /^cards_\d+\.json$/.test(f)).sort();
  let cards = [];
  for (const f of files) {
    try {
      const payload = JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8'));
      const list = Array.isArray(payload) ? payload : (payload.cards || []);
      cards.push(...list);
    } catch (e) {
      console.log(`  arquivo inválido: ${f} — ${e.message}`);
    }
  }
  console.log(`Arquivos: ${files.length} | cards: ${cards.length} | modo: ${apply ? 'APPLY' : 'DRY-RUN'}\n`);

  const { client, db } = openStudyDatabase({ dbPath: args.db || 'questoes-prf.sqlite' });
  const selectSection = db.prepare(
    'SELECT section_key, text, is_current, is_revoked FROM law_compendium_sections WHERE source_slug = ? AND display_ref = ?'
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
      card_status='published', publish_status='published', source_mode='historical_law',
      title=excluded.title, question_focus=excluded.question_focus,
      rule_that_solves_this_question=excluded.rule_that_solves_this_question,
      legal_basis=excluded.legal_basis, applied_explanation=excluded.applied_explanation,
      rule_summary_bullets=excluded.rule_summary_bullets, professor_tip=excluded.professor_tip,
      common_traps=excluded.common_traps, study_conclusion=excluded.study_conclusion,
      primary_legal_locator=excluded.primary_legal_locator,
      primary_exact_excerpt=excluded.primary_exact_excerpt,
      exact_anchor_verified=excluded.exact_anchor_verified,
      should_show_as_applied_theory=TRUE, show_warning=excluded.show_warning,
      generated_by=excluded.generated_by, verified_status=excluded.verified_status,
      updated_at=CURRENT_TIMESTAMP
  `);

  let anchored = 0, reviewed = 0, skipped = 0;
  for (const card of cards) {
    if (!card || !card.questionId || !String(card.appliedExplanation || '').trim() || !String(card.title || '').trim()) {
      skipped += 1; continue;
    }
    // Resolve âncora: só ancora se o artigo existir verbatim e vigente no CTB.
    let anchor = null;
    const displayRef = parseCtbLocator(card.suggestedLocator);
    if (displayRef) {
      const row = selectSection.get(CTB_SLUG, displayRef);
      if (row && row.is_current && !row.is_revoked) {
        // usa o displayRef já parseado (o SELECT não traz display_ref)
        anchor = { sectionKey: row.section_key, locator: `${displayRef} do CTB`, excerpt: String(row.text).trim() };
      }
    }
    const isAnc = Boolean(anchor);
    if (isAnc) anchored += 1; else reviewed += 1;

    const ruleThatSolves = (Array.isArray(card.ruleSummaryBullets) && card.ruleSummaryBullets[0]) || card.studyConclusion || card.questionFocus || card.title;
    if (apply) {
      upsert.run(
        card.questionId,
        String(card.title).slice(0, 120), card.questionFocus || '', ruleThatSolves, anchor?.locator || '',
        card.appliedExplanation, JSON.stringify(card.ruleSummaryBullets || []),
        card.professorTip || '', JSON.stringify(card.commonTraps || []),
        card.studyConclusion || '', anchor?.locator || '', anchor?.excerpt || '',
        isAnc, isAnc ? '' : 'Gerado por IA — confira o conteúdo com a fonte oficial.',
        isAnc ? 'claude_ai_anchored' : 'claude_ai_reviewed', isAnc ? 'anchor_verified' : 'ai_reviewed'
      );
    }
  }

  console.log(`${apply ? 'Gravados' : 'Prontos'}: ${anchored + reviewed} (ancorados: ${anchored} | selo: ${reviewed}) | pulados: ${skipped}`);
  if (!apply) console.log('DRY-RUN — rode com --apply para gravar.');
  db.close?.();
}

main().catch((e) => { console.error(e); process.exit(1); });
