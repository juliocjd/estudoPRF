#!/usr/bin/env node
import pg from 'pg';
import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_QBANK_PATH,
  EXPECTED_COUNTS,
  ORIGIN_LABEL,
  QBANK_VERSION,
  SOURCE_LABEL,
  buildCommentHtml,
  buildCommentText,
  loadManifest,
  loadQbank,
  normalizeQbankItem,
  validateQbankPackage
} from './contran-prf-unpublished-qbank-utils.mjs';
import { loadEnvFiles, redactDatabaseUrl } from './lib/env.mjs';

const { Client } = pg;

loadEnvFiles();

const args = parseArgs(process.argv.slice(2));
const file = args.file || DEFAULT_QBANK_PATH;
const manifestFile = args.manifest || DEFAULT_MANIFEST_PATH;
const dryRun = Boolean(args['dry-run']);
const validateOnly = Boolean(args['validate-only']);
const databaseUrl = args['database-url'] || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL ausente.' }, null, 2));
  process.exit(1);
}

const rawItems = loadQbank(file);
const manifest = loadManifest(manifestFile);
const packageValidation = validateQbankPackage(rawItems, manifest);
if (!packageValidation.ok) {
  console.error(JSON.stringify({
    ok: false,
    stage: 'package_validation',
    file,
    errors: packageValidation.errors,
    warnings: packageValidation.warnings
  }, null, 2));
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 30000,
  query_timeout: 120000,
  statement_timeout: 120000
});

try {
  await client.connect();
  if (validateOnly) {
    const imported = await validateImportedQbank(client);
    console.log(JSON.stringify({
      ok: imported.ok,
      client: 'postgres',
      databaseUrl: redactDatabaseUrl(databaseUrl),
      imported
    }, null, 2));
    if (!imported.ok) process.exit(1);
  } else {
    const report = await importQbankToPostgres(client, rawItems, { dryRun });
    console.log(JSON.stringify({
      ok: true,
      client: 'postgres',
      databaseUrl: redactDatabaseUrl(databaseUrl),
      packageValidation,
      import: report
    }, null, 2));
    if (report.validation && !report.validation.ok) process.exit(1);
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    client: 'postgres',
    databaseUrl: redactDatabaseUrl(databaseUrl),
    error: error.message,
    report: error.report || null
  }, null, 2));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

