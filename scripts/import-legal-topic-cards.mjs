import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT_DIR,
  openCliDatabase,
  parseArgs,
  upsertLegalCard
} from './legal-knowledge-utils.mjs';

const args = parseArgs();
const seedPath = path.resolve(ROOT_DIR, args.seed || 'data/legal_theory_v4_1/legal_topic_cards_transito_v4_precision.json');
const source = String(args['replace-source'] || args.source || 'chatgpt_traffic_v4').trim();
const { db, client } = openCliDatabase(args);

try {
  const payload = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const cards = Array.isArray(payload) ? payload : (payload.cards || payload.items || []);
  if (!cards.length) throw new Error(`Nenhum card encontrado em ${seedPath}`);

  let imported = 0;
  for (const rawCard of cards) {
    const card = {
      ...rawCard,
      generated_by: source || rawCard.generated_by || 'chatgpt_traffic_v4',
      verified_status: rawCard.verified_status || 'seed_reviewed_topic'
    };
    upsertLegalCard(db, card);
    imported += 1;
  }

  console.log('# Importacao de legal_topic_cards');
  console.log(`Banco: ${client}`);
  console.log(`Seed: ${path.relative(ROOT_DIR, seedPath)}`);
  console.log(`Fonte: ${source}`);
  console.log(`Cards importados/atualizados: ${imported}`);
} finally {
  db.close();
}
