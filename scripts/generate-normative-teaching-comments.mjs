import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  buildGenerationPrompt,
  buildTemplateTeachingComment,
  extractJsonObject,
  validateTeachingPayload
} from '../src/normative-teaching-utils.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR_VERSION = 'normative-teaching-v1';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = normalizeDatabaseUrl(args.db || args['database-url'] || process.env.DATABASE_URL);
  const limit = Math.max(1, Number(args.limit || 20));
  const dryRun = Boolean(args['dry-run']);
  const force = Boolean(args.force);
  const provider = String(args.provider || (args.model ? 'openai' : 'template')).trim().toLowerCase();
  const model = String(args.model || process.env.OPENAI_MODEL || '').trim();
  const reportPath = args.report ? path.resolve(ROOT_DIR, args.report) : '';

  if (!databaseUrl) {
    console.error('Defina DATABASE_URL ou passe --db para ler/gravar no Postgres.');
    process.exit(1);
  }
  if (provider === 'openai' && !model) {
    console.error('Passe --model ou defina OPENAI_MODEL para provider=openai.');
    process.exit(1);
  }

  const report = await generateNormativeTeachingComments({
    databaseUrl,
    limit,
    dryRun,
    force,
    provider,
    model
  });
  console.log(renderReport(report));
  if (reportPath) await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function generateNormativeTeachingComments({
  databaseUrl,
  limit = 20,
  dryRun = true,
  force = false,
  provider = 'template',
  model = ''
}) {
  databaseUrl = normalizeDatabaseUrl(databaseUrl);
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30
  });

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    provider,
    model,
    generatorVersion: GENERATOR_VERSION,
    read: 0,
    generated: 0,
    written: 0,
    skipped: 0,
    invalidCurrentAnswer: 0,
    errors: [],
    samples: []
  };

  try {
    await assertTables(sql);
    const rows = await loadCandidates(sql, { limit, force });
    report.read = rows.length;

    for (const row of rows) {
      try {
        const record = normalizeRecord(row);
        const generated = provider === 'openai'
          ? await generateWithOpenAI(record, { model })
          : buildTemplateTeachingComment(record);
        const validated = validateTeachingPayload({
          ...generated,
          historical_answer: generated.historical_answer || record.normativeUpdate.gabarito_banco || record.comment.extracted_answer || ''
        }, {
          questionType: record.question.type_question,
          alternatives: record.alternatives,
          historicalAnswer: record.normativeUpdate.gabarito_banco || record.comment.extracted_answer || ''
        });

        if (!validated.validCurrentAnswer) {
          report.invalidCurrentAnswer += 1;
        }

        const payload = {
          ...validated.data,
          alternatives_analysis_json: validated.data.alternatives_analysis,
          source_normative_json: record.normativeUpdate,
          raw_generation_json: {
            provider,
            model,
            issues: validated.issues,
            generated
          }
        };

        report.generated += 1;
        if (report.samples.length < 5) {
          report.samples.push({
            questionId: record.question.id_question,
            currentAnswer: payload.current_answer,
            answerPolicy: payload.answer_policy,
            studyRecommendation: payload.study_recommendation,
            safetyLevel: payload.safety_level,
            issues: validated.issues
          });
        }

        if (!dryRun) {
          await upsertTeachingComment(sql, record, payload, {
            provider,
            model
          });
          report.written += 1;
        }
      } catch (error) {
        report.errors.push({
          questionId: row.question_id,
          error: error.message || String(error)
        });
      }
    }

    return report;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function normalizeDatabaseUrl(value) {
  let url = String(value || '').trim();
  url = url.replace(/^\$env:DATABASE_URL\s*=\s*/i, '');
  url = url.replace(/^DATABASE_URL\s*=\s*/i, '');
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }
  return url.trim();
}