async function importQbankToPostgres(client, items, options = {}) {
  const normalizedItems = items.map((item, index) => normalizeQbankItem(item, index));
  const report = {
    dryRun: Boolean(options.dryRun),
    sourceVersion: QBANK_VERSION,
    batchId: QBANK_VERSION,
    inserted: 0,
    updated: 0,
    profileMappings: null,
    validation: null
  };

  await ensureSchema(client);
  await client.query('BEGIN');
  try {
    const existingResult = await client.query(
      'SELECT external_id FROM contran_prf_unpublished_questions WHERE external_id = ANY($1::text[])',
      [normalizedItems.map((item) => item.externalId)]
    );
    const existingIds = new Set(existingResult.rows.map((row) => row.external_id));

    await upsertQuestionsBulk(client, normalizedItems);
    await upsertAlternativesBulk(client, normalizedItems);
    await upsertCommentsBulk(client, normalizedItems);
    await upsertMetadataBulk(client, normalizedItems);

    report.updated = normalizedItems.filter((item) => existingIds.has(item.externalId)).length;
    report.inserted = normalizedItems.length - report.updated;

    report.profileMappings = await seedProfileMappings(client);
    report.validation = await validateImportedQbank(client);

    if (report.dryRun) await client.query('ROLLBACK');
    else await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    error.report = report;
    throw error;
  }
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id_question integer PRIMARY KEY,
      url text,
      statement_html text,
      statement_text text,
      statement_hash text,
      content_hash text,
      type_question text,
      format_question text,
      banca text,
      banca_url text,
      orgao_sigla text,
      orgao_nome text,
      orgao_url text,
      cargo text,
      concurso_id integer,
      concurso_ano integer,
      concurso_url text,
      materia_id integer,
      materia text,
      assunto_id integer,
      assunto text,
      assunto_url text,
      capitulo integer,
      anulada integer DEFAULT 0,
      desatualizada integer DEFAULT 0,
      possui_comentario integer DEFAULT 0,
      possui_comentario_video integer DEFAULT 0,
      possui_comentario_ia integer DEFAULT 0,
      possui_resolucao_banca integer DEFAULT 0,
      raw_json text,
      collected_at timestamptz,
      updated_at timestamptz,
      official_answer text,
      official_answer_source text
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS alternatives (
      question_id integer NOT NULL,
      position integer NOT NULL,
      letter text NOT NULL,
      html text,
      text text,
      PRIMARY KEY (question_id, position)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS comments (
      question_id integer PRIMARY KEY,
      html text,
      html_local text,
      text text,
      professor text,
      date_text text,
      extracted_answer text,
      raw_json text,
      checked_at timestamptz,
      source_type text
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS contran_prf_unpublished_questions (
      question_id integer PRIMARY KEY,
      external_id text NOT NULL UNIQUE,
      statement text NOT NULL,
      statement_hash text NOT NULL,
      question_type text NOT NULL,
      alternatives text,
      correct_answer text NOT NULL,
      explanation text,
      historical_explanation text,
      beginner_explanation text,
      trap_explanation text,
      current_resolution text,
      historical_resolution text,
      topic text,
      subtopic text,
      axis text,
      difficulty text,
      source_normative_reference text,
      source_url text,
      additional_source_urls text,
      teacher_comment text,
      alternative_explanations text,
      is_unpublished integer NOT NULL DEFAULT 1,
      is_official integer NOT NULL DEFAULT 0,
      origin text NOT NULL,
      exam_board text,
      exam_year integer,
      official_exam integer NOT NULL DEFAULT 0,
      source text,
      tags text,
      data_base_normativa text,
      revisar_se_alteracao_normativa integer,
      banco_version text,
      batch_id text,
      audit_version text,
      status_auditoria text,
      validacao_normativa text,
      active integer NOT NULL DEFAULT 1,
      visible integer NOT NULL DEFAULT 1,
      deprecated integer NOT NULL DEFAULT 0,
      superseded_by_batch_id text,
      deprecated_at timestamptz,
      raw_json text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp
    )
  `);

  const columns = [
    ['questions', 'official_answer', 'text'],
    ['questions', 'official_answer_source', 'text'],
    ['comments', 'html_local', 'text'],
    ['comments', 'source_type', 'text'],
    ['contran_prf_unpublished_questions', 'teacher_comment', 'text'],
    ['contran_prf_unpublished_questions', 'alternative_explanations', 'text'],
    ['contran_prf_unpublished_questions', 'is_official', 'integer NOT NULL DEFAULT 0'],
    ['contran_prf_unpublished_questions', 'batch_id', 'text'],
    ['contran_prf_unpublished_questions', 'active', 'integer NOT NULL DEFAULT 1'],
    ['contran_prf_unpublished_questions', 'visible', 'integer NOT NULL DEFAULT 1'],
    ['contran_prf_unpublished_questions', 'deprecated', 'integer NOT NULL DEFAULT 0'],
    ['contran_prf_unpublished_questions', 'superseded_by_batch_id', 'text'],
    ['contran_prf_unpublished_questions', 'deprecated_at', 'timestamptz']
  ];
  for (const [tableName, columnName, definition] of columns) {
    await client.query(`ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN IF NOT EXISTS ${quoteIdent(columnName)} ${definition}`);
  }

  await client.query('CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_statement_hash ON contran_prf_unpublished_questions(statement_hash)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_resolution ON contran_prf_unpublished_questions(current_resolution)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_axis ON contran_prf_unpublished_questions(axis)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_topic ON contran_prf_unpublished_questions(topic, subtopic)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_type_difficulty ON contran_prf_unpublished_questions(question_type, difficulty)');
}

async function upsertQuestionsBulk(client, items) {
  const rows = items.map((item) => ({
    id_question: item.questionId,
    url: `contran-prf-ineditas://${item.externalId}`,
    statement_html: `<p>${escapeHtml(item.statement)}</p>`,
    statement_text: item.statement,
    statement_hash: item.statementHash,
    content_hash: item.contentHash,
    type_question: item.questionType,
    format_question: item.questionType,
    banca: 'INEDITA',
    orgao_sigla: 'PRF',
    orgao_nome: 'Policia Rodoviaria Federal',
    cargo: 'Treino PRF/CONTRAN',
    materia: item.materia,
    assunto: item.assunto,
    raw_json: JSON.stringify(item.rawJson)
  }));
  await client.query(`
    WITH payload AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        id_question integer,
        url text,
        statement_html text,
        statement_text text,
        statement_hash text,
        content_hash text,
        type_question text,
        format_question text,
        banca text,
        orgao_sigla text,
        orgao_nome text,
        cargo text,
        materia text,
        assunto text,
        raw_json text
      )
    )
    INSERT INTO questions (
      id_question, url, statement_html, statement_text, statement_hash, content_hash,
      type_question, format_question, banca, orgao_sigla, orgao_nome, cargo,
      concurso_id, concurso_ano, materia, assunto, anulada, desatualizada,
      possui_comentario, possui_comentario_video, possui_comentario_ia,
      possui_resolucao_banca, raw_json, collected_at, updated_at,
      official_answer, official_answer_source
    )
    SELECT
      id_question, url, statement_html, statement_text, statement_hash, content_hash,
      type_question, format_question, banca, orgao_sigla, orgao_nome, cargo,
      NULL, NULL, materia, assunto, 0, 0, 1, 0, 0, 0,
      raw_json, current_timestamp, current_timestamp, NULL, NULL
    FROM payload
    ON CONFLICT (id_question) DO UPDATE SET
      url = excluded.url,
      statement_html = excluded.statement_html,
      statement_text = excluded.statement_text,
      statement_hash = excluded.statement_hash,
      content_hash = excluded.content_hash,
      type_question = excluded.type_question,
      format_question = excluded.format_question,
      banca = excluded.banca,
      orgao_sigla = excluded.orgao_sigla,
      orgao_nome = excluded.orgao_nome,
      cargo = excluded.cargo,
      concurso_id = NULL,
      concurso_ano = NULL,
      materia = excluded.materia,
      assunto = excluded.assunto,
      anulada = 0,
      desatualizada = 0,
      possui_comentario = 1,
      raw_json = excluded.raw_json,
      updated_at = current_timestamp,
      official_answer = NULL,
      official_answer_source = NULL
  `, [JSON.stringify(rows)]);
}

