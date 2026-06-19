import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseContranNormativeReferences } from './contran-normative-reference-parser.mjs';

describe('parseContranNormativeReferences', () => {
  it('extrai multiplos artigos da Res. 882/2021', () => {
    const parsed = parseContranNormativeReferences('Arts. 11, 18 e 19 da Res. 882/2021.');
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.references.map((ref) => ref.article), ['11', '18', '19']);
    assert.equal(parsed.references[0].resolutionNumber, '882');
    assert.equal(parsed.references[0].resolutionYear, '2021');
  });

  it('extrai artigo e paragrafos', () => {
    const parsed = parseContranNormativeReferences('Art. 4º, § 1º e § 2º, da Res. 882/2021.');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.references.length, 1);
    assert.equal(parsed.references[0].article, '4');
    assert.equal(parsed.references[0].paragraph, '1, 2');
  });

  it('extrai resolucao antes do artigo', () => {
    const parsed = parseContranNormativeReferences('Res. CONTRAN 945/2022, art. 4º, § 3º.');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.references[0].resolutionNumber, '945');
    assert.equal(parsed.references[0].article, '4');
    assert.equal(parsed.references[0].paragraph, '3');
  });

  it('extrai incisos romanos', () => {
    const parsed = parseContranNormativeReferences('Art. 50, I e II, da Res. 882/2021.');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.references[0].article, '50');
    assert.equal(parsed.references[0].item, 'I, II');
  });

  it('extrai anexo', () => {
    const parsed = parseContranNormativeReferences('Anexo I da Res. 798/2020.');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.references[0].annex, 'I');
    assert.equal(parsed.references[0].resolutionNumber, '798');
  });

  it('expande intervalo de artigos', () => {
    const parsed = parseContranNormativeReferences('Res. CONTRAN 918/2022, arts. 3º a 8º.');
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.references.map((ref) => ref.article), ['3', '4', '5', '6', '7', '8']);
  });

  it('marca revisao quando nao identifica resolucao', () => {
    const parsed = parseContranNormativeReferences('Fundamento generico sem resolucao.');
    assert.equal(parsed.ok, false);
    assert.equal(parsed.needsReview, true);
  });
});
