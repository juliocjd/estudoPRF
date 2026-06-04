#!/usr/bin/env node
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const sourceDb = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
const seedPath = path.resolve(ROOT_DIR, args.seed || 'data/question_current_law_answers_seed_v7.json');
const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'prf-study-v12-'));
const tempDb = path.join(tempDir, 'questoes-prf-smoke.sqlite');
const port = Number(args.port || 4199);
const baseUrl = `http://127.0.0.1:${port}`;
const checks = [];
let server = null;

try {
  await fsp.copyFile(sourceDb, tempDb);
  seedCurrentLawAnswers(tempDb, seedPath);
  server = spawn(process.execPath, [
    '--no-warnings',
    path.join(ROOT_DIR, 'src/study-server.mjs'),
    '--db',
    tempDb,
    '--port',
    String(port)
  ], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let stderr = '';
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  await waitForServer(baseUrl, stderr);
  await runChecks();
} finally {
  await stopServer(server);
  await fsp.rm(tempDir, { recursive: true, force: true });
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}
if (failed.length) {
  process.exit(1);
}

async function runChecks() {
  const q28259 = await api('/api/questions/28259');
  check('28259 current law answer is ERRADO', q28259.currentLawAnswer?.currentAnswer === 'ERRADO', q28259.currentLawAnswer?.currentAnswer);
  check('28259 historical/study answers separated', q28259.answering?.historicalAnswer === 'CERTO' && q28259.answering?.studyAnswer === 'ERRADO', JSON.stringify(q28259.answering));
  const q28259Right = await answer(28259, 'B');
  check('28259 B/Errado is correct', q28259Right.expectedAnswer === 'ERRADO' && q28259Right.isCorrect === 1 && q28259Right.answerSource === 'current_law_verified', JSON.stringify(q28259Right));
  const q28259Wrong = await answer(28259, 'A');
  check('28259 A/Certo is wrong', q28259Wrong.expectedAnswer === 'ERRADO' && q28259Wrong.isCorrect === 0 && q28259Wrong.answerSource === 'current_law_verified', JSON.stringify(q28259Wrong));

  const q1198 = await api('/api/questions/1198');
  check('1198 uses comment_extracted historical fallback', q1198.answering?.historicalAnswer === 'D' && q1198.answering?.historicalAnswerSource === 'comment_extracted', JSON.stringify(q1198.answering));
  const q1198Right = await answer(1198, 'D');
  check('1198 D scores correct historically', q1198Right.expectedAnswer === 'D' && q1198Right.isCorrect === 1 && q1198Right.answerSource === 'comment_extracted', JSON.stringify(q1198Right));

  const q42747 = await api('/api/questions/42747');
  check('42747 needs_audit has no current-law study answer', q42747.answering?.currentLawStatus === 'needs_audit' && !q42747.answering?.studyAnswer, JSON.stringify(q42747.answering));
  check('42747 keeps historical answer separated', Boolean(q42747.answering?.historicalAnswer), JSON.stringify(q42747.answering));
  const q42747Attempt = await answer(42747, 'A');
  check('42747 attempt is non-scoring', q42747Attempt.isCorrect === null && q42747Attempt.correctionMode === 'non_scoring' && q42747Attempt.nonScoringReason === 'needs_audit', JSON.stringify(q42747Attempt));

  const q1028008 = await api('/api/questions/1028008');
  check('1028008 no_valid_alternative has no study answer', q1028008.answering?.currentLawStatus === 'no_valid_alternative' && !q1028008.answering?.studyAnswer, JSON.stringify(q1028008.answering));
  const q1028008Attempt = await answer(1028008, 'D');
  check('1028008 attempt is non-scoring', q1028008Attempt.isCorrect === null && q1028008Attempt.correctionMode === 'non_scoring' && q1028008Attempt.nonScoringReason === 'no_valid_alternative', JSON.stringify(q1028008Attempt));
}

function seedCurrentLawAnswers(dbPath, jsonPath) {
  const seed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const selected = new Map(seed.items
    .filter((item) => [28259, 42747, 1028008].includes(Number(item.question_id)))
    .map((item) => [Number(item.question_id), item]));
  for (const id of [28259, 42747, 1028008]) {
    if (!selected.has(id)) {
      throw new Error(`Seed current law nao contem questao ${id}`);
    }
  }

  const db = new DatabaseSync(dbPath);
  db.exec(`
    DROP TABLE IF EXISTS question_current_law_answers;
    CREATE TABLE question_current_law_answers (
      question_id INTEGER PRIMARY KEY,
      historical_answer TEXT,
      current_answer TEXT,
      current_law_status TEXT,
      can_auto_score_current_law INTEGER,
      do_not_use_historical_answer_in_current_law_mode INTEGER,
      answer_changed INTEGER,
      no_valid_alternative INTEGER,
      should_discard_from_current_law_study INTEGER,
      hide_from_main_study_until_verified INTEGER,
      legal_basis TEXT,
      article_reference TEXT,
      article_excerpt TEXT,
      teacher_explanation TEXT,
      rule_summary TEXT,
      professor_complement TEXT,
      study_conclusion TEXT,
      teaching_comment_md TEXT,
      source_url TEXT,
      source_version TEXT,
      imported_at TEXT,
      updated_at TEXT
    );
  `);
  const insert = db.prepare(`
    INSERT INTO question_current_law_answers (
      question_id, historical_answer, current_answer, current_law_status,
      can_auto_score_current_law, do_not_use_historical_answer_in_current_law_mode,
      answer_changed, no_valid_alternative, should_discard_from_current_law_study,
      hide_from_main_study_until_verified, legal_basis, article_reference,
      article_excerpt, teacher_explanation, rule_summary, professor_complement,
      study_conclusion, teaching_comment_md, source_url, source_version,
      imported_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  for (const item of selected.values()) {
    insert.run(
      item.question_id,
      item.historical_answer || '',
      item.current_answer || '',
      item.current_law_status || 'needs_audit',
      item.can_auto_score_current_law ? 1 : 0,
      item.do_not_use_historical_answer_in_current_law_mode ? 1 : 0,
      item.answer_changed === null || item.answer_changed === undefined ? null : (item.answer_changed ? 1 : 0),
      item.no_valid_alternative ? 1 : 0,
      item.should_discard_from_current_law_study ? 1 : 0,
      item.hide_from_main_study_until_verified ? 1 : 0,
      item.legal_basis || '',
      item.article_reference || '',
      item.article_excerpt || '',
      item.teacher_explanation || '',
      item.rule_summary || '',
      item.professor_complement || '',
      item.study_conclusion || '',
      item.teaching_comment_md || '',
      item.source_url || '',
      item.source_version || ''
    );
  }
  db.close();
}

async function waitForServer(url, getStderr) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await api('/api/stats');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Servidor nao respondeu em ${url}. ${getStderr || ''}`);
}

async function stopServer(child) {
  if (!child || child.killed) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  });
}

async function answer(questionId, answerLetter) {
  return api(`/api/questions/${questionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answer: answerLetter,
      confidence: 'certainty',
      studyMode: 'smoke-v12'
    })
  });
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(json.error || `HTTP ${response.status}`);
  }
  return json;
}

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail || '') });
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