async function upsertAlternativesBulk(client, items) {
  const questionIds = items.map((item) => item.questionId);
  const rows = items.flatMap((item) => item.alternatives.map((alternative) => ({
    question_id: item.questionId,
    position: alternative.position,
    letter: alternative.letter,
    html: `<p>${escapeHtml(alternative.text)}</p>`,
    text: alternative.text
  })));
  await client.query('DELETE FROM alternatives WHERE question_id = ANY($1::int[])', [questionIds]);
  await client.query(`
    WITH payload AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        question_id integer,
        position integer,
        letter text,
        html text,
        text text
      )
    )
    INSERT INTO alternatives (question_id, position, letter, html, text)
    SELECT question_id, position, letter, html, text
    FROM payload
  `, [JSON.stringify(rows)]);
}

async function upsertCommentsBulk(client, items) {
  const rows = items.map((item) => {
    const commentHtml = buildCommentHtml(item);
    return {
      question_id: item.questionId,
      html: commentHtml,
      html_local: commentHtml,
      text: buildCommentText(item),
      professor: 'Banco inedito PRF/CONTRAN',
      date_text: item.dataBaseNormativa,
      extracted_answer: item.correctAnswer,
      raw_json: JSON.stringify(item.rawJson),
      source_type: 'contran_prf_unpublished_v5'
    };
  });
  await client.query(`
    WITH payload AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        question_id integer,
        html text,
        html_local text,
        text text,
        professor text,
        date_text text,
        extracted_answer text,
        raw_json text,
        source_type text
      )
    )
    INSERT INTO comments (
      question_id, html, html_local, text, professor, date_text, extracted_answer,
      raw_json, checked_at, source_type
    )
    SELECT question_id, html, html_local, text, professor, date_text, extracted_answer,
      raw_json, current_timestamp, source_type
    FROM payload
    ON CONFLICT (question_id) DO UPDATE SET
      html = excluded.html,
      html_local = excluded.html_local,
      text = excluded.text,
      professor = excluded.professor,
      date_text = excluded.date_text,
      extracted_answer = excluded.extracted_answer,
      raw_json = excluded.raw_json,
      checked_at = current_timestamp,
      source_type = excluded.source_type
  `, [JSON.stringify(rows)]);
}

