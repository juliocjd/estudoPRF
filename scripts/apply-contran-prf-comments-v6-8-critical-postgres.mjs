#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const PATCH_VERSION = 'V6_8_CRITICA_2026-06-18';
const COMMENT_STYLE = 'comentario_professor_didatico_com_fundamento_v6_8_critica';

const CRITICAL_PATCHES = [
  ce({
    id: 905000049,
    externalId: 'CONTRAN_PRF_V5_CE_0049',
    answer: 'C',
    reference: 'Res. 882/2021, art. 50, I, II e §§ 1º a 3º.',
    articleKeys: [['882', '2021', '50']],
    explanation: `Gabarito: CERTO.

Regra aplicável: na fiscalização por equipamento de pesagem, a Res. 882/2021 separa duas tolerâncias: 5% sobre PBT ou PBTC e 12,5% sobre o peso bruto transmitido por eixo ou conjunto de eixos. A tolerância não vira aumento do limite de carregamento; ela serve para a fiscalização.

Aplicação ao item: o enunciado afirma que a tolerância de PBT/PBTC é específica e distinta da tolerância por eixo. Isso corresponde ao art. 50, porque os percentuais são diferentes e recaem sobre grandezas diferentes.

Cuidado de prova: não use 5% para tudo. PBT/PBTC = 5%; peso por eixo = 12,5%.`,
    beginner: 'Compare primeiro qual limite está sendo medido: peso total do veículo ou peso em cada eixo. A porcentagem muda conforme essa escolha.',
    trap: 'A pegadinha é tratar todas as tolerâncias de peso como se fossem uma tolerância única.'
  }),
  ce({
    id: 905000050,
    externalId: 'CONTRAN_PRF_V5_CE_0050',
    answer: 'E',
    reference: 'Res. 882/2021, art. 50, I, II e §§ 1º a 3º.',
    articleKeys: [['882', '2021', '50']],
    explanation: `Gabarito: ERRADO.

Regra aplicável: a Res. 882/2021 não adota uma tolerância uniforme para todos os controles. Na pesagem por equipamento, há 5% para PBT/PBTC e 12,5% para peso bruto transmitido por eixo. Além disso, essas tolerâncias não podem ser incorporadas aos limites de carregamento.

Aplicação ao item: a frase fica errada porque junta PBT, PBTC, eixo e documentos fiscais como se todos seguissem o mesmo percentual. A resolução diferencia os regimes e o enunciado apaga essa diferença.

Cuidado de prova: se a questão disser "tolerância única", desconfie. Em peso, a banca costuma cobrar justamente a separação entre total e eixo.`,
    beginner: 'Não memorize só a palavra tolerância. Memorize o par: PBT/PBTC tem 5%; eixo tem 12,5%.',
    trap: 'A pegadinha é transformar percentuais diferentes em uma regra única.'
  }),
  ce({
    id: 905000051,
    externalId: 'CONTRAN_PRF_V5_CE_0051',
    answer: 'C',
    reference: 'Res. 882/2021, art. 50, II e §§ 1º a 3º; art. 52.',
    articleKeys: [['882', '2021', '50'], ['882', '2021', '52']],
    explanation: `Gabarito: CERTO.

Regra aplicável: o peso total e o peso por eixo são controles distintos. A Res. 882/2021 admite 5% sobre PBT/PBTC e 12,5% sobre o peso transmitido por eixo. Quando o PBT/PBTC está dentro do limite acrescido de 5%, mas há excesso em eixo, a multa incide sobre a parcela que exceder a tolerância do eixo e a carga deve ser remanejada ou transbordada para eliminar o excesso.

Aplicação ao item: o enunciado está correto porque o excesso por eixo pode ser relevante mesmo quando o peso total não seja o problema central. A fiscalização não se limita ao somatório da carga.

Cuidado de prova: PBT regular não significa automaticamente eixo regular.`,
    beginner: 'Imagine a carga mal distribuída: o total pode parecer aceitável, mas um eixo pode suportar peso acima do permitido.',
    trap: 'A pegadinha é confundir peso total do conjunto com distribuição de peso por eixo.'
  }),
  ce({
    id: 905000052,
    externalId: 'CONTRAN_PRF_V5_CE_0052',
    answer: 'E',
    reference: 'Res. 882/2021, art. 50, II e §§ 1º a 3º; art. 52.',
    articleKeys: [['882', '2021', '50'], ['882', '2021', '52']],
    explanation: `Gabarito: ERRADO.

Regra aplicável: o excesso por eixo não é juridicamente irrelevante só porque o PBT está regular. A Res. 882/2021 prevê tolerância própria para eixo, de 12,5%, e permite autuação sobre a parcela que exceder essa tolerância quando o peso total estiver dentro do PBT/PBTC acrescido de 5%. Também exige remanejamento ou transbordo para eliminar o excesso por eixo.

Aplicação ao item: a afirmação erra ao dispensar a fiscalização do eixo isolado. A regularidade do peso total não elimina o controle da distribuição da carga.

Cuidado de prova: "PBT regular" não é salvo-conduto para excesso por eixo.`,
    beginner: 'O fiscal olha duas coisas: o peso total e como esse peso está distribuído nos eixos.',
    trap: 'A pegadinha é fazer parecer que basta respeitar o peso total.'
  }),
  ce({
    id: 905000083,
    externalId: 'CONTRAN_PRF_V5_CE_0083',
    answer: 'C',
    reference: 'Res. 525/2015, art. 3º, I a III.',
    articleKeys: [['525', '2015', '3']],
    explanation: `Gabarito: CERTO.

Regra aplicável: a Res. 525/2015 veda ao motorista profissional dirigir por mais de 5 horas e meia ininterruptas em transporte rodoviário coletivo de passageiros ou de cargas. Para carga, devem ser observados 30 minutos de descanso dentro de cada 6 horas de condução; para passageiros, 30 minutos a cada 4 horas.

Aplicação ao item: a afirmação está correta porque o tempo de direção contínua é limitado por regra objetiva. Não basta o motorista declarar que está apto; a pausa é exigência normativa de segurança viária.

Cuidado de prova: o número central é 5h30 como limite de direção ininterrupta.`,
    beginner: 'A regra combate fadiga. Depois de certo tempo dirigindo, a pausa deixa de ser escolha do motorista e passa a ser exigência normativa.',
    trap: 'A pegadinha é substituir limite objetivo por avaliação subjetiva de cansaço.'
  }),
  ce({
    id: 905000084,
    externalId: 'CONTRAN_PRF_V5_CE_0084',
    answer: 'E',
    reference: 'Res. 525/2015, art. 3º, I a III.',
    articleKeys: [['525', '2015', '3']],
    explanation: `Gabarito: ERRADO.

Regra aplicável: o motorista profissional não pode dirigir continuamente por toda a jornada diária. A Res. 525/2015 limita a direção ininterrupta a 5 horas e meia e exige pausas: 30 minutos dentro de cada 6 horas na carga e 30 minutos a cada 4 horas no transporte rodoviário de passageiros.

Aplicação ao item: a autodeclaração de aptidão não afasta os intervalos. O controle é objetivo e existe para prevenir fadiga e risco viário.

Cuidado de prova: "sente-se apto" não substitui pausa obrigatória.`,
    beginner: 'Mesmo que o motorista diga que consegue continuar, a norma impõe descanso mínimo em períodos definidos.',
    trap: 'A pegadinha é tratar a pausa como faculdade pessoal do condutor.'
  }),
  ce({
    id: 905000085,
    externalId: 'CONTRAN_PRF_V5_CE_0085',
    answer: 'C',
    reference: 'Res. 525/2015, art. 3º, I e II.',
    articleKeys: [['525', '2015', '3']],
    explanation: `Gabarito: CERTO.

Regra aplicável: no transporte de carga, a Res. 525/2015 exige 30 minutos de descanso dentro de cada 6 horas de condução. Esse descanso pode ser fracionado, assim como o tempo de direção, desde que não sejam ultrapassadas 5 horas e meia contínuas ao volante.

Aplicação ao item: o enunciado está correto porque fala em proporção temporal para a pausa durante a condução de carga. A pausa não pode ser jogada apenas para o fim do dia.

Cuidado de prova: carga = 30 minutos dentro de cada 6 horas; direção contínua não pode passar de 5h30.`,
    beginner: 'No transporte de carga, a pausa precisa aparecer dentro do período de condução, não só depois da jornada.',
    trap: 'A pegadinha é confundir pausa dentro da condução com descanso diário ao final do período.'
  }),
  ce({
    id: 905000086,
    externalId: 'CONTRAN_PRF_V5_CE_0086',
    answer: 'E',
    reference: 'Res. 525/2015, art. 3º, I e II.',
    articleKeys: [['525', '2015', '3']],
    explanation: `Gabarito: ERRADO.

Regra aplicável: no transporte de carga, há pausa obrigatória durante a condução: 30 minutos dentro de cada 6 horas. A norma também limita a direção contínua a 5 horas e meia. O descanso diário não elimina a pausa intrajornada.

Aplicação ao item: a afirmação erra ao dizer que não há obrigação de pausa dentro da jornada. Há controle específico durante o período de condução, justamente para reduzir fadiga antes do fim do dia.

Cuidado de prova: descanso ao final do dia e pausa durante a condução são institutos diferentes.`,
    beginner: 'A pausa da carga ocorre enquanto a viagem ainda está acontecendo; ela não pode ser substituída apenas por dormir depois.',
    trap: 'A pegadinha é trocar pausa intrajornada por descanso final.'
  }),
  ce({
    id: 905000087,
    externalId: 'CONTRAN_PRF_V5_CE_0087',
    answer: 'C',
    reference: 'Res. 525/2015, art. 3º, I e III.',
    articleKeys: [['525', '2015', '3']],
    explanation: `Gabarito: CERTO.

Regra aplicável: a Res. 525/2015 diferencia carga e passageiros. Para carga, são 30 minutos de descanso dentro de cada 6 horas de condução. Para transporte rodoviário de passageiros, são 30 minutos de descanso a cada 4 horas, com possibilidade de fracionamento.

Aplicação ao item: o enunciado está correto porque o regime de passageiros é próprio e mais frequente do que o da carga. A norma não usa uma regra idêntica para os dois serviços.

Cuidado de prova: passageiros = 30 minutos a cada 4 horas; carga = 30 minutos dentro de cada 6 horas.`,
    beginner: 'Ônibus de passageiros tem intervalo mais frequente que transporte de carga.',
    trap: 'A pegadinha é aplicar automaticamente à passageiros a regra de carga.'
  }),
  ce({
    id: 905000088,
    externalId: 'CONTRAN_PRF_V5_CE_0088',
    answer: 'E',
    reference: 'Res. 525/2015, art. 3º, II e III.',
    articleKeys: [['525', '2015', '3']],
    explanation: `Gabarito: ERRADO.

Regra aplicável: as pausas não são sempre idênticas. Na carga, a regra é 30 minutos dentro de cada 6 horas de condução; no transporte rodoviário de passageiros, 30 minutos a cada 4 horas. Ambas respeitam o limite de 5 horas e meia de direção ininterrupta.

Aplicação ao item: a frase erra ao negar distinção normativa entre carga e passageiros. A resolução separa os regimes e cobra intervalos em ritmos diferentes.

Cuidado de prova: quando a alternativa disser "sempre idênticas", confronte os números 6h e 4h.`,
    beginner: 'A diferença é simples: carga tem referência de 6 horas; passageiros, de 4 horas.',
    trap: 'A pegadinha está no "sempre": a resolução distingue os dois regimes.'
  }),
  ce({
    id: 905000137,
    externalId: 'CONTRAN_PRF_V5_CE_0137',
    answer: 'C',
    reference: 'Res. 918/2022, art. 9º, §§ 2º e 3º.',
    articleKeys: [['918', '2022', '9']],
    explanation: `Gabarito: CERTO.

Regra aplicável: a Res. 918/2022 diferencia o prazo de expedição da notificação de penalidade. Se a defesa prévia for indeferida ou não for apresentada no prazo, a notificação deve ser expedida em até 180 dias, contados da data da infração. Se houver defesa prévia tempestiva, o prazo passa a ser de 360 dias.

Aplicação ao item: o enunciado está correto porque reconhece que a apresentação de defesa prévia altera o prazo máximo.

Cuidado de prova: sem defesa prévia tempestiva = 180 dias; com defesa prévia tempestiva = 360 dias.`,
    beginner: 'A defesa prévia muda o prazo porque o órgão precisa apreciá-la antes de aplicar a penalidade.',
    trap: 'A pegadinha é decorar só 180 dias e esquecer a hipótese de 360 dias.'
  }),
  ce({
    id: 905000138,
    externalId: 'CONTRAN_PRF_V5_CE_0138',
    answer: 'E',
    reference: 'Res. 918/2022, art. 9º, §§ 2º e 3º.',
    articleKeys: [['918', '2022', '9']],
    explanation: `Gabarito: ERRADO.

Regra aplicável: o prazo não é sempre o mesmo. A Res. 918/2022 prevê 180 dias para expedir a notificação de penalidade quando a defesa prévia é indeferida ou não é apresentada no prazo. Em caso de defesa prévia tempestiva, o prazo é de 360 dias.

Aplicação ao item: a afirmação erra ao dizer que a apresentação de defesa prévia não interfere no prazo. Ela interfere expressamente.

Cuidado de prova: o par cobrado é 180/360, conforme haja ou não defesa prévia tempestiva.`,
    beginner: 'Se o condutor apresenta defesa prévia dentro do prazo, o processo ganha uma etapa de análise e o prazo máximo aumenta.',
    trap: 'A pegadinha é afirmar prazo único para situações processuais diferentes.'
  }),
  ce({
    id: 905000262,
    externalId: 'CONTRAN_PRF_V5_CE_0262',
    answer: 'E',
    reference: 'Res. 432/2013, art. 4º, parágrafo único, e art. 8º, III e § 2º.',
    articleKeys: [['432', '2013', '4'], ['432', '2013', '8']],
    explanation: `Gabarito: ERRADO.

Regra aplicável: a Res. 432/2013 separa medição realizada e valor considerado. Do resultado medido pelo etilômetro deve ser descontada a margem de tolerância, correspondente ao erro máximo admissível indicado na tabela de valores referenciais. No auto, quando houver teste de etilômetro, devem constar a medição realizada, o valor considerado e o limite regulamentado em mg/L.

Aplicação ao item: a afirmação erra porque o valor medido não é usado integralmente. Para fins de enquadramento, considera-se o valor após o desconto da margem admitida.

Cuidado de prova: valor medido é o que o aparelho registra; valor considerado é o que sobra depois da margem de tolerância.`,
    beginner: 'No etilômetro, a prova costuma cobrar a diferença entre o número medido pelo aparelho e o número usado juridicamente.',
    trap: 'A pegadinha é ignorar a margem de erro do equipamento.'
  }),
  mc({
    id: 905000337,
    externalId: 'CONTRAN_PRF_V5_MC_0013',
    answer: 'C',
    reference: 'Res. 882/2021, art. 50, I, II e §§ 1º a 3º; art. 52.',
    articleKeys: [['882', '2021', '50'], ['882', '2021', '52']],
    explanation: `Gabarito: C.

A) Errada. A tolerância de 5% sobre PBT/PBTC e a de 12,5% sobre eixo são regras de fiscalização por equipamento de pesagem. A alternativa transporta essa lógica para fiscalização documental automática, o que não decorre do art. 50.

B) Errada. Havendo excesso por eixo com PBT/PBTC dentro da tolerância de 5%, a Res. 882/2021 prevê remanejamento da carga ou transbordo para eliminar o excesso. Portanto, não é correto dizer que o remanejamento jamais é admitido.

C) Certa. Na pesagem por equipamento, a resolução admite 5% para PBT/PBTC e 12,5% para peso bruto transmitido por eixo. São tolerâncias próprias, com objetos diferentes.

D) Errada. A constatação de excesso relevante não gera liberação automática para regularizar apenas no destino. A norma trabalha com providências de regularização, como remanejamento ou transbordo, quando cabíveis.

E) Errada. A lavratura do auto não autoriza, por si só, o prosseguimento com a irregularidade de peso ainda presente.

Cuidado de prova: PBT/PBTC = 5%; eixo = 12,5%; tolerância não pode ser incorporada ao carregamento.`,
    beginner: 'Em múltipla escolha, elimine alternativas absolutas e confira se elas respeitam a diferença entre peso total e peso por eixo.',
    trap: 'As erradas criam automatismos que a norma não traz: tolerância documental, proibição total de remanejamento ou liberação automática.'
  }),
  mc({
    id: 905000346,
    externalId: 'CONTRAN_PRF_V5_MC_0022',
    answer: 'B',
    reference: 'Res. 525/2015, art. 2º; art. 3º, I, II, IV, V e XII; art. 6º.',
    articleKeys: [['525', '2015', '2'], ['525', '2015', '3'], ['525', '2015', '6']],
    explanation: `Gabarito: B.

A) Errada. A resolução não exige apenas descanso semanal. Ela prevê descanso diário mínimo de 11 horas dentro de 24 horas, além das pausas dentro do período de condução.

B) Certa. No transporte de carga, devem ser observados 30 minutos de descanso dentro de cada 6 horas de condução, com possibilidade de fracionamento, desde que não se ultrapassem 5 horas e meia contínuas ao volante.

C) Errada. Há hipótese excepcional de elevação do tempo de direção pelo período necessário para chegar a local que ofereça segurança e atendimento, desde que a situação seja justificada e registrada e não comprometa a segurança rodoviária.

D) Errada. A fiscalização pode ocorrer pelo disco ou fita diagrama do registrador, por meios eletrônicos idôneos, ou por diário de bordo/papeleta/ficha. Os documentos manuais não "sempre prevalecem" sobre cronotacógrafo regular; ao contrário, eles são verificados quando não for possível comprovar pelo equipamento do veículo fiscalizado.

E) Errada. O motorista autônomo não está dispensado de controle. A resolução prevê ficha própria e obrigação de portar a ficha de trabalho das últimas 24 horas.

Cuidado de prova: carga = 30 minutos dentro de cada 6 horas; limite contínuo = 5h30; descanso diário = 11 horas em 24 horas.`,
    beginner: 'Para carga, memorize três camadas: pausa durante a condução, limite de direção contínua e descanso diário.',
    trap: 'As erradas usam palavras absolutas como "apenas", "jamais", "sempre" e "dispensado".'
  })
];

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, report: error.report || null }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args['dry-run']);
  const backupPath = path.join(packageRoot, 'exports', `backup_contran_prf_pedagogical_before_v6_8_critical_${timestampForFile(new Date())}.jsonl`);
  const refBackupPath = path.join(packageRoot, 'exports', `backup_contran_question_normative_refs_before_v6_8_critical_${timestampForFile(new Date())}.jsonl`);
  const reportPath = path.join(packageRoot, 'reports', `contran_prf_comments_v6_8_critical_report.json`);

  const { client, selected } = createClient({
    preferDirect: true,
    applicationName: 'apply-contran-prf-comments-v6-8-critical'
  });

  const report = {
    dryRun,
    database: {
      source: selected.sourceName,
      url: selected.redactedConnectionString
    },
    patchVersion: PATCH_VERSION,
    patchTotal: CRITICAL_PATCHES.length,
    backupPath,
    refBackupPath,
    reportPath,
    updatedQuestions: 0,
    replacedStructuredReferences: 0,
    remainingAuditRowsNotApplied: 389 - CRITICAL_PATCHES.length,
    validations: {}
  };

  await client.connect();
  try {
    await client.query('BEGIN');
    const before = await fetchQuestions(client);
    validateBefore(before, report);
    await writeJsonl(backupPath, before);

    const beforeRefs = await fetchReferences(client);
    await writeJsonl(refBackupPath, beforeRefs);

    const articleTextByKey = await fetchArticleTexts(client);
    applyArticleTexts(articleTextByKey);

    report.updatedQuestions = await updateQuestions(client);
    report.replacedStructuredReferences = await replaceStructuredReferences(client, articleTextByKey);

    const after = await fetchQuestions(client);
    const afterRefs = await fetchReferences(client);
    validateAfter(before, after, afterRefs, report);

    if (dryRun) await client.query('ROLLBACK');
    else await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    error.report = report;
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({ ok: true, ...report, examples: buildExamples() }, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    ok: true,
    message: dryRun ? 'Dry-run concluido; nenhuma alteracao persistida.' : 'Correcoes V6.8 criticas aplicadas.',
    updatedQuestions: report.updatedQuestions,
    replacedStructuredReferences: report.replacedStructuredReferences,
    backupPath,
    refBackupPath,
    reportPath,
    examples: buildExamples(),
    aviso: 'Somente campos pedagogicos e referencias estruturadas das questoes criticas foram atualizados. IDs, enunciados, alternativas, gabaritos, historico de respostas e estatisticas foram preservados.'
  }, null, 2));
}

