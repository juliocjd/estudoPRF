import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_QBANK_PATH = path.join(
  ROOT_DIR,
  'data',
  'contran_prf_unpublished_v5',
  'contran_prf_questoes_ineditas_v5_refeito_do_zero.jsonl'
);
export const DEFAULT_MANIFEST_PATH = path.join(
  ROOT_DIR,
  'data',
  'contran_prf_unpublished_v5',
  'manifest_banco_questoes_contran_prf_v5_refeito_do_zero.json'
);

export const QBANK_VERSION = 'CONTRAN_PRF_V5_REFEITO_DO_ZERO_2026_06';
export const USER_BADGE = 'Questão inédita - elaborada para treino PRF/CONTRAN';
export const USER_NOTICE = 'Questão inédita - elaborada para treino PRF/CONTRAN. Não é questão oficial de concurso.';
export const SOURCE_LABEL = 'Banco inédito PRF/CONTRAN V5 refeito do zero';
export const ORIGIN_LABEL = 'Questão inédita - elaborada para treino PRF/CONTRAN';
export const QUESTION_ID_BASE = 905000000;

export const EXPECTED_COUNTS = {
  total: 413,
  CERTO_ERRADO: 324,
  MULTIPLA_ESCOLHA: 89
};

const REQUIRED_RESOLUTIONS = [
  '945/2022', '882/2021', '938/2022', '525/2015', '798/2020', '909/2022',
  '918/2022', '985/2022', '723/2018', '900/2022', '920/2022', '960/2022',
  '969/2022', '970/2022', '993/2023', '819/2021', '432/2013', '1004/2023',
  '809/2020', '940/2022', '943/2022', '955/2022', '1014/2025'
];

const REQUIRED_AXES = [
  'Carga, peso, dimensoes e amarracao',
  'Tacografo e jornada do motorista',
  'Fiscalizacao eletronica, autuacao e processo administrativo',
  'Equipamentos, identificacao e seguranca veicular',
  'Temas de pegadinha e revisao final'
];

export function openSqliteDatabase(dbPath = path.join(ROOT_DIR, 'questoes-prf.sqlite')) {
  return new DatabaseSync(path.resolve(dbPath));
}

export function loadQbank(filePath = DEFAULT_QBANK_PATH) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (filePath.endsWith('.jsonl')) {
    return trimmed.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`JSONL invalido na linha ${index + 1}: ${error.message}`);
      }
    });
  }

  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.questions)) return parsed.questions;
  if (Array.isArray(parsed.questoes)) return parsed.questoes;
  throw new Error(`Formato de banco nao reconhecido: ${filePath}`);
}