async function upsertMetadataBulk(client, items) {
  const rows = items.map((item) => ({
    question_id: item.questionId,
    external_id: item.externalId,
    statement: item.statement,
    statement_hash: item.statementHash,
    question_type: item.questionType,
    alternatives: JSON.stringify(item.rawAlternatives),
    correct_answer: item.correctAnswer,
    explanation: item.explanation,
    historical_explanation: item.historicalExplanation,
    beginner_explanation: item.beginnerExplanation,
    trap_explanation: item.trapExplanation,
    current_resolution: item.currentResolution,
    historical_resolution: item.historicalResolution,
    topic: item.topic,
    subtopic: item.subtopic,
    axis: item.axis,
    difficulty: item.difficulty,
    source_normative_reference: item.sourceNormativeReference,
    source_url: item.sourceUrl,
    additional_source_urls: JSON.stringify(item.additionalSourceUrls),
    teacher_comment: item.teacherComment,
    alternative_explanations: JSON.stringify(item.alternativeExplanations),
    origin: ORIGIN_LABEL,
    exam_board: item.examBoard,
    source: SOURCE_LABEL,
    tags: item.tags,
    data_base_normativa: item.dataBaseNormativa,
    revisar_se_alteracao_normativa: item.reviewOnNormativeChange ? 1 : 0,
    banco_version: item.bankVersion,
    batch_id: item.batchId,
    audit_version: item.auditVersion,
    status_auditoria: item.auditStatus,
    validacao_normativa: item.normativeValidation,
    raw_json: JSON.stringify(item.rawJson)
  }));
  await client.query(`
    WITH payload AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        question_id integer,
        external_id text,
        statement text,
        statement_hash text,
        question_type text,
        alternatives text,
        correct_answer text,
        explanation text,
        historical_explanation text,
        beginner_explanation text,
        trap_explanation text,
        current_resolution text,
        historical_resolution text,
        topic text,
        subtopic text,
        axis text,
        difficulty text,
        source_normative_reference text,
        source_url text,
        additional_source_urls text,
        teacher_comment text,
        alternative_explanations text,
        origin text,
        exam_board text,
        source text,
        tags text,
        data_base_normativa text,
        revisar_se_alteracao_normativa integer,
        banco_version text,
        batch_id text,
        audit_version text,
        status_auditoria text,
        validacao_normativa text,
        raw_json text
      )
    )
    INSERT INTO contran_prf_unpublished_questions (
      question_id, external_id, statement, statement_hash, question_type, alternatives,
      correct_answer, explanation, historical_explanation, beginner_explanation,
      trap_explanation, current_resolution, historical_resolution, topic, subtopic,
      axis, difficulty, source_normative_reference, source_url, additional_source_urls,
      teacher_comment, alternative_explanations, is_unpublished, is_official, origin,
      exam_board, exam_year, official_exam, source, tags, data_base_normativa,
      revisar_se_alteracao_normativa, banco_version, batch_id, audit_version,
      status_auditoria, validacao_normativa, active, visible, deprecated, superseded_by_batch_id,
      deprecated_at, raw_json, updated_at
    )
    SELECT
      question_id, external_id, statement, statement_hash, question_type, alternatives,
      correct_answer, explanation, historical_explanation, beginner_explanation,
      trap_explanation, current_resolution, historical_resolution, topic, subtopic,
      axis, difficulty, source_normative_reference, source_url, additional_source_urls,
      teacher_comment, alternative_explanations, 1, 0, origin,
      exam_board, NULL, 0, source, tags, data_base_normativa,
      revisar_se_alteracao_normativa, banco_version, batch_id, audit_version,
      status_auditoria, validacao_normativa, 1, 1, 0, NULL,
      NULL, raw_json, current_timestamp
    FROM payload
    ON CONFLICT (external_id) DO UPDATE SET
      question_id = excluded.question_id,
      statement = excluded.statement,
      statement_hash = excluded.statement_hash,
      question_type = excluded.question_type,
      alternatives = excluded.alternatives,
      correct_answer = excluded.correct_answer,
      explanation = excluded.explanation,
      historical_explanation = excluded.historical_explanation,
      beginner_explanation = excluded.beginner_explanation,
      trap_explanation = excluded.trap_explanation,
      current_resolution = excluded.current_resolution,
      historical_resolution = excluded.historical_resolution,
      topic = excluded.topic,
      subtopic = excluded.subtopic,
      axis = excluded.axis,
      difficulty = excluded.difficulty,
      source_normative_reference = excluded.source_normative_reference,
      source_url = excluded.source_url,
      additional_source_urls = excluded.additional_source_urls,
      teacher_comment = excluded.teacher_comment,
      alternative_explanations = excluded.alternative_explanations,
      is_unpublished = 1,
      is_official = 0,
      origin = excluded.origin,
      exam_board = excluded.exam_board,
      exam_year = NULL,
      official_exam = 0,
      source = excluded.source,
      tags = excluded.tags,
      data_base_normativa = excluded.data_base_normativa,
      revisar_se_alteracao_normativa = excluded.revisar_se_alteracao_normativa,
      banco_version = excluded.banco_version,
      batch_id = excluded.batch_id,
      audit_version = excluded.audit_version,
      status_auditoria = excluded.status_auditoria,
      validacao_normativa = excluded.validacao_normativa,
      active = 1,
      visible = 1,
      deprecated = 0,
      superseded_by_batch_id = NULL,
      deprecated_at = NULL,
      raw_json = excluded.raw_json,
      updated_at = current_timestamp
  `, [JSON.stringify(rows)]);
}