function ce(item) {
  return normalizePatch({ ...item, questionType: 'CERTO_ERRADO' });
}

function mc(item) {
  return normalizePatch({ ...item, questionType: 'MULTIPLA_ESCOLHA' });
}

function normalizePatch(item) {
  const teacherComment = item.explanation;
  return {
    id: Number(item.id),
    externalId: item.externalId,
    correctAnswer: item.answer,
    questionType: item.questionType,
    explanation: item.explanation,
    historicalExplanation: teacherComment,
    beginnerExplanation: item.beginner,
    trapExplanation: item.trap,
    sourceNormativeReference: item.reference,
    teacherComment,
    articleReference: item.reference,
    articleFullText: '',
    articleFullTextStatus: 'included_full',
    needsManualReview: 0,
    reviewReason: '',
    articleKeys: item.articleKeys
  };
}

async function fetchQuestions(client) {
  const ids = CRITICAL_PATCHES.map((item) => item.id);
  const result = await client.query(`
    SELECT
      question_id, external_id, statement, alternatives, correct_answer, question_type,
      explanation, historical_explanation, beginner_explanation, trap_explanation,
      source_normative_reference, teacher_comment, alternative_explanations,
      article_reference, article_full_text, article_full_text_status,
      needs_manual_review, review_reason, pedagogical_patch_version,
      comment_style, pedagogical_updated_at, updated_at,
      is_unpublished, is_official, official_exam, active, visible, deprecated
    FROM contran_prf_unpublished_questions
    WHERE question_id = ANY($1::int[])
    ORDER BY question_id
  `, [ids]);
  return result.rows;
}

