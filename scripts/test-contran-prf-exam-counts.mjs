import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDirectCount,
  getLinkedItems,
  getLinkedItemsByTopic,
  getTopicEquivalentCount
} from './contran-prf-exam-counts.mjs';

test('contagens diretas por prova objetiva no mapa CONTRAN PRF', () => {
  assert.equal(getDirectCount('36/1998', 'prf_2021_objetiva'), 0);
  assert.equal(getDirectCount('110/2000', 'prf_2021_objetiva'), 0);
  assert.equal(getDirectCount('432/2013', 'prf_2021_objetiva'), 0);
  assert.equal(getDirectCount('432/2013', 'prf_2019_objetiva'), 1);
  assert.deepEqual(getLinkedItems('432/2013', 'prf_2019_objetiva'), [71]);

  assert.equal(getDirectCount('552/2015', 'prf_2021_objetiva'), 3);
  assert.deepEqual(getLinkedItems('552/2015', 'prf_2021_objetiva'), [83, 84, 85]);

  assert.equal(getDirectCount('92/1998', 'prf_2021_objetiva'), 3);
  assert.deepEqual(getLinkedItems('92/1998', 'prf_2021_objetiva'), [71, 72, 73]);

  assert.equal(getDirectCount('798/2020', 'prf_2021_objetiva'), 1);
});

test('contagens por tema equivalente em provas anteriores', () => {
  assert.equal(getTopicEquivalentCount('amarracao_cargas', 'prf_2019_objetiva'), 3);
  assert.deepEqual(getLinkedItemsByTopic('amarracao_cargas', 'prf_2019_objetiva'), [82, 83, 84]);

  assert.equal(getTopicEquivalentCount('medidores_velocidade', 'prf_2019_objetiva'), 2);
  assert.deepEqual(getLinkedItemsByTopic('medidores_velocidade', 'prf_2019_objetiva'), [74, 75]);
});
