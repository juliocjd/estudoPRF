import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPECTED_COUNTS,
  importQbankToSqlite,
  loadManifest,
  loadQbank,
  openSqliteDatabase,
  validateImportedQbank,
  validateQbankPackage
} from './contran-prf-unpublished-qbank-utils.mjs';

test('pacote CONTRAN PRF inedito V5 passa nas validacoes obrigatorias', () => {
  const items = loadQbank();
  const manifest = loadManifest();
  const report = validateQbankPackage(items, manifest);
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.counts.total, EXPECTED_COUNTS.total);
  assert.equal(report.counts.CERTO_ERRADO, EXPECTED_COUNTS.CERTO_ERRADO);
  assert.equal(report.counts.MULTIPLA_ESCOLHA, EXPECTED_COUNTS.MULTIPLA_ESCOLHA);
});

test('importador e idempotente e nao duplica questoes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contran-prf-qbank-'));
  const dbPath = path.join(tmpDir, 'qbank.sqlite');
  const db = openSqliteDatabase(dbPath);
  try {
    const items = loadQbank();
    const first = importQbankToSqlite(db, items, { sourceFile: 'test', dryRun: false });
    assert.equal(first.inserted, EXPECTED_COUNTS.total);
    assert.equal(first.updated, 0);

    const second = importQbankToSqlite(db, items, { sourceFile: 'test', dryRun: false });
    assert.equal(second.inserted, 0);
    assert.equal(second.updated, EXPECTED_COUNTS.total);

    const imported = validateImportedQbank(db);
    assert.equal(imported.ok, true, imported.errors.join('\n'));
    assert.equal(imported.counts.total, EXPECTED_COUNTS.total);

    const rowsInQuestions = db.prepare(`
      SELECT COUNT(*) AS n
      FROM questions
      WHERE id_question >= 905000001 AND id_question <= 905000413
    `).get().n;
    assert.equal(rowsInQuestions, EXPECTED_COUNTS.total);

    const officialLeak = db.prepare(`
      SELECT COUNT(*) AS n
      FROM contran_prf_unpublished_questions
      WHERE official_exam != 0
        OR is_official != 0
        OR exam_year IS NOT NULL
        OR COALESCE(exam_board, '') NOT IN ('', 'INEDITA', 'INEDITA_ESTILO_CEBRASPE')
    `).get().n;
    assert.equal(officialLeak, 0);

    const missingTeacherComment = db.prepare(`
      SELECT COUNT(*) AS n
      FROM contran_prf_unpublished_questions
      WHERE COALESCE(teacher_comment, '') = ''
    `).get().n;
    assert.equal(missingTeacherComment, 0);

    const invalidMcComments = db.prepare(`
      SELECT alternative_explanations
      FROM contran_prf_unpublished_questions
      WHERE question_type = 'MULTIPLA_ESCOLHA'
    `).all().filter((row) => {
      const parsed = JSON.parse(row.alternative_explanations || '{}');
      return Object.keys(parsed).sort().join('') !== 'ABCDE';
    });
    assert.equal(invalidMcComments.length, 0);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