async function fetchReferences(client) {
  const ids = CRITICAL_PATCHES.map((item) => item.id);
  const result = await client.query(`
    SELECT *
    FROM contran_question_normative_references
    WHERE question_id = ANY($1::int[])
    ORDER BY question_id, display_order, id
  `, [ids]);
  return result.rows;
}

async function fetchArticleTexts(client) {
  const keys = [...new Map(CRITICAL_PATCHES.flatMap((item) => item.articleKeys)
    .map((key) => [`${key[0]}/${key[1]}/${key[2]}`, key])).values()];
  const result = await client.query(`
    SELECT id, resolution, resolution_number, resolution_year, article, plain_text
    FROM contran_normative_articles
    WHERE (resolution_number, resolution_year, article) IN (
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[])
    )
    ORDER BY resolution_number, resolution_year, article
  `, [keys.map((k) => k[0]), keys.map((k) => k[1]), keys.map((k) => k[2])]);

  const found = new Map(result.rows.map((row) => [`${row.resolution_number}/${row.resolution_year}/${row.article}`, row]));
  const missing = keys.filter((key) => !found.has(`${key[0]}/${key[1]}/${key[2]}`));
  if (missing.length) {
    throw new Error(`Artigos normativos nao encontrados: ${missing.map((k) => k.join('/')).join(', ')}`);
  }
  return found;
}

