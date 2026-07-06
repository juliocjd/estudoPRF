#!/usr/bin/env node
/** Auditoria rápida do volume de dados de estudo no Postgres (produção).
 *  Uso: node scripts/count-study-data.mjs
 */
import { createClient } from './lib/db.mjs';

const { client, selected } = createClient({ preferDirect: false, applicationName: 'count-study-data' });

async function safeQuery(label, sql) {
  try {
    const { rows } = await client.query(sql);
    return { label, rows };
  } catch (error) {
    return { label, error: error.message };
  }
}

try {
  await client.connect();
  const results = [];

  results.push(await safeQuery('study_answers (total)', `
    select count(*)::int as total,
      min(answered_at) as primeira,
      max(answered_at) as ultima,
      count(distinct question_id)::int as questoes_distintas
    from study_answers
  `));

  results.push(await safeQuery('por confiança', `
    select coalesce(nullif(confidence, ''), 'sem_confianca') as confidence,
      count(*)::int as total,
      sum(case when is_correct = 1 then 1 else 0 end)::int as acertos
    from study_answers
    group by 1 order by 2 desc
  `));

  results.push(await safeQuery('por mês', `
    select to_char(answered_at, 'YYYY-MM') as mes, count(*)::int as total
    from study_answers
    group by 1 order by 1
  `));

  results.push(await safeQuery('question_mastery', `
    select count(*)::int as total from question_mastery
  `));

  results.push(await safeQuery('exam_simulations', `
    select count(*)::int as total from exam_simulations
  `));

  results.push(await safeQuery('study_sessions', `
    select count(*)::int as total from study_sessions
  `));

  console.log(`Conexão: ${selected.redactedConnectionString}\n`);
  for (const r of results) {
    console.log(`== ${r.label} ==`);
    console.log(r.error ? `erro: ${r.error}` : JSON.stringify(r.rows, null, 2));
    console.log('');
  }
} finally {
  try { await client.end(); } catch {}
}
