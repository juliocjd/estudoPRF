import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { migrateAdaptiveStudyEngine } from './migrate-adaptive-study-engine.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
const profileId = String(args.profile || 'prf_2021_qconcursos_disciplina');
const reportJson = path.resolve(ROOT_DIR, args['report-json'] || 'data/question-clusters-report.json');
const reportMd = path.resolve(ROOT_DIR, args['report-md'] || 'data/question-clusters-report.md');

function rebuildClusters(database, questions, profile) {
  clearAutomaticClusters(database);

  const existingSignatures = new Set();
  const clusters = [];

  const exactComponents = buildExactHashComponents(questions);
  for (const ids of exactComponents) {
    addCluster(clusters, existingSignatures, questions, ids, {
      type: 'exact_hash',
      confidence: 1,
      reason: 'content_hash/statement_hash identico'
    });
  }

  const normalizedGroups = groupBy(questions, (question) => {
    const normalized = question.normalizedStatement;
    return normalized.length >= 40 ? normalized : '';
  });
  for (const group of normalizedGroups.values()) {
    if (group.length < 2) continue;
    addCluster(clusters, existingSignatures, questions, group.map((question) => question.id), {
      type: 'normalized_statement',
      confidence: 0.98,
      reason: 'enunciado normalizado identico'
    });
  }

  const nearComponents = buildNearDuplicateComponents(questions);
  for (const component of nearComponents) {
    addCluster(clusters, existingSignatures, questions, component.ids, {
      type: 'near_duplicate',
      confidence: component.confidence,
      reason: 'Jaccard alto no mesmo assunto'
    }, component.similarities);
  }

  const skillGroups = groupBy(questions, (question) => question.skillKey || `${question.subjectKey || ''}|${question.materia}|${question.assunto}`);
  for (const group of skillGroups.values()) {
    const eligible = group.filter((question) => question.materia || question.assunto);
    if (eligible.length < 2) continue;
    addCluster(clusters, existingSignatures, questions, eligible.map((question) => question.id), {
      type: 'same_skill',
      confidence: 0.7,
      reason: 'mesma habilidade/materia-assunto'
    });
  }

  const inserted = insertClusters(database, clusters, profile);
  const byType = countBy(inserted, (cluster) => cluster.type);
  const duplicateClusters = inserted.filter((cluster) => cluster.type !== 'same_skill');
  const duplicatedQuestions = new Set(duplicateClusters.flatMap((cluster) => cluster.questionIds));
  const sameSkillQuestions = new Set(inserted.filter((cluster) => cluster.type === 'same_skill').flatMap((cluster) => cluster.questionIds));
  const representativeQuestions = new Set(inserted.map((cluster) => cluster.representative.id));

  return {
    generatedAt: new Date().toISOString(),
    dbPath,
    profile,
    questionsAnalyzed: questions.length,
    totalClusters: inserted.length,
    clustersByType: byType,
    duplicateClusters: duplicateClusters.length,
    duplicatedQuestions: duplicatedQuestions.size,
    sameSkillClusters: byType.same_skill || 0,
    sameSkillQuestions: sameSkillQuestions.size,
    representativeQuestions: representativeQuestions.size,
    postponedFirstPassEstimate: countPostponedFirstPass(inserted),
    topRepeatedSubjects: topRepeatedSubjects(inserted),
    insertedClusterIds: inserted.slice(0, 20).map((cluster) => cluster.id)
  };
}