async function upsertQuestion(client, item) {
  await client.query(`
    INSERT INTO questions (
      id_question, url, statement_html, statement_text, statement_hash, content_hash,
      type_question, format_question, banca, orgao_sigla, orgao_nome, cargo,
      concurso_id, concurso_ano, materia, assunto, anulada, desatualizada,
      possui_comentario, possui_comentario_video, possui_comentario_ia,
      possui_resolucao_banca, raw_json, collected_at, updated_at,
      official_answer, official_answer_source
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, NULL, $13, $14, 0, 0, 1, 0, 0, 0, $15, current_timestamp, current_timestamp, NULL, NULL)
    ON CONFLICT (id_question) DO UPDATE SET
      url = excluded.url,
      statement_html = excluded.statement_html,
      statement_text = excluded.statement_text,
      statement_hash = excluded.statement_hash,
      content_hash = excluded.content_hash,
      type_question = excluded.type_question,
      format_question = excluded.format_question,
      banca = excluded.banca,
      orgao_sigla = excluded.orgao_sigla,
      orgao_nome = excluded.orgao_nome,
      cargo = excluded.cargo,
      concurso_id = NULL,
      concurso_ano = NULL,
      materia = excluded.materia,
      assunto = excluded.assunto,
      anulada = 0,
      desatualizada = 0,
      possui_comentario = 1,
      raw_json = excluded.raw_json,
      updated_at = current_timestamp,
      official_answer = NULL,
      official_answer_source = NULL
  `, [
    item.questionId,
    `contran-prf-ineditas://${item.externalId}`,
    `<p>${escapeHtml(item.statement)}</p>`,
    item.statement,
    item.statementHash,
    item.contentHash,
    item.questionType,
    item.questionType,
    'INEDITA',
    'PRF',
    'Policia Rodoviaria Federal',
    'Treino PRF/CONTRAN',
    item.materia,
    item.assunto,
    JSON.stringify(item.rawJson)
  ]);
}

async function upsertAlternatives(client, item) {
  await client.query('DELETE FROM alternatives WHERE question_id = $1', [item.questionId]);
  for (const alternative of item.alternatives) {
    await client.query(
      'INSERT INTO alternatives (question_id, position, letter, html, text) VALUES ($1, $2, $3, $4, $5)',
      [item.questionId, alternative.position, alternative.letter, `<p>${escapeHtml(alternative.text)}</p>`, alternative.text]
    );
  }
}