export function loadManifest(filePath = DEFAULT_MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function validateQbankPackage(items, manifest = null) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const statementHashes = new Set();
  const counts = {
    total: items.length,
    CERTO_ERRADO: 0,
    MULTIPLA_ESCOLHA: 0
  };
  const byResolution = new Map();
  const byAxis = new Map();
  const forbiddenStatus = /(^|\b)(oficial|prova_real|questao_cebraspe_original|past_exam|prova anterior)(\b|$)/i;

  if (items.length !== EXPECTED_COUNTS.total) {
    errors.push(`total esperado ${EXPECTED_COUNTS.total}, recebido ${items.length}`);
  }

  for (const [index, item] of items.entries()) {
    const label = item.id || `linha ${index + 1}`;
    const type = String(item.tipo || item.question_type || '').trim();
    if (type === 'CERTO_ERRADO') counts.CERTO_ERRADO += 1;
    if (type === 'MULTIPLA_ESCOLHA') counts.MULTIPLA_ESCOLHA += 1;
    if (!['CERTO_ERRADO', 'MULTIPLA_ESCOLHA'].includes(type)) {
      errors.push(`${label}: tipo invalido: ${type || '(vazio)'}`);
    }

    const externalId = String(item.external_id || item.id || '').trim();
    if (!externalId) errors.push(`${label}: external_id/id ausente`);
    if (externalId && ids.has(externalId)) errors.push(`${label}: external_id duplicado`);
    if (externalId) ids.add(externalId);

    const statement = String(item.enunciado || item.statement || '').trim();
    if (!statement) {
      errors.push(`${label}: enunciado ausente`);
    } else {
      const hash = statementHash(statement);
      if (statementHashes.has(hash)) errors.push(`${label}: enunciado duplicado`);
      statementHashes.add(hash);
    }

    const answer = String(item.gabarito || item.correct_answer || '').trim().toUpperCase();
    if (!answer) errors.push(`${label}: gabarito ausente`);
    if (type === 'CERTO_ERRADO' && !['C', 'E'].includes(answer)) {
      errors.push(`${label}: gabarito C/E invalido: ${answer}`);
    }
    if (type === 'MULTIPLA_ESCOLHA') {
      if (!['A', 'B', 'C', 'D', 'E'].includes(answer)) {
        errors.push(`${label}: gabarito multipla escolha invalido: ${answer}`);
      }
      const alternatives = parseAlternatives(item.alternatives || item.alternativas_json);
      const letters = Object.keys(alternatives).sort().join('');
      if (letters !== 'ABCDE') {
        errors.push(`${label}: alternativas A-E ausentes ou invalidas (${letters || 'vazio'})`);
      }
      const alternativeExplanations = extractAlternativeExplanations(
        String(item.teacher_comment || item.explicacao_historica || item.explanation || '')
      );
      const explanationLetters = Object.keys(alternativeExplanations).sort().join('');
      if (explanationLetters !== 'ABCDE') {
        errors.push(`${label}: comentario de multipla escolha sem justificativa A-E (${explanationLetters || 'vazio'})`);
      }
    }

    if (!String(item.teacher_comment || item.explicacao_historica || item.explanation || '').trim()) {
      errors.push(`${label}: comentario do professor ausente`);
    }
    if (item.questao_inedita !== true && item.is_unpublished !== true) {
      errors.push(`${label}: questao_inedita/is_unpublished nao esta true`);
    }
    if ('exibir_aviso_questao_inedita' in item && item.exibir_aviso_questao_inedita !== true) {
      errors.push(`${label}: exibir_aviso_questao_inedita nao esta true`);
    }
    if (!containsUnpublishedBadge(item.selo_usuario) && !containsUnpublishedBadge(item.aviso_usuario)) {
      errors.push(`${label}: selo/aviso de inedita ausente`);
    }

    const officialMarkers = [
      item.status,
      item.origem,
      item.origin,
      item.exam_board,
      item.exam_year,
      item.official_exam,
      item.is_official
    ].map((value) => String(value ?? '')).join(' ');
    if (forbiddenStatus.test(officialMarkers)) {
      errors.push(`${label}: marcado como oficial/prova anterior em metadados de origem`);
    }
    if (item.is_official === true || item.official_exam === true) {
      errors.push(`${label}: is_official/official_exam true`);
    }

    increment(byResolution, normalizeResolutionKey(item.current_resolution || item.resolucao_atual || item.resolution || ''));
    increment(byAxis, normalizeText(item.axis || item.eixo_prioritario || ''));
  }

  if (counts.CERTO_ERRADO !== EXPECTED_COUNTS.CERTO_ERRADO) {
    errors.push(`total C/E esperado ${EXPECTED_COUNTS.CERTO_ERRADO}, recebido ${counts.CERTO_ERRADO}`);
  }
  if (counts.MULTIPLA_ESCOLHA !== EXPECTED_COUNTS.MULTIPLA_ESCOLHA) {
    errors.push(`total multipla escolha esperado ${EXPECTED_COUNTS.MULTIPLA_ESCOLHA}, recebido ${counts.MULTIPLA_ESCOLHA}`);
  }

  for (const resolution of REQUIRED_RESOLUTIONS) {
    if (!byResolution.has(normalizeResolutionKey(resolution))) errors.push(`resolucao esperada ausente: ${resolution}`);
  }
  for (const axis of REQUIRED_AXES) {
    if (!byAxis.has(normalizeText(axis))) errors.push(`eixo esperado ausente: ${axis}`);
  }

  const manifestMeta = manifest?.metadata || manifest || {};
  const manifestTotal = manifestMeta.total_questoes || manifestMeta.total;
  if (manifestTotal && Number(manifestTotal) !== items.length) {
    errors.push(`manifest total=${manifestTotal}, mas pacote tem ${items.length}`);
  }
  const manifestVersion = manifestMeta.versao || manifestMeta.batch_id;
  if (manifestVersion && manifestVersion !== QBANK_VERSION) {
    warnings.push(`versao/batch_id do manifest diferente da esperada: ${manifestVersion}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts,
    ids: ids.size,
    statementHashes: statementHashes.size,
    resolutions: Object.fromEntries([...byResolution.entries()].sort()),
    axes: Object.fromEntries([...byAxis.entries()].sort())
  };
}

export function ensureContranPrfUnpublishedSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id_question INTEGER PRIMARY KEY,
      url TEXT,
      statement_html TEXT,
      statement_text TEXT,
      statement_hash TEXT,
      content_hash TEXT,
      type_question TEXT,
      format_question TEXT,
      banca TEXT,
      banca_url TEXT,
      orgao_sigla TEXT,
      orgao_nome TEXT,
      orgao_url TEXT,
      cargo TEXT,
      concurso_id INTEGER,
      concurso_ano INTEGER,
      concurso_url TEXT,
      materia_id INTEGER,
      materia TEXT,
      assunto_id INTEGER,
      assunto TEXT,
      assunto_url TEXT,
      capitulo INTEGER,
      anulada INTEGER,
      desatualizada INTEGER,
      possui_comentario INTEGER,
      possui_comentario_video INTEGER,
      possui_comentario_ia INTEGER,
      possui_resolucao_banca INTEGER,
      raw_json TEXT,
      collected_at TEXT,
      updated_at TEXT,
      official_answer TEXT,
      official_answer_source TEXT
    );

    CREATE TABLE IF NOT EXISTS alternatives (
      question_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      letter TEXT NOT NULL,
      html TEXT,
      text TEXT,
      PRIMARY KEY (question_id, position)
    );

    CREATE TABLE IF NOT EXISTS comments (
      question_id INTEGER PRIMARY KEY,
      html TEXT,
      html_local TEXT,
      text TEXT,
      professor TEXT,
      date_text TEXT,
      extracted_answer TEXT,
      raw_json TEXT,
      checked_at TEXT,
      source_type TEXT
    );

    CREATE TABLE IF NOT EXISTS contran_prf_unpublished_questions (
      question_id INTEGER PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      statement TEXT NOT NULL,
      statement_hash TEXT NOT NULL,
      question_type TEXT NOT NULL CHECK (question_type IN ('CERTO_ERRADO', 'MULTIPLA_ESCOLHA')),
      alternatives TEXT,
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      historical_explanation TEXT,
      beginner_explanation TEXT,
      trap_explanation TEXT,
      current_resolution TEXT,
      historical_resolution TEXT,
      topic TEXT,
      subtopic TEXT,
      axis TEXT,
      difficulty TEXT,
      source_normative_reference TEXT,
      source_url TEXT,
      additional_source_urls TEXT,
      teacher_comment TEXT,
      alternative_explanations TEXT,
      is_unpublished INTEGER NOT NULL DEFAULT 1,
      is_official INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL,
      exam_board TEXT,
      exam_year INTEGER,
      official_exam INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      tags TEXT,
      data_base_normativa TEXT,
      revisar_se_alteracao_normativa INTEGER,
      banco_version TEXT,
      batch_id TEXT,
      audit_version TEXT,
      status_auditoria TEXT,
      validacao_normativa TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      visible INTEGER NOT NULL DEFAULT 1,
      deprecated INTEGER NOT NULL DEFAULT 0,
      superseded_by_batch_id TEXT,
      deprecated_at TEXT,
      raw_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contran_prf_unpublished_import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_label TEXT NOT NULL,
      source_file TEXT NOT NULL,
      source_version TEXT,
      dry_run INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'started',
      inserted INTEGER NOT NULL DEFAULT 0,
      updated INTEGER NOT NULL DEFAULT 0,
      ignored INTEGER NOT NULL DEFAULT 0,
      errors_json TEXT NOT NULL DEFAULT '[]',
      report_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_statement_hash
      ON contran_prf_unpublished_questions(statement_hash);
    CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_resolution
      ON contran_prf_unpublished_questions(current_resolution);
    CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_axis
      ON contran_prf_unpublished_questions(axis);
    CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_topic
      ON contran_prf_unpublished_questions(topic, subtopic);
    CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_type_difficulty
      ON contran_prf_unpublished_questions(question_type, difficulty);
    CREATE INDEX IF NOT EXISTS idx_questions_materia_assunto
      ON questions(materia, assunto);
    CREATE INDEX IF NOT EXISTS idx_questions_statement_hash
      ON questions(statement_hash);
  `);

  ensureColumn(db, 'questions', 'official_answer', 'TEXT');
  ensureColumn(db, 'questions', 'official_answer_source', 'TEXT');
  ensureColumn(db, 'comments', 'html_local', 'TEXT');
  ensureColumn(db, 'comments', 'source_type', 'TEXT');
  ensureColumn(db, 'contran_prf_unpublished_questions', 'teacher_comment', 'TEXT');
  ensureColumn(db, 'contran_prf_unpublished_questions', 'alternative_explanations', 'TEXT');
  ensureColumn(db, 'contran_prf_unpublished_questions', 'is_official', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'contran_prf_unpublished_questions', 'batch_id', 'TEXT');
  ensureColumn(db, 'contran_prf_unpublished_questions', 'active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'contran_prf_unpublished_questions', 'visible', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db, 'contran_prf_unpublished_questions', 'deprecated', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'contran_prf_unpublished_questions', 'superseded_by_batch_id', 'TEXT');
  ensureColumn(db, 'contran_prf_unpublished_questions', 'deprecated_at', 'TEXT');
}

export function importQbankToSqlite(db, items, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const sourceFile = path.resolve(options.sourceFile || DEFAULT_QBANK_PATH);
  const report = {
    dryRun,
    sourceFile: path.relative(ROOT_DIR, sourceFile),
    sourceVersion: QBANK_VERSION,
    batchId: QBANK_VERSION,
    inserted: 0,
    updated: 0,
    ignored: 0,
    profileMappings: null,
    errors: []
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    ensureContranPrfUnpublishedSchema(db);
    const runId = db.prepare(`
      INSERT INTO contran_prf_unpublished_import_runs (run_label, source_file, source_version, dry_run, status)
      VALUES (?, ?, ?, ?, 'started')
    `).run(`contran-prf-unpublished-${QBANK_VERSION}`, report.sourceFile, QBANK_VERSION, dryRun ? 1 : 0).lastInsertRowid;

    const selectExisting = db.prepare('SELECT question_id FROM contran_prf_unpublished_questions WHERE external_id = ?');
    const upsertQuestion = db.prepare(`
      INSERT INTO questions (
        id_question, url, statement_html, statement_text, statement_hash, content_hash,
        type_question, format_question, banca, orgao_sigla, orgao_nome, cargo,
        concurso_id, concurso_ano, materia, assunto, anulada, desatualizada,
        possui_comentario, possui_comentario_video, possui_comentario_ia,
        possui_resolucao_banca, raw_json, collected_at, updated_at,
        official_answer, official_answer_source
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 0, 0, 1, 0, 0, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL)
      ON CONFLICT(id_question) DO UPDATE SET
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
        updated_at = CURRENT_TIMESTAMP,
        official_answer = NULL,
        official_answer_source = NULL
    `);
    const deleteAlternatives = db.prepare('DELETE FROM alternatives WHERE question_id = ?');
    const insertAlternative = db.prepare(`
      INSERT INTO alternatives (question_id, position, letter, html, text)
      VALUES (?, ?, ?, ?, ?)
    `);
    const upsertComment = db.prepare(`
      INSERT INTO comments (
        question_id, html, html_local, text, professor, date_text, extracted_answer,
        raw_json, checked_at, source_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(question_id) DO UPDATE SET
        html = excluded.html,
        html_local = excluded.html_local,
        text = excluded.text,
        professor = excluded.professor,
        date_text = excluded.date_text,
        extracted_answer = excluded.extracted_answer,
        raw_json = excluded.raw_json,
        checked_at = CURRENT_TIMESTAMP,
        source_type = excluded.source_type
    `);
    const upsertMetadata = db.prepare(`
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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?,
        ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, NULL, NULL, ?, CURRENT_TIMESTAMP
      )
      ON CONFLICT(external_id) DO UPDATE SET
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
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const [index, rawItem] of items.entries()) {
      const item = normalizeQbankItem(rawItem, index);
      const existed = Boolean(selectExisting.get(item.externalId));

      upsertQuestion.run(
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
      );

      deleteAlternatives.run(item.questionId);
      for (const alternative of item.alternatives) {
        insertAlternative.run(
          item.questionId,
          alternative.position,
          alternative.letter,
          `<p>${escapeHtml(alternative.text)}</p>`,
          alternative.text
        );
      }

      upsertComment.run(
        item.questionId,
        buildCommentHtml(item),
        buildCommentHtml(item),
        buildCommentText(item),
        'Banco inédito PRF/CONTRAN',
        item.dataBaseNormativa,
        item.correctAnswer,
        JSON.stringify(item.rawJson),
        'contran_prf_unpublished_v5'
      );

      upsertMetadata.run(
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
      );

      if (existed) report.updated += 1;
      else report.inserted += 1;
    }

    report.profileMappings = seedContranPrfUnpublishedProfileMappings(db);

    const dbValidation = validateImportedQbank(db);
    report.validation = dbValidation;
    if (!dbValidation.ok) {
      report.errors.push(...dbValidation.errors);
      throw new Error(`Importacao invalida: ${dbValidation.errors.join('; ')}`);
    }

    db.prepare(`
      UPDATE contran_prf_unpublished_import_runs
      SET status = ?, inserted = ?, updated = ?, ignored = ?, errors_json = ?,
        report_json = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      dryRun ? 'dry_run' : 'ok',
      report.inserted,
      report.updated,
      report.ignored,
      JSON.stringify(report.errors),
      JSON.stringify(report),
      runId
    );

    if (dryRun) db.exec('ROLLBACK');
    else db.exec('COMMIT');
    return report;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    error.report = report;
    throw error;
  }
}

export function validateImportedQbank(db) {
  ensureContranPrfUnpublishedSchema(db);
  const errors = [];
  const one = (sql, ...params) => db.prepare(sql).get(...params);
  const total = one(`
    SELECT COUNT(*) AS n
    FROM contran_prf_unpublished_questions
    WHERE batch_id = ? AND is_unpublished = 1 AND active = 1 AND visible = 1 AND deprecated = 0
  `, QBANK_VERSION).n;
  if (total !== EXPECTED_COUNTS.total) errors.push(`total importado esperado ${EXPECTED_COUNTS.total}, recebido ${total}`);

  const counts = one(`
    SELECT
      SUM(CASE WHEN question_type = 'CERTO_ERRADO' THEN 1 ELSE 0 END) AS ce,
      SUM(CASE WHEN question_type = 'MULTIPLA_ESCOLHA' THEN 1 ELSE 0 END) AS me,
      SUM(CASE WHEN is_unpublished = 1 THEN 1 ELSE 0 END) AS unpublished,
      SUM(CASE WHEN is_official = 0 THEN 1 ELSE 0 END) AS non_official_flag,
      SUM(CASE WHEN COALESCE(correct_answer, '') != '' THEN 1 ELSE 0 END) AS with_answer,
      SUM(CASE WHEN COALESCE(teacher_comment, explanation, '') != '' THEN 1 ELSE 0 END) AS with_teacher_comment,
      SUM(CASE WHEN exam_year IS NULL THEN 1 ELSE 0 END) AS no_exam_year,
      SUM(CASE WHEN official_exam = 0 THEN 1 ELSE 0 END) AS non_official,
      SUM(CASE WHEN COALESCE(exam_board, '') IN ('', 'INEDITA', 'INEDITA_ESTILO_CEBRASPE') THEN 1 ELSE 0 END) AS non_official_board
    FROM contran_prf_unpublished_questions
    WHERE batch_id = ? AND active = 1 AND visible = 1 AND deprecated = 0
  `, QBANK_VERSION);
  if (counts.ce !== EXPECTED_COUNTS.CERTO_ERRADO) errors.push(`C/E importadas: ${counts.ce}`);
  if (counts.me !== EXPECTED_COUNTS.MULTIPLA_ESCOLHA) errors.push(`multipla escolha importadas: ${counts.me}`);
  for (const [key, value] of Object.entries({
    unpublished: counts.unpublished,
    non_official_flag: counts.non_official_flag,
    with_answer: counts.with_answer,
    with_teacher_comment: counts.with_teacher_comment,
    no_exam_year: counts.no_exam_year,
    non_official: counts.non_official,
    non_official_board: counts.non_official_board
  })) {
    if (value !== EXPECTED_COUNTS.total) errors.push(`${key} esperado ${EXPECTED_COUNTS.total}, recebido ${value}`);
  }

  const invalidCe = one(`
    SELECT COUNT(*) AS n
    FROM contran_prf_unpublished_questions
    WHERE batch_id = ?
      AND question_type = 'CERTO_ERRADO'
      AND correct_answer NOT IN ('C', 'E')
  `, QBANK_VERSION).n;
  if (invalidCe) errors.push(`C/E com gabarito invalido: ${invalidCe}`);

  const invalidMe = db.prepare(`
    SELECT external_id, alternatives, correct_answer
    FROM contran_prf_unpublished_questions
    WHERE batch_id = ? AND question_type = 'MULTIPLA_ESCOLHA'
  `).all(QBANK_VERSION).filter((row) => {
    const alternatives = safeJson(row.alternatives, {});
    return Object.keys(alternatives).sort().join('') !== 'ABCDE'
      || !['A', 'B', 'C', 'D', 'E'].includes(String(row.correct_answer || ''));
  });
  if (invalidMe.length) errors.push(`multipla escolha invalidas: ${invalidMe.map((row) => row.external_id).slice(0, 5).join(', ')}`);

  const invalidMeComments = db.prepare(`
    SELECT external_id, alternative_explanations
    FROM contran_prf_unpublished_questions
    WHERE batch_id = ? AND question_type = 'MULTIPLA_ESCOLHA'
  `).all(QBANK_VERSION).filter((row) => {
    const explanations = safeJson(row.alternative_explanations, {});
    return Object.keys(explanations).sort().join('') !== 'ABCDE';
  });
  if (invalidMeComments.length) {
    errors.push(`multipla escolha sem justificativa A-E: ${invalidMeComments.map((row) => row.external_id).slice(0, 5).join(', ')}`);
  }

  const visibleDeprecated = one(`
    SELECT COUNT(*) AS n
    FROM contran_prf_unpublished_questions
    WHERE COALESCE(deprecated, 0) = 1
      AND (COALESCE(active, 1) = 1 OR COALESCE(visible, 1) = 1)
  `).n;
  if (visibleDeprecated) errors.push(`lotes deprecated ainda visiveis/ativos: ${visibleDeprecated}`);

  const duplicateExternal = one(`
    SELECT COUNT(*) AS n FROM (
      SELECT external_id FROM contran_prf_unpublished_questions GROUP BY external_id HAVING COUNT(*) > 1
    )
  `).n;
  if (duplicateExternal) errors.push(`external_id duplicado no banco: ${duplicateExternal}`);

  const duplicateHash = one(`
    SELECT COUNT(*) AS n FROM (
      SELECT statement_hash FROM contran_prf_unpublished_questions GROUP BY statement_hash HAVING COUNT(*) > 1
    )
  `).n;
  if (duplicateHash) errors.push(`hash de enunciado duplicado no banco: ${duplicateHash}`);

  const missingQuestionRows = one(`
    SELECT COUNT(*) AS n
    FROM contran_prf_unpublished_questions cq
    LEFT JOIN questions q ON q.id_question = cq.question_id
    WHERE q.id_question IS NULL
  `).n;
  if (missingQuestionRows) errors.push(`metadados sem questions correspondente: ${missingQuestionRows}`);

  if (tableExists(db, 'question_exam_subjects') && tableExists(db, 'exam_subject_weights')) {
    const trafficProfiles = one(`
      SELECT COUNT(DISTINCT profile_id) AS n
      FROM exam_subject_weights
      WHERE lower(COALESCE(subject_key, '')) LIKE '%transito%'
         OR lower(COALESCE(subject_label, '')) LIKE '%transito%'
    `).n || 0;
    const missingProfileMappings = one(`
      SELECT COUNT(*) AS n
      FROM contran_prf_unpublished_questions cq
      WHERE cq.batch_id = ?
        AND cq.active = 1
        AND cq.visible = 1
        AND cq.deprecated = 0
        AND (
          SELECT COUNT(DISTINCT qes.profile_id)
          FROM question_exam_subjects qes
          WHERE qes.question_id = cq.question_id
        ) < ?
    `, QBANK_VERSION, trafficProfiles).n || 0;
    if (trafficProfiles && missingProfileMappings) {
      errors.push(`questoes V5 sem mapeamento completo para perfis PRF: ${missingProfileMappings}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      total,
      certoErrado: counts.ce || 0,
      multiplaEscolha: counts.me || 0
    }
  };
}

export function seedContranPrfUnpublishedProfileMappings(db, options = {}) {
  const batchId = String(options.batchId || QBANK_VERSION);
  const source = String(options.source || 'contran_prf_unpublished_v5_profile_mapping');
  const report = {
    available: false,
    profiles: 0,
    rows: 0,
    source
  };

  if (!tableExists(db, 'question_exam_subjects') || !tableExists(db, 'exam_subject_weights')) {
    report.reason = 'tabelas de perfil de prova ausentes';
    return report;
  }

  const rows = db.prepare(`
    SELECT profile_id, subject_key, subject_label, block_key
    FROM exam_subject_weights
    WHERE lower(COALESCE(subject_key, '')) LIKE '%transito%'
       OR lower(COALESCE(subject_label, '')) LIKE '%transito%'
    ORDER BY profile_id, expected_pct DESC, expected_items DESC, subject_key
  `).all();
  const byProfile = new Map();
  for (const row of rows) {
    if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, row);
  }

  const insert = db.prepare(`
    INSERT INTO question_exam_subjects (
      question_id, profile_id, subject_key, subject_label, block_key, confidence, source
    )
    SELECT
      question_id,
      ?,
      ?,
      ?,
      ?,
      1,
      ?
    FROM contran_prf_unpublished_questions
    WHERE batch_id = ?
      AND is_unpublished = 1
      AND active = 1
      AND visible = 1
      AND deprecated = 0
    ON CONFLICT(question_id, profile_id, subject_key) DO UPDATE SET
      subject_label = excluded.subject_label,
      block_key = excluded.block_key,
      confidence = excluded.confidence,
      source = excluded.source
  `);

  for (const row of byProfile.values()) {
    const result = insert.run(
      row.profile_id,
      row.subject_key,
      row.subject_label,
      row.block_key || '',
      source,
      batchId
    );
    report.profiles += 1;
    report.rows += Number(result.changes || 0);
  }

  report.available = true;
  return report;
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

export function rollbackPreviousContranPrfUnpublishedBatches(db, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const supersededBy = options.supersededBy || QBANK_VERSION;
  const report = {
    dryRun,
    supersededBy,
    matched: 0,
    removed: 0,
    deprecated: 0,
    preservedByAnswers: 0,
    ignored: 0,
    errors: []
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    ensureContranPrfUnpublishedSchema(db);
    const rows = db.prepare(`
      SELECT question_id, external_id, batch_id, banco_version, source, origin
      FROM contran_prf_unpublished_questions
      WHERE COALESCE(batch_id, banco_version, '') != ?
        AND (
          UPPER(COALESCE(batch_id, '')) LIKE '%V3%'
          OR UPPER(COALESCE(batch_id, '')) LIKE '%V4%'
          OR LOWER(COALESCE(banco_version, '')) LIKE 'v3%'
          OR LOWER(COALESCE(banco_version, '')) LIKE 'v4%'
          OR external_id LIKE 'CONTRAN_PRF_INEDITA_%'
          OR external_id LIKE 'CONTRAN_PRF_V3%'
          OR external_id LIKE 'CONTRAN_PRF_V4%'
          OR LOWER(COALESCE(source, '')) LIKE '%v3%'
          OR LOWER(COALESCE(origin, '')) LIKE '%v3%'
          OR LOWER(COALESCE(source, '')) LIKE '%v4%'
          OR LOWER(COALESCE(origin, '')) LIKE '%v4%'
        )
    `).all(supersededBy);
    report.matched = rows.length;

    const hasAnswer = db.prepare(`
      SELECT
        EXISTS(SELECT 1 FROM study_answers WHERE question_id = ?) AS study_answers,
        EXISTS(SELECT 1 FROM exam_simulation_items WHERE question_id = ? AND COALESCE(answer_letter, '') != '') AS exam_answers
    `);
    const markDeprecated = db.prepare(`
      UPDATE contran_prf_unpublished_questions
      SET deprecated = 1,
          active = 0,
          visible = 0,
          superseded_by_batch_id = ?,
          deprecated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE question_id = ?
    `);
    const deleteMetadata = db.prepare('DELETE FROM contran_prf_unpublished_questions WHERE question_id = ?');
    const deleteAlternatives = db.prepare('DELETE FROM alternatives WHERE question_id = ?');
    const deleteComments = db.prepare('DELETE FROM comments WHERE question_id = ?');
    const deleteStudyStatus = db.prepare('DELETE FROM question_study_status WHERE question_id = ?');
    const deleteQuestion = db.prepare('DELETE FROM questions WHERE id_question = ?');

    for (const row of rows) {
      const answerStatus = hasAnswer.get(row.question_id, row.question_id);
      const hasUserAnswers = Boolean(answerStatus?.study_answers || answerStatus?.exam_answers);
      if (hasUserAnswers) {
        markDeprecated.run(supersededBy, row.question_id);
        report.deprecated += 1;
        report.preservedByAnswers += 1;
      } else {
        deleteAlternatives.run(row.question_id);
        deleteComments.run(row.question_id);
        deleteStudyStatus.run(row.question_id);
        deleteMetadata.run(row.question_id);
        deleteQuestion.run(row.question_id);
        report.removed += 1;
      }
    }

    if (dryRun) db.exec('ROLLBACK');
    else db.exec('COMMIT');
    return report;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    report.errors.push(error.message);
    error.report = report;
    throw error;
  }
}

export function normalizeQbankItem(rawItem, index = 0) {
  const externalId = String(rawItem.external_id || rawItem.id || '').trim();
  const order = Number(rawItem.ordem_global_v5 || rawItem.ordem_global || rawItem.ordem_estudo || index + 1);
  const questionId = QUESTION_ID_BASE + order;
  const statement = String(rawItem.statement || rawItem.enunciado || '').trim();
  const questionType = String(rawItem.question_type || rawItem.tipo || '').trim();
  const rawAlternatives = parseAlternatives(rawItem.alternatives || rawItem.alternativas_json);
  const correctAnswer = String(rawItem.correct_answer || rawItem.gabarito || '').trim().toUpperCase();
  const teacherComment = String(rawItem.teacher_comment || rawItem.explicacao_historica || rawItem.explanation || '').trim();
  const alternativeExplanations = questionType === 'MULTIPLA_ESCOLHA'
    ? extractAlternativeExplanations(teacherComment)
    : {};
  const alternatives = questionType === 'CERTO_ERRADO'
    ? [
        { position: 1, letter: 'A', text: 'Certo' },
        { position: 2, letter: 'B', text: 'Errado' }
      ]
    : ['A', 'B', 'C', 'D', 'E'].map((letter, position) => ({
        position: position + 1,
        letter,
        text: String(rawAlternatives[letter] || '').trim()
      }));
  const normalizedRaw = {
    ...rawItem,
    is_unpublished: true,
    is_official: false,
    origin: ORIGIN_LABEL,
    exam_board: rawItem.exam_board || 'INEDITA_ESTILO_CEBRASPE',
    exam_year: null,
    official_exam: false,
    source: SOURCE_LABEL
  };
  const tags = normalizeTags(rawItem.tags);
  const currentResolution = String(rawItem.current_resolution || rawItem.resolucao_atual || rawItem.resolution || '').trim();
  const topic = String(rawItem.topic || rawItem.tema || '').trim();
  const subtopic = String(rawItem.subtopic || rawItem.subtema || '').trim();

  return {
    rawJson: normalizedRaw,
    externalId,
    questionId,
    statement,
    statementHash: statementHash(statement),
    contentHash: sha256([
      statement,
      questionType,
      JSON.stringify(rawAlternatives),
      correctAnswer
    ].join('\n')),
    questionType,
    rawAlternatives,
    alternatives,
    correctAnswer,
    explanation: String(rawItem.explanation || rawItem.comentario_gabarito || teacherComment).trim(),
    historicalExplanation: '',
    teacherComment,
    alternativeExplanations,
    beginnerExplanation: String(rawItem.beginner_explanation || rawItem.explicacao_para_iniciante || rawItem.como_estudar_para_prf || '').trim(),
    trapExplanation: String(rawItem.trap_explanation || rawItem.pegadinha_principal || '').trim(),
    currentResolution,
    historicalResolution: String(rawItem.historical_resolution || rawItem.resolucao_historica_equivalente || '').trim(),
    topic,
    subtopic,
    axis: String(rawItem.axis || rawItem.eixo_prioritario || '').trim(),
    difficulty: String(rawItem.difficulty || rawItem.nivel || '').trim(),
    sourceNormativeReference: String(rawItem.source_normative_reference || rawItem.fundamento_normativo || rawItem.titulo_norma || '').trim(),
    sourceUrl: String(rawItem.fonte_url || '').trim(),
    additionalSourceUrls: Array.isArray(rawItem.fonte_url_adicional)
      ? rawItem.fonte_url_adicional
      : String(rawItem.fonte_url_adicional || '').split(/[;\n]/).map((value) => value.trim()).filter(Boolean),
    tags: tags.join(';'),
    materia: String(rawItem.materia || 'Legislacao de Transito').trim(),
    assunto: [currentResolution, topic, subtopic].filter(Boolean).join(' - '),
    dataBaseNormativa: String(rawItem.data_base_normativa || '').trim(),
    reviewOnNormativeChange: Boolean(rawItem.revisar_se_alteracao_normativa),
    bankVersion: String(rawItem.batch_id || rawItem.versao_banco || rawItem.versao_revisao || QBANK_VERSION).trim(),
    batchId: String(rawItem.batch_id || QBANK_VERSION).trim(),
    auditVersion: String(rawItem.audit_version || rawItem.versao_revisao || rawItem.batch_id || QBANK_VERSION).trim(),
    auditStatus: String(rawItem.status_auditoria || rawItem.auditoria_normativa_status || '').trim(),
    normativeValidation: String(rawItem.validacao_normativa || '').trim(),
    examBoard: String(rawItem.exam_board || 'INEDITA_ESTILO_CEBRASPE').trim()
  };
}

function buildCommentHtml(item) {
  const sections = [
    ['Aviso ao aluno', USER_NOTICE],
    ['Comentário do professor', item.teacherComment || item.explanation],
    item.questionType === 'MULTIPLA_ESCOLHA' && Object.keys(item.alternativeExplanations || {}).length
      ? ['Justificativa das alternativas', alternativeExplanationsHtml(item.alternativeExplanations)]
      : null,
    ['Explicação para iniciante', item.beginnerExplanation],
    ['Pegadinha principal', item.trapExplanation],
    ['Fundamento normativo', item.sourceNormativeReference],
    ['Resolução atual', item.currentResolution],
    ['Resolução histórica/equivalente', item.historicalResolution],
    ['Fonte oficial', item.sourceUrl],
    ['Fontes adicionais', item.additionalSourceUrls.join('\n')]
  ].filter(Boolean).filter(([, value]) => String(value || '').trim());

  return sections.map(([title, value]) => `
    <section>
      <h3>${escapeHtml(title)}</h3>
      ${String(value || '').startsWith('<') ? value : paragraphs(value)}
    </section>
  `.trim()).join('\n');
}

function buildCommentText(item) {
  return [
    USER_NOTICE,
    `Gabarito: ${item.correctAnswer}`,
    (item.teacherComment || item.explanation) && `Comentário do professor: ${item.teacherComment || item.explanation}`,
    item.questionType === 'MULTIPLA_ESCOLHA' && Object.keys(item.alternativeExplanations || {}).length
      ? `Justificativa das alternativas:\n${Object.entries(item.alternativeExplanations).map(([letter, text]) => `${letter}) ${text}`).join('\n')}`
      : '',
    item.beginnerExplanation && `Explicação para iniciante: ${item.beginnerExplanation}`,
    item.trapExplanation && `Pegadinha principal: ${item.trapExplanation}`,
    item.sourceNormativeReference && `Fundamento normativo: ${item.sourceNormativeReference}`,
    item.sourceUrl && `Fonte oficial: ${item.sourceUrl}`,
    item.additionalSourceUrls.length && `Fontes adicionais: ${item.additionalSourceUrls.join('; ')}`
  ].filter(Boolean).join('\n\n');
}

function alternativeExplanationsHtml(explanations = {}) {
  const rows = ['A', 'B', 'C', 'D', 'E']
    .filter((letter) => explanations[letter])
    .map((letter) => `<li><strong>${letter})</strong> ${escapeHtml(explanations[letter])}</li>`);
  return rows.length ? `<ol class="alternative-explanations">${rows.join('\n')}</ol>` : '';
}

function parseAlternatives(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeTags(raw) {
  if (Array.isArray(raw)) return raw.map((value) => String(value || '').trim()).filter(Boolean);
  return String(raw || '').split(/[;\n]/).map((value) => value.trim()).filter(Boolean);
}

function containsUnpublishedBadge(value) {
  const normalized = normalizeText(value);
  return normalized.includes('questao inedita') && normalized.includes('treino prf/contran');
}

function extractAlternativeExplanations(comment) {
  const text = String(comment || '').replace(/\s+/g, ' ').trim();
  const result = {};
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1);
    const pattern = letter === 'E'
      ? new RegExp(`${letter}\\)\\s*(.+?)(?:Estrat[eé]gia\\s+Cebraspe:|$)`, 'i')
      : new RegExp(`${letter}\\)\\s*(.+?)(?=\\s+${nextLetter}\\)\\s+)`, 'i');
    const match = text.match(pattern);
    if (match?.[1]) result[letter] = match[1].trim();
  }
  return result;
}

function normalizeResolutionKey(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(\d{3,4})\s*\/\s*(\d{4})/);
  return match ? `${match[1]}/${match[2]}` : raw;
}

function statementHash(statement) {
  return sha256(normalizeText(statement).replace(/\s+/g, ' '));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function paragraphs(value) {
  return String(value || '').split(/\n{2,}/).map((part) => `<p>${escapeHtml(part.trim())}</p>`).join('\n');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return false;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  return true;
}