function loadQuestions(database, profile) {
  const hasNormative = tableExists(database, 'question_normative_updates');
  const normativeSelect = hasNormative
    ? `COALESCE(qnu.recomendacao, '') AS normative_recomendacao,
       COALESCE(qnu.nivel_seguranca, '') AS normative_nivel_seguranca,
       COALESCE(qnu.mudanca_gabarito, '') AS normative_mudanca_gabarito`
    : `'' AS normative_recomendacao,
       '' AS normative_nivel_seguranca,
       '' AS normative_mudanca_gabarito`;
  const normativeJoin = hasNormative
    ? 'LEFT JOIN question_normative_updates qnu ON qnu.question_id = q.id_question'
    : '';
  const bestAnswer = bestAnswerSql('q', 'c');

  const rows = database.prepare(`
    SELECT
      q.id_question AS id,
      q.materia,
      q.assunto,
      q.type_question,
      q.statement_text,
      q.statement_html,
      q.statement_hash,
      q.content_hash,
      q.banca,
      q.orgao_sigla,
      q.orgao_nome,
      q.cargo,
      q.anulada,
      q.desatualizada,
      ${bestAnswer} AS best_answer,
      CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END AS has_comment,
      qes.subject_key,
      qes.subject_label,
      qes.block_key,
      qst.skill_key,
      qst.skill_label,
      ${normativeSelect}
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    LEFT JOIN question_exam_subjects qes
      ON qes.question_id = q.id_question
      AND qes.profile_id = ?
    LEFT JOIN (
      SELECT question_id, MIN(skill_key) AS skill_key, MIN(skill_label) AS skill_label
      FROM question_skill_tags
      GROUP BY question_id
    ) qst ON qst.question_id = q.id_question
    ${normativeJoin}
    WHERE COALESCE(q.statement_text, q.statement_html, '') != ''
  `).all(profile);

  return rows.map((row) => {
    const text = htmlToText(row.statement_text || row.statement_html || '');
    const normalizedStatement = normalizeText(text, { keepNumbers: true });
    const normalizedNoNumbers = normalizeText(text, { keepNumbers: false });
    return {
      ...row,
      id: Number(row.id),
      materia: row.materia || '',
      assunto: row.assunto || '',
      typeQuestion: row.type_question || '',
      statementText: text,
      normalizedStatement,
      normalizedNoNumbers,
      words: normalizedStatement.split(' ').filter(Boolean),
      wordsNoNumbers: normalizedNoNumbers.split(' ').filter(Boolean),
      subjectKey: row.subject_key || '',
      subjectLabel: row.subject_label || '',
      skillKey: row.skill_key || '',
      skillLabel: row.skill_label || '',
      representativeScore: representativeScore(row, text)
    };
  });
}

function clearAutomaticClusters(database) {
  database.exec('BEGIN');
  try {
    database.exec(`
      DELETE FROM cluster_mastery
      WHERE cluster_id IN (
        SELECT id FROM question_clusters WHERE cluster_type != 'manual'
      );
      DELETE FROM question_cluster_members
      WHERE cluster_id IN (
        SELECT id FROM question_clusters WHERE cluster_type != 'manual'
      );
      DELETE FROM question_clusters
      WHERE cluster_type != 'manual';
    `);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function buildExactHashComponents(questions) {
  const uf = new UnionFind(questions.map((question) => question.id));
  for (const key of ['content_hash', 'statement_hash']) {
    const groups = groupBy(questions, (question) => String(question[key] || '').trim());
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      if (!String(group[0][key] || '').trim()) continue;
      const first = group[0].id;
      for (const question of group.slice(1)) uf.union(first, question.id);
    }
  }
  return uf.components().filter((ids) => ids.length >= 2);
}

function buildNearDuplicateComponents(questions) {
  const components = [];
  const groups = groupBy(questions, (question) => [
    question.subjectKey || question.materia,
    question.assunto,
    question.typeQuestion
  ].join('|'));

  for (const group of groups.values()) {
    const candidates = group.filter((question) => question.words.length >= 10);
    if (candidates.length < 2) continue;

    const uf = new UnionFind(candidates.map((question) => question.id));
    const maxSimilarity = new Map();
    const shingleCache = new Map();

    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      const left = candidates[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
        const right = candidates[rightIndex];
        const similarity = nearSimilarity(left, right, shingleCache);
        if (similarity >= 0.9 || (similarity >= 0.86 && left.wordsNoNumbers.length >= 10 && right.wordsNoNumbers.length >= 10)) {
          uf.union(left.id, right.id);
          const pairKey = pairKeyFor(left.id, right.id);
          maxSimilarity.set(pairKey, Math.max(Number(maxSimilarity.get(pairKey) || 0), similarity));
        }
      }
    }

    for (const ids of uf.components().filter((items) => items.length >= 2)) {
      const similarities = new Map();
      let confidence = 0.86;
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const value = Number(maxSimilarity.get(pairKeyFor(ids[i], ids[j])) || 0);
          if (value) {
            similarities.set(pairKeyFor(ids[i], ids[j]), value);
            confidence = Math.max(confidence, value);
          }
        }
      }
      components.push({ ids, similarities, confidence: round(confidence, 3) });
    }
  }

  return components;
}