async function upsertComment(client, item) {
  const commentHtml = buildCommentHtml(item);
  await client.query(`
    INSERT INTO comments (
      question_id, html, html_local, text, professor, date_text, extracted_answer,
      raw_json, checked_at, source_type
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, current_timestamp, $9)
    ON CONFLICT (question_id) DO UPDATE SET
      html = excluded.html,
      html_local = excluded.html_local,
      text = excluded.text,
      professor = excluded.professor,
      date_text = excluded.date_text,
      extracted_answer = excluded.extracted_answer,
      raw_json = excluded.raw_json,
      checked_at = current_timestamp,
      source_type = excluded.source_type
  `, [
    item.questionId,
    commentHtml,
    commentHtml,
    buildCommentText(item),
    'Banco inedito PRF/CONTRAN',
    item.dataBaseNormativa,
    item.correctAnswer,
    JSON.stringify(item.rawJson),
    'contran_prf_unpublished_v5'
  ]);
}

async function upsertMetadata(client, item) {
  await client.query(`
    INSERT INTO contran_prf_unpublished_questions (
      question_id, external_id, statement, statement_hash, question_type, alternatives,
      correct_answer, explanation, historical_explanation, beginner_explanation,
      trap_explanation, current_resolution, historical_resolution, topic, subtopic,
      axis, difficulty, source_normative_reference, source_url, additional_source_urls,
      teacher_comment, alternative_explanations, is_unpublished, is_official, origin,
      exam_board, exam_year, official_exam, source, tags, data_base_normativa,
      revisar_se_alteracao_normativa, banco_version, batch_id, audit_version,
      status_auditoria, validacao_normativa, active, visible, deprecated, superseded_by_batch_id,
      deprecated_at, raw_json, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, 1, 0, $23, $24, NULL, 0, $25, $26,
      $27, $28, $29, $30, $31, $32, $33, 1, 1, 0,
      NULL, NULL, $34, current_timestamp
    )
    ON CONFLICT (external_id) DO UPDATE SET
      question_id = excluded.question_id,
      statement = excluded.statement,
      statement_hash = excluded.statement_hash,
      question_type = excluded.question_type,
      alternatives = excluded.alternatives,
      correct_answer = excluded.correct_answer,
      explanation = excluded.explanation,
      historical_explanation = excluded.historical_explanation,
      beginner_explanation = excluded.beginner_explanation,
      trap_explanation = excluded.trap_explanation,
      current_resolution = excluded.current_resolution,
      historical_resolution = excluded.historical_resolution,
      topic = excluded.topic,
      subtopic = excluded.subtopic,
      axis = excluded.axis,
      difficulty = excluded.difficulty,
      source_normative_reference = excluded.source_normative_reference,
      source_url = excluded.source_url,
      additional_source_urls = excluded.additional_source_urls,
      teacher_comment = excluded.teacher_comment,
      alternative_explanations = excluded.alternative_explanations,
      is_unpublished = 1,
      is_official = 0,
      origin = excluded.origin,
      exam_board = excluded.exam_board,
      exam_year = NULL,
      official_exam = 0,
      source = excluded.source,
      tags = excluded.tags,
      data_base_normativa = excluded.data_base_normativa,
      revisar_se_alteracao_normativa = excluded.revisar_se_alteracao_normativa,
      banco_version = excluded.banco_version,
      batch_id = excluded.batch_id,
      audit_version = excluded.audit_version,
      status_auditoria = excluded.status_auditoria,
      validacao_normativa = excluded.validacao_normativa,
      active = 1,
      visible = 1,
      deprecated = 0,
      superseded_by_batch_id = NULL,
      deprecated_at = NULL,
      raw_json = excluded.raw_json,
      updated_at = current_timestamp
  `, [
    item.questionId,
    item.externalId,
    item.statement,
    item.statementHash,
    item.questionType,
    JSON.stringify(item.rawAlternatives),
    item.correctAnswer,
    item.explanation,
    item.historicalExplanation,
    item.beginnerExplanation,
    item.trapExplanation,
    item.currentResolution,
    item.historicalResolution,
    item.topic,
    item.subtopic,
    item.axis,
    item.difficulty,
    item.sourceNormativeReference,
    item.sourceUrl,
    JSON.stringify(item.additionalSourceUrls),
    item.teacherComment,
    JSON.stringify(item.alternativeExplanations),
    ORIGIN_LABEL,
    item.examBoard,
    SOURCE_LABEL,
    item.tags,
    item.dataBaseNormativa,
    item.reviewOnNormativeChange ? 1 : 0,
    item.bankVersion,
    item.batchId,
    item.auditVersion,
    item.auditStatus,
    item.normativeValidation,
    JSON.stringify(item.rawJson)
  ]);
}