function applyArticleTexts(articleTextByKey) {
  for (const patch of CRITICAL_PATCHES) {
    patch.articleFullText = patch.articleKeys
      .map((key) => articleTextByKey.get(`${key[0]}/${key[1]}/${key[2]}`).plain_text)
      .join('\n\n');
  }
}

function validateBefore(rows, report) {
  const byId = new Map(rows.map((row) => [Number(row.question_id), row]));
  const errors = [];
  for (const patch of CRITICAL_PATCHES) {
    const row = byId.get(patch.id);
    if (!row) {
      errors.push({ id: patch.id, error: 'not_found' });
      continue;
    }
    if (row.external_id !== patch.externalId) errors.push({ id: patch.id, error: 'external_id_mismatch', db: row.external_id, patch: patch.externalId });
    if (String(row.correct_answer || '').trim() !== patch.correctAnswer) errors.push({ id: patch.id, error: 'answer_mismatch', db: row.correct_answer, patch: patch.correctAnswer });
    if (String(row.question_type || '').trim() !== patch.questionType) errors.push({ id: patch.id, error: 'question_type_mismatch', db: row.question_type, patch: patch.questionType });
    if (!toBoolean(row.is_unpublished) || toBoolean(row.is_official) || toBoolean(row.official_exam)) errors.push({ id: patch.id, error: 'not_unpublished_or_official' });
    if (!String(row.statement || '').trim()) errors.push({ id: patch.id, error: 'empty_statement' });
  }
  report.validations.before = { ok: errors.length === 0, errors };
  if (errors.length) throw new Error('Validacao pre-update falhou.');
}

