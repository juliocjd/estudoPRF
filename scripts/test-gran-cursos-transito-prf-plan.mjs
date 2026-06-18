import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  GRAN_CURSOS_TRANSITO_PRF_LESSONS,
  GRAN_CURSOS_TRANSITO_PRF_META,
  validateGranCursosTransitoPrfLessons
} from '../data/gran_cursos_transito_prf/gran-cursos-transito-prf-lessons.mjs';

test('seed Gran Cursos Transito PRF tem 183 aulas validas e sem duplicidade', () => {
  const validation = validateGranCursosTransitoPrfLessons();
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
  assert.equal(GRAN_CURSOS_TRANSITO_PRF_LESSONS.length, 183);
  assert.equal(new Set(GRAN_CURSOS_TRANSITO_PRF_LESSONS.map((lesson) => lesson.lesson_number)).size, 183);
});

test('seed Gran Cursos Transito PRF preserva campos obrigatorios e prioridades', () => {
  const counts = GRAN_CURSOS_TRANSITO_PRF_LESSONS.reduce((acc, lesson) => {
    acc[lesson.priority] = (acc[lesson.priority] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counts, {
    ESSENCIAL: 81,
    IMPORTANTE: 72,
    REVISAO_RAPIDA: 30
  });
  const weights = new Map([
    ['ESSENCIAL', 100],
    ['IMPORTANTE', 60],
    ['REVISAO_RAPIDA', 30]
  ]);
  for (const lesson of GRAN_CURSOS_TRANSITO_PRF_LESSONS) {
    assert.equal(lesson.provider, 'Gran Cursos');
    assert.equal(lesson.discipline, 'Legislação de Trânsito');
    assert.equal(lesson.professor, 'Prof. Paulo Sérgio');
    assert.equal(lesson.active, true);
    assert.equal(lesson.source, 'Lista de aulas Gran Cursos informada pelo usuário');
    assert.equal(lesson.priority_weight, weights.get(lesson.priority));
    assert.match(lesson.incidence_level, /^(ALTISSIMA|ALTA|MEDIA|BAIXA)$/);
    assert.ok(Number.isInteger(lesson.recommended_order));
    assert.ok(lesson.axis);
    assert.ok(lesson.theme);
    assert.ok(lesson.incidence_reason);
  }
});

test('ordem padrao do plano segue recommended_order, nao numero original da aula', () => {
  const ordered = [...GRAN_CURSOS_TRANSITO_PRF_LESSONS].sort((left, right) => left.recommended_order - right.recommended_order);
  assert.equal(ordered[0].lesson_number, 25);
  assert.equal(ordered[0].recommended_order, 1);
  assert.notEqual(ordered[0].lesson_number, 1);
  assert.deepEqual(ordered.slice(0, 13).map((lesson) => lesson.lesson_number), [
    25, 105, 106, 107, 108, 109, 110, 111, 178, 183, 179, 180, 127
  ]);
});

test('niveis de incidencia essenciais seguem o refinamento informado', () => {
  const byNumber = new Map(GRAN_CURSOS_TRANSITO_PRF_LESSONS.map((lesson) => [lesson.lesson_number, lesson]));
  for (const number of [25, 105, 111, 178, 183, 172, 173, 97, 19, 98, 99, 118, 121, 144, 148, 49, 62]) {
    assert.equal(byNumber.get(number).incidence_level, 'ALTISSIMA');
  }
  for (const number of [171, 38, 48, 26, 149, 153, 27, 130, 131, 28, 137, 143, 93, 95, 174, 177, 18, 181, 182]) {
    assert.equal(byNumber.get(number).incidence_level, 'ALTA');
  }
  assert.equal(byNumber.get(1).incidence_level, 'MEDIA');
  assert.equal(byNumber.get(72).incidence_level, 'BAIXA');
});

test('normalizacoes sensiveis do plano foram aplicadas sem perder titulo original', () => {
  const byNumber = new Map(GRAN_CURSOS_TRANSITO_PRF_LESSONS.map((lesson) => [lesson.lesson_number, lesson]));
  assert.match(byNumber.get(105).title, /882\/2021/);
  assert.match(byNumber.get(105).original_title, /882\/2020/);
  assert.match(byNumber.get(178).original_title, /Requistos/);
  assert.match(byNumber.get(178).normalized_title, /Requisitos/);
  assert.match(byNumber.get(174).notes, /723\/2018/);
});

test('rota e link do relatorio estao registrados na UI', async () => {
  assert.equal(GRAN_CURSOS_TRANSITO_PRF_META.totalLessons, 183);
  const [html, js] = await Promise.all([
    readFile(new URL('../public/study/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/study/study.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /Plano de Aulas Gran Cursos - Trânsito PRF/);
  assert.match(html, /A prioridade é por tema\/eixo de incidência, não significa que a aula específica tenha caído em prova\./);
  assert.match(html, /granCursosPlanPanel/);
  assert.match(js, /\/relatorios\/plano-aulas-gran-cursos-transito-prf/);
  assert.match(js, /\/api\/gran-cursos-transito-prf\/lessons/);
  assert.match(js, /Começar agora/);
  assert.match(js, /Núcleo PRF mais cobrado/);
  assert.match(js, /Pegadinhas/);
  assert.match(js, /Copiar roteiro/);
});
