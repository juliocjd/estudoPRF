import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createBackup, migrateNormativeUpdates } from './migrate-normative-updates.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
const jsonPath = path.resolve(ROOT_DIR, args.json || 'data/analise_atualizacao_questoes_transito.json');
const sourceVersion = normalizeNullable(args['source-version']) || 'manual';
const reportPath = args.report ? path.resolve(ROOT_DIR, args.report) : '';

if (!fs.existsSync(dbPath)) {
  throw new Error(`Banco nao encontrado: ${dbPath}`);
}
if (!fs.existsSync(jsonPath)) {
  throw new Error(`JSON nao encontrado: ${jsonPath}`);
}

const db = new DatabaseSync(dbPath);

try {
  if (!tableExists(db, 'question_normative_updates')) {
    console.log('Tabela question_normative_updates nao encontrada. Aplicando migration antes da importacao.');
    migrateNormativeUpdates(db);
  }

  const backupPath = args['skip-backup'] ? '' : createBackup(db, dbPath, 'before-normative-import');
  if (backupPath) console.log(`Backup criado: ${backupPath}`);

  const items = readItems(jsonPath);
  const report = importItems(db, items, {
    sourceFile: normalizePath(path.relative(ROOT_DIR, jsonPath)),
    sourceVersion
  });

  printReport(report);

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ ...report, backupPath }, null, 2), 'utf8');
    console.log(`Relatorio JSON: ${reportPath}`);
  }
} finally {
  db.close();
}

function importItems(database, items, source) {
  const report = {
    sourceFile: source.sourceFile,
    sourceVersion: source.sourceVersion,
    itemsNoJson: items.length,
    found: 0,
    notFound: 0,
    invalid: 0,
    inserted: 0,
    updated: 0,
    missingQuestionIds: [],
    invalidItems: [],
    byRecommendation: {},
    bySecurity: {}
  };

  const questionExists = database.prepare('SELECT 1 FROM questions WHERE id_question = ?');
  const existingUpdate = database.prepare('SELECT 1 FROM question_normative_updates WHERE question_id = ?');
  const upsert = database.prepare(`
    INSERT INTO question_normative_updates (
      question_id,
      source_file,
      source_version,
      imported_at,
      gabarito_banco,
      resposta_extraida_historica,
      classificacao_normativa,
      por_que_desatualizada,
      fundamento_juridico_atual,
      nova_regra_estado_atual,
      gabarito_atualizado_provavel,
      observacao_enunciado_literal,
      mudanca_gabarito,
      recomendacao,
      nivel_seguranca,
      fonte_base,
      raw_json
    )
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(question_id) DO UPDATE SET
      source_file = excluded.source_file,
      source_version = excluded.source_version,
      imported_at = CURRENT_TIMESTAMP,
      gabarito_banco = excluded.gabarito_banco,
      resposta_extraida_historica = excluded.resposta_extraida_historica,
      classificacao_normativa = excluded.classificacao_normativa,
      por_que_desatualizada = excluded.por_que_desatualizada,
      fundamento_juridico_atual = excluded.fundamento_juridico_atual,
      nova_regra_estado_atual = excluded.nova_regra_estado_atual,
      gabarito_atualizado_provavel = excluded.gabarito_atualizado_provavel,
      observacao_enunciado_literal = excluded.observacao_enunciado_literal,
      mudanca_gabarito = excluded.mudanca_gabarito,
      recomendacao = excluded.recomendacao,
      nivel_seguranca = excluded.nivel_seguranca,
      fonte_base = excluded.fonte_base,
      raw_json = excluded.raw_json
  `);

  database.exec('BEGIN');
  try {
    for (const item of items) {
      const questionId = Number(item?.question_id);
      if (!Number.isInteger(questionId) || questionId <= 0) {
        report.invalid += 1;
        report.invalidItems.push({ question_id: item?.question_id ?? null, reason: 'question_id invalido' });
        continue;
      }

      const normalized = normalizeItem(item);
      if (!questionExists.get(questionId)) {
        report.notFound += 1;
        report.missingQuestionIds.push(questionId);
        continue;
      }

      const existed = Boolean(existingUpdate.get(questionId));
      upsert.run(
        questionId,
        source.sourceFile,
        source.sourceVersion,
        normalized.gabarito_banco,
        normalized.resposta_extraida_historica,
        normalized.classificacao_normativa,
        normalized.por_que_desatualizada,
        normalized.fundamento_juridico_atual,
        normalized.nova_regra_estado_atual,
        normalized.gabarito_atualizado_provavel,
        normalized.observacao_enunciado_literal,
        normalized.mudanca_gabarito,
        normalized.recomendacao,
        normalized.nivel_seguranca,
        normalized.fonte_base,
        JSON.stringify(item)
      );

      report.found += 1;
      if (existed) report.updated += 1;
      else report.inserted += 1;
      count(report.byRecommendation, normalized.recomendacao || 'sem recomendacao');
      count(report.bySecurity, normalized.nivel_seguranca || 'sem nivel');
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return report;
}

function normalizeItem(item) {
  return {
    gabarito_banco: normalizeNullable(item.gabarito_banco),
    resposta_extraida_historica: normalizeNullable(item.resposta_extraida_historica),
    classificacao_normativa: normalizeNullable(item.classificacao_normativa),
    por_que_desatualizada: normalizeNullable(item.por_que_desatualizada),
    fundamento_juridico_atual: normalizeNullable(item.fundamento_juridico_atual),
    nova_regra_estado_atual: normalizeNullable(item.nova_regra_estado_atual),
    gabarito_atualizado_provavel: normalizeNullable(item.gabarito_atualizado_provavel),
    observacao_enunciado_literal: normalizeNullable(item.observacao_enunciado_literal),
    mudanca_gabarito: normalizeNullable(item.mudanca_gabarito),
    recomendacao: normalizeRecommendation(item.recomendacao),
    nivel_seguranca: normalizeSecurity(item.nivel_seguranca),
    fonte_base: normalizeNullable(item.fonte_base)
  };
}

function normalizeRecommendation(value) {
  const text = normalizeNullable(value);
  if (!text) return null;
  return text
    .normalize('NFC')
    .replace(/\brevisao manual\b/gi, 'revisão manual')
    .trim()
    .toLowerCase();
}

function normalizeSecurity(value) {
  const text = normalizeNullable(value);
  if (!text) return null;
  return text
    .normalize('NFC')
    .replace(/^medio$/i, 'médio')
    .trim()
    .toLowerCase();
}

function normalizeNullable(value) {
  const text = String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return text || null;
}

function readItems(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.rows)) return parsed.rows;
  throw new Error('JSON deve ser um array ou conter items/rows.');
}

function printReport(report) {
  console.log('');
  console.log('Importacao concluida.');
  console.log('');
  console.log(`Itens no JSON: ${report.itemsNoJson}`);
  console.log(`Questoes encontradas no banco: ${report.found}`);
  console.log(`Questoes nao encontradas no banco: ${report.notFound}`);
  console.log(`Itens invalidos: ${report.invalid}`);
  console.log(`Registros inseridos: ${report.inserted}`);
  console.log(`Registros atualizados: ${report.updated}`);
  console.log('');
  console.log('Por recomendacao:');
  printCounts(report.byRecommendation);
  console.log('');
  console.log('Por nivel de seguranca:');
  printCounts(report.bySecurity);
}

function printCounts(counts) {
  for (const [key, value] of Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`- ${key}: ${value}`);
  }
}

function count(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function tableExists(database, tableName) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
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