function addCluster(clusters, signatures, allQuestions, ids, options, similarities = new Map()) {
  const uniqueIds = [...new Set(ids.map(Number))].sort((left, right) => left - right);
  if (uniqueIds.length < 2) return;
  const signature = `${options.type}:${uniqueIds.join(',')}`;
  const duplicateSignature = uniqueIds.join(',');
  if (signatures.has(signature)) return;
  if (options.type !== 'same_skill' && signatures.has(`duplicate:${duplicateSignature}`)) return;
  signatures.add(signature);
  if (options.type !== 'same_skill') signatures.add(`duplicate:${duplicateSignature}`);

  const byId = new Map(allQuestions.map((question) => [question.id, question]));
  const questions = uniqueIds.map((id) => byId.get(id)).filter(Boolean);
  if (questions.length < 2) return;
  const representative = chooseRepresentative(questions);
  clusters.push({
    type: options.type,
    confidence: options.confidence,
    reason: options.reason,
    questionIds: questions.map((question) => question.id),
    questions,
    representative,
    similarities,
    subjectKey: representative.subjectKey || '',
    subjectLabel: representative.subjectLabel || '',
    materia: representative.materia || '',
    assunto: representative.assunto || '',
    skillKey: representative.skillKey || '',
    title: buildClusterTitle(options.type, representative)
  });
}