async function assertTables(sql) {
  const rows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'questions',
        'alternatives',
        'comments',
        'question_normative_updates',
        'question_normative_teaching_comments'
      )
  `;
  const existing = new Set(rows.map((row) => row.table_name));
  for (const required of ['questions', 'alternatives', 'question_normative_updates', 'question_normative_teaching_comments']) {
    if (!existing.has(required)) {
      throw new Error(`Tabela obrigatoria ausente: ${required}. Rode a migration antes.`);
    }
  }
}

async function loadCandidates(sql, { limit, force }) {
  return await sql`
    SELECT
      q.id_question,
      q.statement_text,
      q.statement_html,
      q.type_question,
      q.materia,
      q.assunto,
      q.banca,
      q.concurso_ano,
      COALESCE(c.html_local, c.html, '') AS comment_html,
      COALESCE(c.text, '') AS comment_text,
      COALESCE(c.extracted_answer, '') AS comment_extracted_answer,
      COALESCE(c.professor, '') AS professor,
      qnu.question_id,
      qnu.source_file,
      qnu.source_version,
      qnu.gabarito_banco,
      qnu.resposta_extraida_historica,
      qnu.classificacao_normativa,
      qnu.por_que_desatualizada,
      qnu.fundamento_juridico_atual,
      qnu.nova_regra_estado_atual,
      qnu.gabarito_atualizado_provavel,
      qnu.observacao_enunciado_literal,
      qnu.mudanca_gabarito,
      qnu.recomendacao,
      qnu.nivel_seguranca,
      qnu.fonte_base,
      qnu.review_status,
      qnu.raw_json,
      COALESCE(
        json_agg(
          json_build_object(
            'letter', a.letter,
            'position', a.position,
            'text', a.text,
            'html', a.html
          )
          ORDER BY a.position
        ) FILTER (WHERE a.letter IS NOT NULL),
        '[]'::json
      ) AS alternatives
    FROM question_normative_updates qnu
    JOIN questions q ON q.id_question = qnu.question_id
    LEFT JOIN comments c ON c.question_id = q.id_question
    LEFT JOIN alternatives a ON a.question_id = q.id_question
    LEFT JOIN question_normative_teaching_comments qntc
      ON qntc.question_id = q.id_question
      AND qntc.generator_version = ${GENERATOR_VERSION}
    WHERE (${force} OR qntc.id IS NULL)
    GROUP BY
      q.id_question,
      c.html_local,
      c.html,
      c.text,
      c.extracted_answer,
      c.professor,
      qnu.question_id,
      qnu.source_file,
      qnu.source_version,
      qnu.gabarito_banco,
      qnu.resposta_extraida_historica,
      qnu.classificacao_normativa,
      qnu.por_que_desatualizada,
      qnu.fundamento_juridico_atual,
      qnu.nova_regra_estado_atual,
      qnu.gabarito_atualizado_provavel,
      qnu.observacao_enunciado_literal,
      qnu.mudanca_gabarito,
      qnu.recomendacao,
      qnu.nivel_seguranca,
      qnu.fonte_base,
      qnu.review_status,
      qnu.raw_json
    ORDER BY qnu.question_id
    LIMIT ${limit}
  `;
}

function normalizeRecord(row) {
  return {
    question: {
      id_question: row.id_question,
      statement_text: row.statement_text || '',
      statement_html: row.statement_html || '',
      type_question: row.type_question || '',
      materia: row.materia || '',
      assunto: row.assunto || '',
      banca: row.banca || '',
      concurso_ano: row.concurso_ano || ''
    },
    alternatives: row.alternatives || [],
    comment: {
      html: row.comment_html || '',
      text: row.comment_text || '',
      extracted_answer: row.comment_extracted_answer || '',
      professor: row.professor || ''
    },
    normativeUpdate: {
      question_id: row.question_id,
      source_file: row.source_file || '',
      source_version: row.source_version || '',
      gabarito_banco: row.gabarito_banco || '',
      resposta_extraida_historica: row.resposta_extraida_historica || '',
      classificacao_normativa: row.classificacao_normativa || '',
      por_que_desatualizada: row.por_que_desatualizada || '',
      fundamento_juridico_atual: row.fundamento_juridico_atual || '',
      nova_regra_estado_atual: row.nova_regra_estado_atual || '',
      gabarito_atualizado_provavel: row.gabarito_atualizado_provavel || '',
      observacao_enunciado_literal: row.observacao_enunciado_literal || '',
      mudanca_gabarito: row.mudanca_gabarito || '',
      recomendacao: row.recomendacao || '',
      nivel_seguranca: row.nivel_seguranca || '',
      fonte_base: row.fonte_base || '',
      review_status: row.review_status || 'pending',
      raw_json: row.raw_json || ''
    }
  };
}

async function generateWithOpenAI(record, { model }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY nao definido.');
  }

  const prompt = buildGenerationPrompt(record);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ],
      text: {
        format: { type: 'json_object' }
      }
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }

  const outputText = body.output_text
    || (body.output || [])
      .flatMap((item) => item.content || [])
      .map((item) => item.text || '')
      .join('\n');
  return extractJsonObject(outputText);
}

async function upsertTeachingComment(sql, record, payload, { provider, model }) {
  await sql`
    INSERT INTO question_normative_teaching_comments (
      question_id,
      normative_update_id,
      source_type,
      generator_model,
      generator_version,
      generated_at,
      historical_answer,
      current_answer,
      current_answer_label,
      current_answer_confidence,
      answer_changed,
      answer_policy,
      adaptation_status,
      study_recommendation,
      safety_level,
      adapted_statement,
      short_explanation,
      teaching_comment_md,
      teaching_comment_html,
      legal_basis,
      current_rule_summary,
      why_outdated,
      literal_statement_warning,
      alternatives_analysis_json,
      source_normative_json,
      raw_generation_json,
      updated_at
    )
    VALUES (
      ${record.question.id_question},
      ${record.normativeUpdate.question_id},
      ${provider === 'openai' ? 'ai_normative' : 'template_normative'},
      ${model || provider},
      ${GENERATOR_VERSION},
      NOW(),
      ${payload.historical_answer || null},
      ${payload.current_answer || null},
      ${payload.current_answer_label || null},
      ${payload.current_answer_confidence ?? null},
      ${payload.answer_changed},
      ${payload.answer_policy},
      ${payload.adaptation_status},
      ${payload.study_recommendation},
      ${payload.safety_level || null},
      ${payload.adapted_statement || null},
      ${payload.short_explanation || null},
      ${payload.teaching_comment_md || null},
      ${payload.teaching_comment_html || null},
      ${payload.legal_basis || null},
      ${payload.current_rule_summary || null},
      ${payload.why_outdated || null},
      ${payload.literal_statement_warning || null},
      ${sql.json(payload.alternatives_analysis_json || [])},
      ${sql.json(payload.source_normative_json || {})},
      ${sql.json(payload.raw_generation_json || {})},
      NOW()
    )
    ON CONFLICT (question_id, generator_version) DO UPDATE SET
      normative_update_id = excluded.normative_update_id,
      source_type = excluded.source_type,
      generator_model = excluded.generator_model,
      generated_at = excluded.generated_at,
      historical_answer = excluded.historical_answer,
      current_answer = excluded.current_answer,
      current_answer_label = excluded.current_answer_label,
      current_answer_confidence = excluded.current_answer_confidence,
      answer_changed = excluded.answer_changed,
      answer_policy = excluded.answer_policy,
      adaptation_status = excluded.adaptation_status,
      study_recommendation = excluded.study_recommendation,
      safety_level = excluded.safety_level,
      adapted_statement = excluded.adapted_statement,
      short_explanation = excluded.short_explanation,
      teaching_comment_md = excluded.teaching_comment_md,
      teaching_comment_html = excluded.teaching_comment_html,
      legal_basis = excluded.legal_basis,
      current_rule_summary = excluded.current_rule_summary,
      why_outdated = excluded.why_outdated,
      literal_statement_warning = excluded.literal_statement_warning,
      alternatives_analysis_json = excluded.alternatives_analysis_json,
      source_normative_json = excluded.source_normative_json,
      raw_generation_json = excluded.raw_generation_json,
      updated_at = excluded.updated_at
  `;
}

function renderReport(report) {
  return [
    `Comentarios normativos processados: ${report.generated}`,
    `Gravados: ${report.written}`,
    `Dry-run: ${report.dryRun ? 'sim' : 'nao'}`,
    `Resposta atual invalida/ausente: ${report.invalidCurrentAnswer}`,
    report.errors.length ? `Erros: ${report.errors.length}` : 'Erros: 0',
    report.samples.length ? `Amostras: ${JSON.stringify(report.samples, null, 2)}` : ''
  ].filter(Boolean).join('\n');
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
