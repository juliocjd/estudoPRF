#!/usr/bin/env node
/**
 * Gerador de flashcards cloze de lei seca a partir do compêndio legal.
 *
 * Extração determinística: prazos, velocidades, valores, pontuação,
 * classificação de infração, detenção, multa multiplicada, competência.
 * Prioridade por incidência (seções ligadas a questões primeiro).
 * Agendamento via FSRS (tabela law_cloze_mastery, preenchida ao estudar).
 *
 * Uso:
 *   node scripts/generate-law-cloze-cards.mjs                → dry-run
 *   node scripts/generate-law-cloze-cards.mjs --apply        → grava no SQLite
 *   node scripts/generate-law-cloze-cards.mjs --db x.sqlite  → outro banco
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const GENERATOR_VERSION = 'law-cloze-v1';
const MAX_CARDS_PER_SECTION = 2;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dbPathArg = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'questoes-prf.sqlite';
const db = new DatabaseSync(path.resolve(dbPathArg));

const CLOZE_PATTERNS = [
  { category: 'classificacao_infracao', hint: 'Classificação da infração',
    regex: /infra[çc][ãa]o\s*[-–—:]\s*(grav[íi]ssima|grave|m[ée]dia|leve)/i, group: 1 },
  { category: 'pontos', hint: 'Pontuação',
    regex: /\b(sete|cinco|quatro|tr[êe]s|3|4|5|7|20|40)\s+pontos\b/i, group: 1 },
  { category: 'velocidade', hint: 'Velocidade',
    regex: /\b(\d{2,3})\s*(?:km\/h|quil[ôo]metros por hora)/i, group: 1 },
  { category: 'valor', hint: 'Valor em reais',
    regex: /R\$\s?([\d.,]+)/i, group: 1 },
  { category: 'detencao', hint: 'Pena de detenção',
    regex: /deten[çc][ãa]o,?\s*de\s+(.{3,40}?\s+a\s+.{3,40}?(?:anos?|meses))/i, group: 1 },
  { category: 'multa_multiplicada', hint: 'Multiplicador da multa',
    regex: /multa\s*\(\s*(x\s*\d+|\w+\s+vezes)\s*\)/i, group: 1 },
  { category: 'prazo', hint: 'Prazo',
    regex: /\b(\d{1,3}|cinco|dez|quinze|vinte|trinta|sessenta|noventa)\s*\(?\w*\)?\s*(dias?|meses|anos?|horas?)\b/i, group: 0 },
  { category: 'suspensao', hint: 'Suspensão do direito de dirigir',
    regex: /suspens[ãa]o d[oe] direito de dirigir(?:\s*,?\s*(por|de)\s+(.{3,50}?(?:dias|meses|anos?)))?/i, group: 2 },
];

const SOURCE_LABELS = new Map([
  ['lei_9503_1997_ctb_compilado', 'CTB (Lei 9.503/1997)'],
]);

function humanRef(sectionKey, displayRef, hierarchyLevel) {
  // ex.: lei_9503_1997_ctb_compilado:art_261:inciso_i → "art. 261, I"
  const parts = String(sectionKey || '').split(':').slice(1);
  const art = parts.find((part) => part.startsWith('art_'));
  const artLabel = art ? `art. ${art.replace('art_', '').replace(/_/g, '-').toUpperCase()}` : '';
  const refLabel = displayRef && hierarchyLevel !== 'artigo' ? `, ${displayRef}` : '';
  return `${artLabel}${refLabel}`.trim();
}

const sections = db.prepare(`
  SELECT s.id, s.source_slug, s.section_key, s.display_ref, s.hierarchy_level, s.text,
    (SELECT COUNT(*) FROM law_section_question_links l WHERE l.section_id = s.id) AS question_links
  FROM law_compendium_sections s
  WHERE s.is_current = 1 AND COALESCE(s.is_revoked, 0) = 0
    AND LENGTH(s.text) BETWEEN 40 AND 700
  ORDER BY question_links DESC, s.source_slug, s.order_index
`).all();

const cards = [];
const stats = { sections: sections.length, byCategory: {} };

for (const section of sections) {
  const text = String(section.text || '').replace(/\s+/g, ' ').trim();
  let cardsFromSection = 0;
  const usedAnswers = new Set();

  for (const pattern of CLOZE_PATTERNS) {
    if (cardsFromSection >= MAX_CARDS_PER_SECTION) break;
    const match = pattern.regex.exec(text);
    if (!match) continue;
    const answer = String(pattern.group === 0 ? match[0] : match[pattern.group] || '').trim();
    if (!answer || answer.length < 1 || usedAnswers.has(answer.toLowerCase())) continue;

    const clozeText = text.replace(match[pattern.group === 0 ? 0 : pattern.group], 'ــــــــ')
      // fallback quando o grupo não é o match inteiro:
      .includes('ــــــــ')
      ? text.replace(pattern.group === 0 ? match[0] : match[pattern.group], '_______')
      : text;
    if (!clozeText.includes('_______')) continue;

    const sourceLabel = SOURCE_LABELS.get(section.source_slug) || section.source_slug;
    cards.push({
      sectionId: section.id,
      sourceSlug: section.source_slug,
      sourceLabel,
      ref: humanRef(section.section_key, section.display_ref, section.hierarchy_level),
      clozeText,
      answer,
      category: pattern.category,
      hint: pattern.hint,
      priority: 10 + Number(section.question_links || 0) * 5
        + (section.source_slug === 'lei_9503_1997_ctb_compilado' ? 3 : 0)
    });
    usedAnswers.add(answer.toLowerCase());
    cardsFromSection += 1;
    stats.byCategory[pattern.category] = (stats.byCategory[pattern.category] || 0) + 1;
  }
}

console.log('=== Gerador de cloze cards de lei seca ===');
console.log(`Seções analisadas: ${stats.sections}`);
console.log(`Cards gerados: ${cards.length}`);
console.log('Por categoria:', JSON.stringify(stats.byCategory));

if (!apply) {
  console.log('\n=== AMOSTRAS (dry-run — use --apply para gravar) ===');
  const samples = [...cards].sort(() => Math.random() - 0.5).slice(0, 5);
  for (const card of samples) {
    console.log(`\n--- [${card.category}] ${card.sourceLabel} ${card.ref} (prioridade ${card.priority})`);
    console.log(`  ${card.clozeText.slice(0, 260)}`);
    console.log(`  RESPOSTA: ${card.answer}`);
  }
  process.exit(0);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS law_cloze_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    source_slug TEXT NOT NULL,
    source_label TEXT,
    ref TEXT,
    cloze_text TEXT NOT NULL,
    answer TEXT NOT NULL,
    category TEXT NOT NULL,
    hint TEXT,
    priority REAL DEFAULT 0,
    generator_version TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(section_id, category, answer)
  );
  CREATE TABLE IF NOT EXISTS law_cloze_mastery (
    card_id INTEGER PRIMARY KEY,
    stability REAL,
    difficulty REAL,
    reps INTEGER DEFAULT 0,
    lapses INTEGER DEFAULT 0,
    last_review TEXT,
    next_due_at TEXT,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_law_cloze_due ON law_cloze_mastery(next_due_at);
`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO law_cloze_cards (
    section_id, source_slug, source_label, ref, cloze_text, answer, category, hint, priority, generator_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.exec('BEGIN');
try {
  let inserted = 0;
  for (const card of cards) {
    const result = insert.run(
      card.sectionId, card.sourceSlug, card.sourceLabel, card.ref, card.clozeText,
      card.answer, card.category, card.hint, card.priority, GENERATOR_VERSION
    );
    inserted += Number(result.changes || 0);
  }
  db.exec('COMMIT');
  console.log(`\nGravados ${inserted} cards (duplicados ignorados).`);
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