async function seedProfileMappings(client) {
  const report = {
    available: false,
    profiles: 0,
    rows: 0,
    source: 'contran_prf_unpublished_v5_profile_mapping'
  };
  if (!await hasTable(client, 'question_exam_subjects') || !await hasTable(client, 'exam_subject_weights')) {
    report.reason = 'tabelas de perfil de prova ausentes';
    return report;
  }

  const result = await client.query(`
    SELECT profile_id, subject_key, subject_label, block_key
    FROM exam_subject_weights
    WHERE lower(COALESCE(subject_key, '')) LIKE '%transito%'
       OR lower(COALESCE(subject_label, '')) LIKE '%transito%'
    ORDER BY profile_id, expected_pct DESC, expected_items DESC, subject_key
  `);
  const byProfile = new Map();
  for (const row of result.rows) {
    if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, row);
  }

  for (const row of byProfile.values()) {
    const inserted = await client.query(`
      INSERT INTO question_exam_subjects (
        question_id, profile_id, subject_key, subject_label, block_key, confidence, source
      )
      SELECT question_id, $1, $2, $3, $4, 1, $5
      FROM contran_prf_unpublished_questions
      WHERE batch_id = $6
        AND is_unpublished = 1
        AND active = 1
        AND visible = 1
        AND deprecated = 0
      ON CONFLICT (question_id, profile_id, subject_key) DO UPDATE SET
        subject_label = excluded.subject_label,
        block_key = excluded.block_key,
        confidence = excluded.confidence,
        source = excluded.source
    `, [row.profile_id, row.subject_key, row.subject_label, row.block_key || '', report.source, QBANK_VERSION]);
    report.profiles += 1;
    report.rows += Number(inserted.rowCount || 0);
  }

  report.available = true;
  return report;
}