function insertClusters(database, clusters, profile) {
  const insertCluster = database.prepare(`
    INSERT INTO question_clusters (
      cluster_key, cluster_type, profile_id, subject_key, subject_label, materia, assunto,
      skill_key, title, representative_question_id, size, confidence, status, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
  `);
  const insertMember = database.prepare(`
    INSERT INTO question_cluster_members (
      cluster_id, question_id, role, similarity, representative_score, reason
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(cluster_id, question_id) DO UPDATE SET
      role = excluded.role,
      similarity = excluded.similarity,
      representative_score = excluded.representative_score,
      reason = excluded.reason
  `);

  const inserted = [];
  database.exec('BEGIN');
  try {
    for (const cluster of clusters) {
      const keyHash = sha1(`${profile}|${cluster.type}|${cluster.questionIds.join(',')}`);
      const clusterKey = `${cluster.type}:${profile}:${keyHash}`;
      const result = insertCluster.run(
        clusterKey,
        cluster.type,
        profile,
        cluster.subjectKey,
        cluster.subjectLabel,
        cluster.materia,
        cluster.assunto,
        cluster.skillKey,
        cluster.title,
        cluster.representative.id,
        cluster.questionIds.length,
        cluster.confidence
      );
      const clusterId = Number(result.lastInsertRowid);
      for (const question of cluster.questions) {
        const role = question.id === cluster.representative.id ? 'representative' : 'variant';
        const similarity = question.id === cluster.representative.id
          ? 1
          : similarityToRepresentative(cluster, question.id);
        insertMember.run(
          clusterId,
          question.id,
          role,
          similarity,
          question.representativeScore,
          cluster.reason
        );
      }
      inserted.push({ ...cluster, id: clusterId, clusterKey });
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return inserted;
}

function representativeScore(question, text) {
  let score = 0;
  if (String(question.best_answer || '').trim()) score += 40;
  if (Number(question.has_comment || 0)) score += 30;
  if (!Number(question.desatualizada || 0)) score += 25;
  if (!Number(question.anulada || 0)) score += 25;
  if (normativeSafe(question)) score += 15;
  if (/\b(CEBRASPE|CESPE)\b/i.test(question.banca || '') || /\bPRF\b/i.test(`${question.orgao_sigla || ''} ${question.orgao_nome || ''} ${question.cargo || ''}`)) score += 10;
  if (text.length >= 80 && text.length <= 1800) score += 5;
  if (normalizePlain(question.normative_recomendacao).includes('descartar')) score -= 50;
  if (normativeManualOrLow(question)) score -= 35;
  if (Number(question.desatualizada || 0) && !normativeSafe(question)) score -= 30;
  if (Number(question.anulada || 0)) score -= 30;
  if (text.length < 35) score -= 10;
  return score;
}

function chooseRepresentative(questions) {
  return [...questions].sort((left, right) => {
    const scoreDiff = right.representativeScore - left.representativeScore;
    if (scoreDiff) return scoreDiff;
    return left.id - right.id;
  })[0];
}

function buildClusterTitle(type, representative) {
  const subject = representative.skillLabel || representative.assunto || representative.materia || 'Questao';
  const prefix = {
    exact_hash: 'Duplicadas exatas',
    normalized_statement: 'Enunciado igual',
    near_duplicate: 'Questoes semelhantes',
    same_skill: 'Familia de treino'
  }[type] || 'Cluster';
  return `${prefix}: ${subject}`.slice(0, 220);
}

function similarityToRepresentative(cluster, questionId) {
  const value = cluster.similarities.get(pairKeyFor(cluster.representative.id, questionId));
  if (value) return round(value, 3);
  if (cluster.type === 'same_skill') return 0.7;
  if (cluster.type === 'normalized_statement') return 0.98;
  return cluster.confidence || 1;
}

function nearSimilarity(left, right, cache) {
  const leftKey = left.id;
  const rightKey = right.id;
  const scores = [];
  for (const size of [4, 5]) {
    const leftShingles = getShingles(cache, `${leftKey}:num:${size}`, left.words, size);
    const rightShingles = getShingles(cache, `${rightKey}:num:${size}`, right.words, size);
    const leftNoNumbers = getShingles(cache, `${leftKey}:nonum:${size}`, left.wordsNoNumbers, size);
    const rightNoNumbers = getShingles(cache, `${rightKey}:nonum:${size}`, right.wordsNoNumbers, size);
    scores.push(jaccard(leftShingles, rightShingles), jaccard(leftNoNumbers, rightNoNumbers));
  }
  return Math.max(...scores);
}

function getShingles(cache, key, words, size) {
  if (!cache.has(key)) cache.set(key, makeShingles(words, size));
  return cache.get(key);
}

function makeShingles(words, size) {
  if (words.length <= size) return new Set([words.join(' ')].filter(Boolean));
  const values = new Set();
  for (let index = 0; index <= words.length - size; index += 1) {
    values.add(words.slice(index, index + size).join(' '));
  }
  return values;
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;
  for (const value of smaller) {
    if (larger.has(value)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function countPostponedFirstPass(clusters) {
  const postponed = new Set();
  for (const cluster of clusters) {
    if (cluster.type === 'same_skill') continue;
    for (const questionId of cluster.questionIds) {
      if (questionId !== cluster.representative.id) postponed.add(questionId);
    }
  }
  return postponed.size;
}

function topRepeatedSubjects(clusters) {
  const counts = new Map();
  for (const cluster of clusters) {
    if (cluster.type === 'same_skill') continue;
    const key = `${cluster.materia || '(sem materia)'}|${cluster.assunto || '(sem assunto)'}`;
    const previous = counts.get(key) || {
      materia: cluster.materia || '',
      assunto: cluster.assunto || '',
      clusters: 0,
      questions: 0
    };
    previous.clusters += 1;
    previous.questions += cluster.questionIds.length;
    counts.set(key, previous);
  }
  return [...counts.values()]
    .sort((left, right) => right.questions - left.questions || right.clusters - left.clusters)
    .slice(0, 15);
}

function writeReports(report, jsonPath, mdPath) {
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, renderMarkdownReport(report), 'utf8');
}

function renderMarkdownReport(report) {
  const byType = Object.entries(report.clustersByType || {})
    .map(([type, count]) => `| ${type} | ${count} |`)
    .join('\n');
  const repeated = report.topRepeatedSubjects
    .map((row) => `| ${escapeMd(row.materia)} | ${escapeMd(row.assunto)} | ${row.clusters} | ${row.questions} |`)
    .join('\n');
  return `# Relatorio de clusters adaptativos

Gerado em: ${report.generatedAt}

Perfil: \`${report.profile}\`

| Metrica | Valor |
| --- | ---: |
| Questoes analisadas | ${report.questionsAnalyzed} |
| Clusters criados | ${report.totalClusters} |
| Clusters de duplicidade/similaridade | ${report.duplicateClusters} |
| Questoes em duplicidade/similaridade | ${report.duplicatedQuestions} |
| Familias de treino | ${report.sameSkillClusters} |
| Questoes em familias de treino | ${report.sameSkillQuestions} |
| Questoes adiaveis na primeira passada | ${report.postponedFirstPassEstimate} |
| Representantes distintos | ${report.representativeQuestions} |

## Clusters por tipo

| Tipo | Total |
| --- | ---: |
${byType || '| nenhum | 0 |'}

## Assuntos com maior repeticao

| Materia | Assunto | Clusters | Questoes |
| --- | --- | ---: | ---: |
${repeated || '|  |  | 0 | 0 |'}
`;
}

function bestAnswerSql(questionAlias, commentAlias) {
  return `COALESCE(NULLIF(${questionAlias}.official_answer, ''), NULLIF((
    SELECT nq.answer
    FROM notebook_questions nq
    WHERE nq.question_id = ${questionAlias}.id_question
      AND COALESCE(nq.answer, '') != ''
    ORDER BY nq.notebook_id, nq.position
    LIMIT 1
  ), ''), NULLIF(${commentAlias}.extracted_answer, ''), '')`;
}

function tableExists(database, tableName) {
  return Boolean(database.prepare("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = String(getKey(item) || '').trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function countBy(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = String(getKey(item) || '');
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function normalizeText(value, { keepNumbers }) {
  let text = htmlToText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  text = keepNumbers
    ? text.replace(/[^a-z0-9]+/g, ' ')
    : text.replace(/[^a-z]+/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function normalizePlain(value) {
  return normalizeText(value, { keepNumbers: true });
}

function htmlToText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normativeSafe(question) {
  const recommendation = normalizePlain(question.normative_recomendacao);
  const security = normalizePlain(question.normative_nivel_seguranca);
  if (!recommendation && !security) return false;
  return !recommendation.includes('descartar')
    && !normativeManualOrLow(question)
    && (security.includes('alto') || recommendation.includes('manter') || recommendation.includes('adaptar'));
}

function normativeManualOrLow(question) {
  const value = normalizePlain(`${question.normative_recomendacao || ''} ${question.normative_mudanca_gabarito || ''} ${question.normative_nivel_seguranca || ''}`);
  return value.includes('manual') || value.includes('baixo') || value.includes('duvida');
}

function pairKeyFor(left, right) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function sha1(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 16);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function escapeMd(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

class UnionFind {
  constructor(ids) {
    this.parent = new Map();
    for (const id of ids) this.parent.set(id, id);
  }

  find(id) {
    const parent = this.parent.get(id);
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(left, right) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent.set(rightRoot, leftRoot);
  }

  components() {
    const groups = new Map();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(id);
    }
    return [...groups.values()].map((ids) => ids.sort((left, right) => left - right));
  }
}

function main() {
  const db = new DatabaseSync(dbPath);
  try {
    migrateAdaptiveStudyEngine(db);
    const questions = loadQuestions(db, profileId);
    const report = rebuildClusters(db, questions, profileId);
    writeReports(report, reportJson, reportMd);
    console.log(`Clusters reconstruidos. Banco: ${dbPath}`);
    console.log(`Perfil: ${profileId}`);
    console.log(`Questoes analisadas: ${questions.length}`);
    console.log(`Clusters criados: ${report.totalClusters}`);
    console.log(`Relatorio JSON: ${reportJson}`);
    console.log(`Relatorio MD: ${reportMd}`);
  } finally {
    db.close();
  }
}

main();