async function updateQuestions(client) {
  const sql = `
    UPDATE contran_prf_unpublished_questions
    SET
      explanation = $3,
      historical_explanation = $4,
      beginner_explanation = $5,
      trap_explanation = $6,
      source_normative_reference = $7,
      teacher_comment = $8,
      alternative_explanations = $9,
      article_reference = $10,
      article_full_text = $11,
      article_full_text_status = $12,
      needs_manual_review = $13,
      review_reason = $14,
      pedagogical_patch_version = $15,
      comment_style = $16,
      pedagogical_updated_at = NOW()
    WHERE question_id = $1
      AND external_id = $2
      AND COALESCE(is_unpublished, 0) = 1
      AND COALESCE(is_official, 0) = 0
      AND COALESCE(official_exam, 0) = 0
      AND COALESCE(active, 1) = 1
      AND COALESCE(visible, 1) = 1
      AND COALESCE(deprecated, 0) = 0
  `;
  let updated = 0;
  for (const patch of CRITICAL_PATCHES) {
    const metadata = JSON.stringify({
      article_full_text_status: patch.articleFullTextStatus,
      article_full_text: patch.articleFullText,
      needs_manual_review: false,
      review_reason: '',
      patch_version: PATCH_VERSION,
      update_scope: 'comentarios_fundamentos_referencias_criticas',
      comment_style: COMMENT_STYLE
    });
    const result = await client.query(sql, [
      patch.id,
      patch.externalId,
      patch.explanation,
      patch.historicalExplanation,
      patch.beginnerExplanation,
      patch.trapExplanation,
      patch.sourceNormativeReference,
      patch.teacherComment,
      metadata,
      patch.articleReference,
      patch.articleFullText,
      patch.articleFullTextStatus,
      patch.needsManualReview,
      patch.reviewReason,
      PATCH_VERSION,
      COMMENT_STYLE
    ]);
    updated += result.rowCount;
  }
  return updated;
}

