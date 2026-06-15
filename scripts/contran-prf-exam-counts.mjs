import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_COUNTS_PATH = path.join(ROOT_DIR, 'data', 'contran_prf_2021', 'contran_prf_counts_patch.json');
const DEFAULT_ITEM_MAP_PATH = path.join(ROOT_DIR, 'data', 'contran_prf_2021', 'contran_prf_item_map.csv');

export const CONTRAN_PRF_EXAMS = [
  { key: 'prf_2021_objetiva', label: 'PRF 2021 objetiva' },
  { key: 'prf_2019_objetiva', label: 'PRF 2019 objetiva' },
  { key: 'prf_2013_objetiva', label: 'PRF 2013 objetiva' }
];

let cachedData = null;

export function normalizeContranResolutionRef(value) {
  const match = String(value || '').match(/(\d{1,4}(?:\.\d{3})?)\s*\/\s*(19\d{2}|20\d{2})/);
  if (!match) return '';
  const number = String(match[1]).replace(/^0+(?=\d)/, '');
  return `${number}/${match[2]}`;
}

export function loadContranPrfExamCountData(options = {}) {
  const countsPath = options.countsPath || DEFAULT_COUNTS_PATH;
  const itemMapPath = options.itemMapPath || DEFAULT_ITEM_MAP_PATH;
  if (cachedData && cachedData.countsPath === countsPath && cachedData.itemMapPath === itemMapPath) {
    return cachedData;
  }

  const patch = JSON.parse(readFileSync(countsPath, 'utf8'));
  const itemRows = parseCsv(readFileSync(itemMapPath, 'utf8'))
    .map((row) => ({
      ...row,
      item: Number(row.item || 0),
      normalizedPrimaryRef: normalizeContranResolutionRef(row.primary_norm_at_exam),
      normalizedEquivalentRef: normalizeContranResolutionRef(row.edital_2021_equivalent_norm),
      normalizedCurrentRef: normalizeContranResolutionRef(row.current_norm_reference)
    }))
    .filter((row) => row.exam_key && Number.isFinite(row.item) && row.item > 0);

  const statsByResolution = new Map();
  for (const [key, stats] of Object.entries(patch.stats_by_edital_2021_resolution || {})) {
    const normalizedRef = normalizeContranResolutionRef(key);
    if (normalizedRef) statsByResolution.set(normalizedRef, stats);
  }

  cachedData = {
    countsPath,
    itemMapPath,
    exams: patch.exams || {},
    patch,
    itemRows,
    statsByResolution
  };
  return cachedData;
}

export function getDirectCount(ref, examKey, data = loadContranPrfExamCountData()) {
  return getExamBucket(data.statsByResolution.get(normalizeContranResolutionRef(ref))?.direct_counts_by_exam, examKey).count;
}

export function getLinkedItems(ref, examKey, data = loadContranPrfExamCountData()) {
  return getExamBucket(data.statsByResolution.get(normalizeContranResolutionRef(ref))?.direct_counts_by_exam, examKey).items;
}

export function getTopicEquivalentCount(topicId, examKey, data = loadContranPrfExamCountData()) {
  return getLinkedItemsByTopic(topicId, examKey, data).length;
}

export function getLinkedItemsByTopic(topicId, examKey, data = loadContranPrfExamCountData()) {
  const normalizedTopic = String(topicId || '').trim();
  if (!normalizedTopic || !examKey) return [];
  return uniqueSortedNumbers(data.itemRows
    .filter((row) => row.topic_id === normalizedTopic && row.exam_key === examKey)
    .map((row) => row.item));
}

export function getContranPrfResolutionExamStats(ref, data = loadContranPrfExamCountData()) {
  const normalizedRef = normalizeContranResolutionRef(ref);
  const stats = data.statsByResolution.get(normalizedRef);
  if (!stats) {
    return {
      resolutionRef: normalizedRef,
      topicId: '',
      topicLabel: '',
      currentNormReference: '',
      directByExam: emptyExamBuckets(),
      linkedByExam: emptyExamBuckets(),
      topicEquivalentByExam: emptyExamBuckets()
    };
  }
  const topicId = String(stats.topic_id || '').trim();
  return {
    resolutionRef: normalizedRef,
    topicId,
    topicLabel: stats.tema_do_card || '',
    currentNormReference: getCurrentNormReference(normalizedRef, topicId, data),
    directByExam: normalizeExamBuckets(stats.direct_counts_by_exam),
    linkedByExam: normalizeExamBuckets(stats.linked_counts_by_exam_primary_or_secondary),
    topicEquivalentByExam: normalizeExamBuckets(stats.topic_equivalent_counts_by_exam, (examKey, bucket) => ({
      normsAtExam: getNormsAtExamByTopic(topicId, examKey, bucket.items, data)
    }))
  };
}

function getCurrentNormReference(ref, topicId, data) {
  const row = data.itemRows.find((item) => item.normalizedEquivalentRef === ref && item.current_norm_reference);
  if (row) return row.current_norm_reference;
  if (topicId) {
    const topicRow = data.itemRows.find((item) => item.topic_id === topicId && item.current_norm_reference);
    if (topicRow) return topicRow.current_norm_reference;
  }
  return '';
}

function getNormsAtExamByTopic(topicId, examKey, items, data) {
  const itemSet = new Set((items || []).map(Number));
  if (!topicId || !examKey || !itemSet.size) return [];
  const seen = new Set();
  const norms = [];
  for (const row of data.itemRows) {
    if (row.topic_id !== topicId || row.exam_key !== examKey || !itemSet.has(Number(row.item))) continue;
    const norm = String(row.primary_norm_at_exam || '').trim();
    const normalized = normalizeContranResolutionRef(norm) || norm;
    if (!norm || seen.has(normalized)) continue;
    seen.add(normalized);
    norms.push(norm);
  }
  return norms;
}

function normalizeExamBuckets(source = {}, extraFactory = null) {
  return Object.fromEntries(CONTRAN_PRF_EXAMS.map(({ key }) => {
    const bucket = getExamBucket(source, key);
    return [key, {
      ...bucket,
      ...(typeof extraFactory === 'function' ? extraFactory(key, bucket) : {})
    }];
  }));
}

function emptyExamBuckets() {
  return normalizeExamBuckets({});
}

function getExamBucket(source = {}, examKey) {
  const bucket = source?.[examKey] || {};
  const items = uniqueSortedNumbers(bucket.items || []);
  return {
    count: Number.isFinite(Number(bucket.count)) ? Number(bucket.count) : items.length,
    items
  };
}

function uniqueSortedNumbers(values = []) {
  return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))]
    .sort((a, b) => a - b);
}

function parseCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
  });
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}
