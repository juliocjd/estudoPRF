import assert from 'node:assert/strict';
import test from 'node:test';
import { gerar_plano_prf, validatePlanoPrf } from './plano_estudos_prf.mjs';

const config = {
  semanas_disponiveis: 10,
  horas_por_semana: 20,
  dias_de_estudo_por_semana: 5,
  nivel_por_materia: {
    'Legislacao de Transito': 1,
    Portugues: 4,
    'Direito Penal': 2,
    Fisica: 3
  },
  edital_publicado: false
};

test('gera plano PRF valido com markdown e json', () => {
  const result = gerar_plano_prf(config);
  assert.ok(result.markdown.includes('# Plano de estudos PRF'));
  assert.equal(result.json.visao_geral.semanas, 10);
  assert.equal(validatePlanoPrf(result.json), true);
});

test('mantem provas objetivas separadas por exam_key', () => {
  const { json } = gerar_plano_prf(config);
  assert.deepEqual(json.exams_used.map((item) => item.exam_key), [
    'prf_2021_objetiva',
    'prf_2019_objetiva',
    'prf_2013_objetiva'
  ]);
  assert.ok(!json.exams_used.some((item) => item.exam_key.includes('banco') || item.exam_key.includes('cfp')));
});

test('separa norma cobrada na prova e norma atual de estudo em transito', () => {
  const { json } = gerar_plano_prf(config);
  const amarracao = json.legislacao_transito_priorizada.find((item) => item.topic_id === 'amarração_cargas');
  assert.ok(amarracao);
  assert.match(amarracao.norma_cobrada_na_prova, /552\/2015/);
  assert.match(amarracao.norma_atual_de_estudo, /945\/2022/);
});

test('distribuicao considera peso e aumenta materia fraca', () => {
  const { json } = gerar_plano_prf(config);
  const traffic = json.distribuicao_percentual_horas.find((item) => item.id === 'legislacao_transito');
  const portuguese = json.distribuicao_percentual_horas.find((item) => item.id === 'portugues_redacao');
  assert.ok(traffic.percentual > portuguese.percentual);
  assert.ok(traffic.percentual >= 25);
});

test('toda sessao tem questoes e revisao espacada obrigatoria', () => {
  const { json } = gerar_plano_prf(config);
  assert.ok(json.quadro_semanal_modelo.every((session) => session.itens_ce >= 10));
  assert.deepEqual(json.revisoes_programadas.map((item) => item.quando), ['24h', '7 dias', '30 dias']);
  assert.ok(json.simulados.some((item) => item.tipo === 'simulado quinzenal'));
  assert.ok(json.simulados.some((item) => item.tipo === 'simulado semanal'));
});
