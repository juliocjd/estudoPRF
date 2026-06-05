import {
  linkQuestionToLegalCard,
  openCliDatabase,
  parseArgs,
  upsertLegalArticle,
  upsertLegalCard,
  upsertLegalSource
} from './legal-knowledge-utils.mjs';

const args = parseArgs();
const { db, client } = openCliDatabase(args);

try {
  const cards = buildInitialTrafficCards();
  let created = 0;
  let linked = 0;

  console.log(`# Geracao de microteorias legais`);
  console.log(`Banco: ${client}`);
  console.log(`Perfil: ${args.profile || 'prf'}`);
  console.log(`Cards iniciais: ${cards.length}`);

  for (const item of cards) {
    const source = upsertLegalSource(db, item.source);
    const article = upsertLegalArticle(db, source.id, item.article);
    const card = upsertLegalCard(db, {
      ...item.card,
      source_refs: [{
        source_key: item.source.key,
        article_ref: item.article.article_ref,
        label: item.source_ref_label || `${item.source.title}, ${item.article.article_ref}`,
        source_url: item.source.url
      }]
    });
    created += 1;

    for (const questionId of item.question_ids || []) {
      if (!db.prepare('SELECT 1 FROM questions WHERE id_question = ?').get(questionId)) continue;
      linkQuestionToLegalCard(db, {
        questionId,
        articleId: article.id,
        cardId: card.id,
        relationType: 'supports_answer',
        relevanceScore: 1,
        reason: item.link_reason || 'vinculo inicial revisado',
        source: 'initial_legal_microtheory_v1'
      });
      linked += 1;
    }
  }

  console.log('');
  console.log(`# Resultado`);
  console.log(`Cards criados/atualizados: ${created}`);
  console.log(`Vinculos criados/atualizados: ${linked}`);
} finally {
  db.close();
}

function buildInitialTrafficCards() {
  return [
    {
      source: {
        key: 'contran_960_2022',
        type: 'resolution_pdf',
        title: 'Resolucao CONTRAN n. 960/2022',
        source_org: 'CONTRAN/SENATRAN',
        url: 'https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-contran/resolucoes/Resolucao9602022.pdf',
        resolution_number: '960',
        year: 2022,
        priority: 95,
        notes: 'Requisitos de seguranca de vidros, peliculas, transmitancia e visibilidade.'
      },
      article: {
        article_ref: 'art. 10, I',
        article_order: 10,
        heading: 'Veda pelicula refletiva',
        text: 'Art. 10. Sao vedados: I - a aplicacao de peliculas refletivas nas areas envidracadas do veiculo.',
        excerpt: 'Sao vedados: I - a aplicacao de peliculas refletivas nas areas envidracadas do veiculo.'
      },
      card: {
        card_key: 'transito::vidros_peliculas::pelicula_refletiva',
        title: 'Pelicula refletiva nos vidros do veiculo',
        materia: 'Legislacao de Transito e Transportes',
        assunto: 'Resolucao CONTRAN n. 960/2022 - Requisitos de Seguranca de Vidros e Outros',
        microtema: 'Vidros e peliculas',
        level: 'beginner',
        answer_summary: 'Pelicula refletiva nas areas envidracadas do veiculo e vedada.',
        rule_summary: 'A norma atual nao proibe toda pelicula. Ela veda pelicula refletiva e admite pelicula nao refletiva se respeitar os indices de transmitancia luminosa.',
        professor_note: 'A pegadinha e trocar pelicula refletiva por qualquer pelicula.',
        common_traps: 'Refletiva: vedada. Nao refletiva: pode ser admitida se respeitar a transmitancia. Pelicula que prejudique visibilidade ou fiscalizacao fica irregular.',
        memory_hook: 'Refletiva reflete problema: e vedada.',
        verified_status: 'reviewed',
        generated_by: 'initial_legal_microtheory_v1',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'codex'
      },
      question_ids: [28260],
      link_reason: 'Questao cobra diretamente pelicula refletiva nas areas envidracadas.',
      source_ref_label: 'Resolucao CONTRAN n. 960/2022, art. 10, I'
    },
    {
      source: {
        key: 'contran_967_2022',
        type: 'resolution_pdf',
        title: 'Resolucao CONTRAN n. 967/2022',
        source_org: 'CONTRAN/SENATRAN',
        url: 'https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-contran/resolucoes/Resolucao9672022.pdf',
        resolution_number: '967',
        year: 2022,
        priority: 95,
        notes: 'Baixa do registro de veiculos.'
      },
      article: {
        article_ref: 'art. 5',
        article_order: 5,
        heading: 'Prazo para baixa do registro',
        text: 'Art. 5. O responsavel devera requerer a baixa do cadastro do veiculo no prazo de 30 dias, nas hipoteses previstas na norma, observadas as regras de baixa do registro de veiculos.',
        excerpt: 'Prazo atual de 30 dias para requerer a baixa do cadastro do veiculo nas hipoteses previstas na norma.'
      },
      card: {
        card_key: 'transito::baixa_veiculo::prazo_30_dias',
        title: 'Baixa do registro de veiculo irrecuperavel',
        materia: 'Legislacao de Transito e Transportes',
        assunto: 'Resolucao CONTRAN n. 967/2022 - Criterios para a Baixa do Registro de Veiculos',
        microtema: 'Baixa de veiculo',
        level: 'beginner',
        answer_summary: 'O prazo atual para baixa nos casos tratados pela Resolucao n. 967/2022 e de 30 dias.',
        rule_summary: 'Baixa e obrigatoria para veiculo irrecuperavel, definitivamente desmontado, sinistrado com perda total ou vendido/leiloado como sucata, conforme a hipotese normativa.',
        professor_note: 'A pegadinha classica e o prazo antigo de 15 dias. Pela regra atual, o prazo cobrado neste ponto e de 30 dias.',
        common_traps: 'Prazo antigo de 15 dias deixa assertiva errada. A consequencia no CTB, art. 240, envolve infracao grave.',
        memory_hook: 'Baixa atual: pense em 30 dias.',
        verified_status: 'reviewed',
        generated_by: 'initial_legal_microtheory_v1',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'codex'
      },
      question_ids: [28259],
      link_reason: 'Questao cobra baixa de veiculo irrecuperavel e prazo de 15 versus 30 dias.',
      source_ref_label: 'Resolucao CONTRAN n. 967/2022, art. 5'
    }
  ];
}
