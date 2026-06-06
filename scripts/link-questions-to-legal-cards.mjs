import {
  linkQuestionToLegalCard,
  normalizeSearchText,
  openCliDatabase,
  parseArgs
} from './legal-knowledge-utils.mjs';

const args = parseArgs();
const { db, client } = openCliDatabase(args);

try {
  db.prepare("DELETE FROM question_legal_links WHERE source = 'auto_legal_link_v1'").run();
  const autoLink = Boolean(args.auto);
  const limit = Number(args.limit || 0);
  const questions = db.prepare(`
    SELECT id_question, materia, assunto, statement_text
    FROM questions
    WHERE COALESCE(anulada, 0) = 0
    ORDER BY id_question
    ${limit > 0 ? `LIMIT ${limit}` : ''}
  `).all();
  const cards = db.prepare(`
    SELECT id AS card_id, card_key, title, materia, assunto, microtema,
      answer_summary, rule_summary, common_traps, source_refs
    FROM legal_topic_cards
    ORDER BY id
  `).all().map((card) => ({
    ...card,
    article_id: findArticleIdForCard(card)
  }));

  let linked = 0;
  let exact = 0;
  let skippedLowConfidence = 0;
  console.log(`# Vinculo questao -> legislacao/microteoria`);
  console.log(`Banco: ${client}`);
  console.log(`Questoes avaliadas: ${questions.length}`);
  console.log(`Cards disponiveis: ${cards.length}`);

  if (autoLink) {
    for (const question of questions) {
      const match = bestCardMatch(question, cards);
      if (!match || match.score < 0.9) {
        skippedLowConfidence += 1;
        continue;
      }
      linkQuestionToLegalCard(db, {
        questionId: question.id_question,
        articleId: match.card.article_id || null,
        cardId: match.card.card_id,
        relationType: 'exact_or_strong_topic',
        relevanceScore: match.score,
        reason: match.reason,
        source: 'auto_legal_link_v1'
      });
      linked += 1;
      exact += 1;
    }
  }

  ensurePriorityLinks();

  const coverage = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(DISTINCT qll.question_id) AS with_legal_card
    FROM questions q
    LEFT JOIN question_legal_links qll ON qll.question_id = q.id_question
    WHERE COALESCE(q.anulada, 0) = 0
  `).get();

  console.log('');
  console.log(`# Resultado`);
  console.log(`Modo automatico: ${autoLink ? 'sim' : 'nao'}`);
  console.log(`Vinculos automaticos criados/atualizados: ${linked}`);
  console.log(`Vinculos fortes: ${exact}`);
  console.log(`Pulados por baixa confianca: ${skippedLowConfidence}`);
  console.log(`Cobertura: ${Number(coverage.with_legal_card || 0).toLocaleString('pt-BR')} / ${Number(coverage.total || 0).toLocaleString('pt-BR')}`);
} finally {
  db.close();
}

function bestCardMatch(question, cards) {
  const haystack = normalizeSearchText(`${question.materia} ${question.assunto} ${question.statement_text}`);
  let best = null;
  for (const card of cards) {
    const needles = [
      card.materia,
      card.assunto,
      card.microtema,
      card.title,
      card.answer_summary,
      card.rule_summary,
      card.common_traps,
      card.article_ref
    ].map(normalizeSearchText).filter(Boolean);
    let score = 0;
    const reasons = [];
    for (const needle of needles) {
      if (!needle) continue;
      if (haystack.includes(needle)) {
        score += needle.length > 20 ? 0.35 : 0.18;
        reasons.push(needle);
        continue;
      }
      const tokens = needle.split(' ').filter((token) => token.length >= 4);
      const hits = tokens.filter((token) => haystack.includes(token)).length;
      if (tokens.length) score += Math.min(0.28, (hits / tokens.length) * 0.28);
    }
    if (!best || score > best.score) {
      best = { card, score: Math.min(1, score), reason: reasons.slice(0, 2).join('; ') || 'similaridade por materia/assunto/enunciado' };
    }
  }
  return best;
}

function ensurePriorityLinks() {
  const rows = [
    { questionId: 28259, cardKey: 'transito::baixa_veiculo::prazo_30_dias' },
    { questionId: 28260, cardKey: 'transito::vidros_peliculas::pelicula_refletiva' }
  ];
  for (const row of rows) {
    const card = db.prepare('SELECT id FROM legal_topic_cards WHERE card_key = ?').get(row.cardKey);
    if (!card) continue;
    const fullCard = db.prepare('SELECT * FROM legal_topic_cards WHERE card_key = ?').get(row.cardKey);
    const articleId = fullCard ? findArticleIdForCard(fullCard) : null;
    linkQuestionToLegalCard(db, {
      questionId: row.questionId,
      articleId,
      cardId: card.id,
      relationType: 'supports_answer',
      relevanceScore: 1,
      reason: 'vinculo prioritario exigido pela camada de microteoria v1',
      source: 'priority_legal_microtheory_v1'
    });
  }
}

function findArticleIdForCard(card) {
  const refs = parseRefs(card.source_refs);
  for (const ref of refs) {
    const articleRef = ref.article_ref || ref.articleRef || '';
    const sourceKey = ref.source_key || ref.sourceKey || '';
    if (!articleRef) continue;
    const article = sourceKey
      ? db.prepare(`
        SELECT la.id
        FROM legal_articles la
        JOIN legal_sources ls ON ls.id = la.source_id
        WHERE ls.source_key = ? AND la.article_ref = ?
        LIMIT 1
      `).get(sourceKey, articleRef)
      : db.prepare('SELECT id FROM legal_articles WHERE article_ref = ? ORDER BY id LIMIT 1').get(articleRef);
    if (article?.id) return article.id;
  }
  return null;
}

function parseRefs(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