async function replaceStructuredReferences(client, articleTextByKey) {
  const ids = CRITICAL_PATCHES.map((item) => item.id);
  await client.query('DELETE FROM contran_question_normative_references WHERE question_id = ANY($1::int[])', [ids]);

  const sql = `
    INSERT INTO contran_question_normative_references (
      question_id, external_id, normative_article_id, resolution, resolution_number,
      resolution_year, article, paragraph, item, subitem, annex, raw_reference,
      display_order, needs_normative_reference_review, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, '', '', '', '', $8, $9, 0, NOW()
    )
  `;
  let inserted = 0;
  for (const patch of CRITICAL_PATCHES) {
    for (let index = 0; index < patch.articleKeys.length; index += 1) {
      const key = patch.articleKeys[index];
      const article = articleTextByKey.get(`${key[0]}/${key[1]}/${key[2]}`);
      const result = await client.query(sql, [
        patch.id,
        patch.externalId,
        article.id,
        article.resolution,
        key[0],
        key[1],
        key[2],
        patch.articleReference,
        index + 1
      ]);
      inserted += result.rowCount;
    }
  }
  return inserted;
}

function validateAfter(beforeRows, afterRows, afterRefs, report) {
  const beforeById = new Map(beforeRows.map((row) => [Number(row.question_id), row]));
  const afterById = new Map(afterRows.map((row) => [Number(row.question_id), row]));
  const patchById = new Map(CRITICAL_PATCHES.map((patch) => [patch.id, patch]));
  const unchangedFailures = [];
  const pedagogyFailures = [];
  const refFailures = [];

  for (const patch of CRITICAL_PATCHES) {
    const before = beforeById.get(patch.id);
    const after = afterById.get(patch.id);
    if (!before || !after) continue;
    for (const field of ['question_id', 'external_id', 'statement', 'alternatives', 'correct_answer', 'question_type', 'updated_at']) {
      if (String(before[field] ?? '') !== String(after[field] ?? '')) {
        unchangedFailures.push({ id: patch.id, field });
      }
    }
    const expected = patchById.get(patch.id);
    for (const [field, expectedValue] of [
      ['teacher_comment', expected.teacherComment],
      ['historical_explanation', expected.historicalExplanation],
      ['beginner_explanation', expected.beginnerExplanation],
      ['trap_explanation', expected.trapExplanation],
      ['source_normative_reference', expected.sourceNormativeReference],
      ['article_reference', expected.articleReference],
      ['article_full_text_status', expected.articleFullTextStatus],
      ['pedagogical_patch_version', PATCH_VERSION],
      ['comment_style', COMMENT_STYLE]
    ]) {
      if (cleanText(after[field]) !== cleanText(expectedValue)) {
        pedagogyFailures.push({ id: patch.id, field });
      }
    }
    if (!cleanText(after.article_full_text)) {
      pedagogyFailures.push({ id: patch.id, field: 'article_full_text_empty' });
    }
  }

  const refsByQuestion = new Map();
  for (const ref of afterRefs) {
    if (!refsByQuestion.has(Number(ref.question_id))) refsByQuestion.set(Number(ref.question_id), []);
    refsByQuestion.get(Number(ref.question_id)).push(ref);
  }
  for (const patch of CRITICAL_PATCHES) {
    const refs = refsByQuestion.get(patch.id) || [];
    if (refs.length !== patch.articleKeys.length) {
      refFailures.push({ id: patch.id, expected: patch.articleKeys.length, actual: refs.length });
      continue;
    }
    for (const key of patch.articleKeys) {
      if (!refs.some((ref) => ref.resolution_number === key[0] && ref.resolution_year === key[1] && ref.article === key[2] && Number(ref.normative_article_id || 0) > 0)) {
        refFailures.push({ id: patch.id, missing: key.join('/') });
      }
    }
  }

  report.validations.after = {
    ok: report.updatedQuestions === CRITICAL_PATCHES.length && !unchangedFailures.length && !pedagogyFailures.length && !refFailures.length,
    updatedExpected: CRITICAL_PATCHES.length,
    updatedActual: report.updatedQuestions,
    unchangedFailures,
    pedagogyFailures,
    refFailures
  };
  if (!report.validations.after.ok) throw new Error('Validacao pos-update falhou.');
}

function buildExamples() {
  return CRITICAL_PATCHES.slice(0, 5).map((patch) => ({
    id: patch.id,
    external_id: patch.externalId,
    fundamento_normativo_new: patch.articleReference,
    comentario_professor_excerpt: patch.teacherComment.slice(0, 260)
  }));
}

async function writeJsonl(file, rows) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function timestampForFile(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}