async function validateImportedQbank(client) {
  const errors = [];
  if (!await hasTable(client, 'contran_prf_unpublished_questions')) {
    return {
      ok: false,
      errors: ['tabela contran_prf_unpublished_questions ausente'],
      counts: { total: 0, certoErrado: 0, multiplaEscolha: 0 }
    };
  }

  const countResult = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN question_type = 'CERTO_ERRADO' THEN 1 ELSE 0 END)::int AS ce,
      SUM(CASE WHEN question_type = 'MULTIPLA_ESCOLHA' THEN 1 ELSE 0 END)::int AS me,
      SUM(CASE WHEN is_unpublished = 1 THEN 1 ELSE 0 END)::int AS unpublished,
      SUM(CASE WHEN is_official = 0 THEN 1 ELSE 0 END)::int AS non_official_flag,
      SUM(CASE WHEN COALESCE(correct_answer, '') != '' THEN 1 ELSE 0 END)::int AS with_answer,
      SUM(CASE WHEN COALESCE(teacher_comment, explanation, '') != '' THEN 1 ELSE 0 END)::int AS with_teacher_comment,
      SUM(CASE WHEN exam_year IS NULL THEN 1 ELSE 0 END)::int AS no_exam_year,
      SUM(CASE WHEN official_exam = 0 THEN 1 ELSE 0 END)::int AS non_official,
      SUM(CASE WHEN COALESCE(exam_board, '') IN ('', 'INEDITA', 'INEDITA_ESTILO_CEBRASPE') THEN 1 ELSE 0 END)::int AS non_official_board
    FROM contran_prf_unpublished_questions
    WHERE batch_id = $1 AND active = 1 AND visible = 1 AND deprecated = 0
  `, [QBANK_VERSION]);
  const counts = countResult.rows[0] || {};
  const total = Number(counts.total || 0);
  if (total !== EXPECTED_COUNTS.total) errors.push(`total esperado ${EXPECTED_COUNTS.total}, recebido ${total}`);
  if (Number(counts.ce || 0) !== EXPECTED_COUNTS.CERTO_ERRADO) errors.push(`C/E importadas: ${counts.ce || 0}`);
  if (Number(counts.me || 0) !== EXPECTED_COUNTS.MULTIPLA_ESCOLHA) errors.push(`multipla escolha importadas: ${counts.me || 0}`);

  for (const [key, value] of Object.entries({
    unpublished: counts.unpublished,
    non_official_flag: counts.non_official_flag,
    with_answer: counts.with_answer,
    with_teacher_comment: counts.with_teacher_comment,
    no_exam_year: counts.no_exam_year,
    non_official: counts.non_official,
    non_official_board: counts.non_official_board
  })) {
    if (Number(value || 0) !== EXPECTED_COUNTS.total) {
      errors.push(`${key} esperado ${EXPECTED_COUNTS.total}, recebido ${Number(value || 0)}`);
    }
  }

  const invalidCe = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM contran_prf_unpublished_questions
    WHERE batch_id = $1
      AND question_type = 'CERTO_ERRADO'
      AND correct_answer NOT IN ('C', 'E')
  `, [QBANK_VERSION]);
  if (Number(invalidCe.rows[0]?.n || 0)) errors.push(`C/E com gabarito invalido: ${invalidCe.rows[0].n}`);

  const invalidMe = await client.query(`
    SELECT external_id, alternatives, correct_answer
    FROM contran_prf_unpublished_questions
    WHERE batch_id = $1 AND question_type = 'MULTIPLA_ESCOLHA'
  `, [QBANK_VERSION]);
  const invalidMeRows = invalidMe.rows.filter((row) => {
    const alternatives = safeJson(row.alternatives, {});
    return Object.keys(alternatives).sort().join('') !== 'ABCDE'
      || !['A', 'B', 'C', 'D', 'E'].includes(String(row.correct_answer || ''));
  });
  if (invalidMeRows.length) {
    errors.push(`multipla escolha invalidas: ${invalidMeRows.map((row) => row.external_id).slice(0, 5).join(', ')}`);
  }

  const invalidMeComments = await client.query(`
    SELECT external_id, alternative_explanations
    FROM contran_prf_unpublished_questions
    WHERE batch_id = $1 AND question_type = 'MULTIPLA_ESCOLHA'
  `, [QBANK_VERSION]);
  const invalidMeCommentRows = invalidMeComments.rows.filter((row) => {
    const explanations = safeJson(row.alternative_explanations, {});
    return Object.keys(explanations).sort().join('') !== 'ABCDE';
  });
  if (invalidMeCommentRows.length) {
    errors.push(`multipla escolha sem justificativa A-E: ${invalidMeCommentRows.map((row) => row.external_id).slice(0, 5).join(', ')}`);
  }

  const duplicateExternal = await client.query(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT external_id FROM contran_prf_unpublished_questions GROUP BY external_id HAVING COUNT(*) > 1
    ) duplicates
  `);
  if (Number(duplicateExternal.rows[0]?.n || 0)) errors.push(`external_id duplicado no banco: ${duplicateExternal.rows[0].n}`);

  const duplicateHash = await client.query(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT statement_hash FROM contran_prf_unpublished_questions GROUP BY statement_hash HAVING COUNT(*) > 1
    ) duplicates
  `);
  if (Number(duplicateHash.rows[0]?.n || 0)) errors.push(`hash de enunciado duplicado no banco: ${duplicateHash.rows[0].n}`);

  const missingQuestionRows = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM contran_prf_unpublished_questions cq
    LEFT JOIN questions q ON q.id_question = cq.question_id
    WHERE q.id_question IS NULL
  `);
  if (Number(missingQuestionRows.rows[0]?.n || 0)) {
    errors.push(`metadados sem questions correspondente: ${missingQuestionRows.rows[0].n}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      total,
      certoErrado: Number(counts.ce || 0),
      multiplaEscolha: Number(counts.me || 0)
    }
  };
}

async function hasTable(client, tableName) {
  const result = await client.query(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = $1
    LIMIT 1
  `, [tableName]);
  return result.rowCount > 0;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    parsed[key] = next && !next.startsWith('--') ? next : true;
    if (parsed[key] === next) index += 1;
  }
  return parsed;
}
