import path from 'node:path';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(args.db || 'questoes-prf.sqlite');
const databaseUrl = args['database-url'] || process.env.DATABASE_URL || '';
const dbClient = args['db-client'] || (args.db ? 'sqlite' : '');
const activeProfile = String(args.active || 'prf_2021_qconcursos_disciplina');

const PROFILES = [
  {
    id: 'prf_2021_edital_blocos',
    name: 'PRF 2021 - edital por blocos',
    description: 'Perfil baseado nos blocos do edital PRF 2021: 55, 30 e 35 itens.',
    source: 'Edital PRF 2021',
    weights: [
      weight('bloco_1_conhecimentos_basicos', 'Bloco I - Conhecimentos basicos', 'bloco_1', 'Bloco I', 55, 120, 15, 'O edital fixa o bloco, nao a contagem por disciplina.'),
      weight('bloco_2_legislacao_transito', 'Bloco II - Legislacao de transito', 'bloco_2', 'Bloco II', 30, 120, 10, 'O edital fixa o bloco de legislacao de transito.'),
      weight('bloco_3_conhecimentos_especificos', 'Bloco III - Conhecimentos especificos', 'bloco_3', 'Bloco III', 35, 120, 10, 'O edital fixa o bloco, nao a contagem por disciplina.')
    ]
  },
  {
    id: 'prf_2021_qconcursos_disciplina',
    name: 'PRF 2021 - Qconcursos por disciplina',
    description: 'Perfil por disciplina com agregacoes ajustaveis a taxonomia local.',
    source: 'Classificacao externa por disciplinas',
    weights: [
      weight('legislacao_transito', 'Legislacao de Transito', 'bloco_2', 'Bloco II', 30, 120, 10, 'Classificacao por disciplina; taxonomia pode variar entre fontes.'),
      weight('portugues', 'Lingua Portuguesa e Redacao Oficial', 'bloco_1', 'Bloco I', 18, 120, 15, 'Portugues agregado com Redacao Oficial.'),
      weight('direito_constitucional', 'Direito Constitucional', 'bloco_3', 'Bloco III', 11, 120, 10, 'Classificacao por disciplina; taxonomia pode variar entre fontes.'),
      weight('direito_penal', 'Direito Penal', 'bloco_3', 'Bloco III', 10, 120, 10, 'Classificacao por disciplina; taxonomia pode variar entre fontes.'),
      weight('lingua_estrangeira', 'Lingua Estrangeira', 'bloco_1', 'Bloco I', 8, 120, 15, 'Ingles/Espanhol agregados.'),
      weight('informatica', 'Informatica', 'bloco_1', 'Bloco I', 7, 120, 15, 'Informatica agregando temas de TI e banco de dados quando houver.'),
      weight('raciocinio_logico_matematico', 'Raciocinio Logico-Matematico', 'bloco_1', 'Bloco I', 6, 120, 15, 'Matematica, estatistica e raciocinio logico agregados.'),
      weight('fisica', 'Fisica', 'bloco_1', 'Bloco I', 5, 120, 15, 'Classificacao por disciplina; taxonomia pode variar entre fontes.'),
      weight('direito_administrativo', 'Direito Administrativo', 'bloco_3', 'Bloco III', 6, 120, 10, 'Agrega administracao publica quando fizer sentido.'),
      weight('geopolitica_conhecimentos_gerais', 'Geopolitica e Conhecimentos Gerais', 'bloco_1', 'Bloco I', 5, 120, 15, 'Geopolitica/conhecimentos gerais agregados.'),
      weight('legislacao_especial_prf', 'Legislacao Especial e PRF', 'bloco_3', 'Bloco III', 6, 120, 10, 'Agrega legislacao federal, especial e legislacao da PRF.'),
      weight('direito_processual_penal', 'Direito Processual Penal', 'bloco_3', 'Bloco III', 4, 120, 10, 'Classificacao por disciplina; taxonomia pode variar entre fontes.'),
      weight('etica', 'Etica', 'bloco_1', 'Bloco I', 2, 120, 15, 'Etica no servico publico.'),
      weight('direitos_humanos', 'Direitos Humanos', 'bloco_3', 'Bloco III', 2, 120, 10, 'Classificacao por disciplina; taxonomia pode variar entre fontes.')
    ]
  },
  {
    id: 'prf_2021_estrategia_agregado',
    name: 'PRF 2021 - Estrategia agregado',
    description: 'Perfil agregado de guia de estudos, com pesos aproximados.',
    source: 'Incidencia agregada externa',
    weights: [
      weight('legislacao_transito', 'Legislacao de Transito', 'bloco_2', 'Bloco II', 40, 120, 10),
      weight('portugues', 'Lingua Portuguesa', 'bloco_1', 'Bloco I', 20, 120, 15),
      weight('raciocinio_logico_matematico', 'Raciocinio Logico-Matematico', 'bloco_1', 'Bloco I', 8, 120, 15),
      weight('fisica', 'Fisica', 'bloco_1', 'Bloco I', 6, 120, 15),
      weight('direito_penal', 'Direito Penal', 'bloco_3', 'Bloco III', 6, 120, 10),
      weight('informatica', 'Informatica', 'bloco_1', 'Bloco I', 6, 120, 15),
      weight('direitos_humanos', 'Direitos Humanos', 'bloco_3', 'Bloco III', 5, 120, 10),
      weight('direito_constitucional', 'Direito Constitucional', 'bloco_3', 'Bloco III', 5, 120, 10),
      weight('direito_administrativo', 'Direito Administrativo', 'bloco_3', 'Bloco III', 5, 120, 10),
      weight('legislacao_especial', 'Legislacao Especial', 'bloco_3', 'Bloco III', 5, 120, 10),
      weight('direito_processual_penal', 'Direito Processual Penal', 'bloco_3', 'Bloco III', 4, 120, 10),
      weight('etica', 'Etica', 'bloco_1', 'Bloco I', 4, 120, 15),
      weight('geopolitica', 'Geopolitica', 'bloco_1', 'Bloco I', 4, 120, 15),
      weight('historia_prf', 'Historia da PRF', 'bloco_3', 'Bloco III', 2, 120, 10)
    ]
  },
  {
    id: 'prf_principais',
    name: 'Principais PRF',
    description: 'Plano focado nos temas e materias de maior incidencia historica nas provas objetivas PRF 2021, 2019 e 2013.',
    source: 'Analise PRF 2021/2019/2013',
    weights: [
      weight('legislacao_transito', 'Legislacao de Transito', 'bloco_2', 'Bloco II', 30, 120, 10, 'Materia central do edital e bloco proprio na PRF 2021.'),
      weight('portugues', 'Lingua Portuguesa', 'bloco_1', 'Bloco I', 18, 120, 15, 'Alta recorrencia nas provas PRF 2021, 2019 e 2013.'),
      weight('direito_constitucional', 'Direito Constitucional', 'bloco_3', 'Bloco III', 11, 120, 10, 'Inclui direitos fundamentais, organizacao do Estado e seguranca publica.'),
      weight('legislacao_especial_prf', 'Legislacao Especial e PRF', 'bloco_3', 'Bloco III', 10, 120, 10, 'Agrega legislacao especial penal, legislacao federal e atribuicoes da PRF.'),
      weight('raciocinio_logico_matematico', 'Raciocinio Logico-Matematico', 'bloco_1', 'Bloco I', 8, 120, 15, 'Agrega matematica, estatistica e raciocinio logico.'),
      weight('direito_administrativo', 'Direito Administrativo', 'bloco_3', 'Bloco III', 8, 120, 10, 'Inclui atos, poderes, responsabilidade civil e regime de servidores.'),
      weight('direito_penal', 'Direito Penal', 'bloco_3', 'Bloco III', 8, 120, 10, 'Prioriza parte geral, crimes contra a Administracao e crimes recorrentes.'),
      weight('direito_processual_penal', 'Direito Processual Penal', 'bloco_3', 'Bloco III', 7, 120, 10, 'Foco em flagrante, prisoes, busca, provas, inquerito e acao penal.'),
      weight('direitos_humanos', 'Direitos Humanos', 'bloco_3', 'Bloco III', 7, 120, 10, 'Inclui DUDH, tratados, hierarquia normativa e protecao de grupos vulneraveis.'),
      weight('informatica', 'Informatica', 'bloco_1', 'Bloco I', 7, 120, 15, 'Foco em seguranca da informacao, internet, redes, nuvem e sistemas.'),
      weight('fisica', 'Fisica', 'bloco_1', 'Bloco I', 6, 120, 15, 'Prioriza mecanica, cinematica, dinamica, energia e temas aplicados.')
    ]
  },
  {
    id: 'prf_pre_edital_personalizado',
    name: 'PRF pre-edital personalizado',
    description: 'Perfil editavel pelo usuario enquanto nao houver novo edital.',
    source: 'Usuario',
    weights: [
      weight('legislacao_transito', 'Legislacao de Transito', 'bloco_2', 'Bloco II', 30, 120, 10),
      weight('portugues', 'Lingua Portuguesa', 'bloco_1', 'Bloco I', 18, 120, 15),
      weight('direito_constitucional', 'Direito Constitucional', 'bloco_3', 'Bloco III', 10, 120, 10),
      weight('direito_penal', 'Direito Penal', 'bloco_3', 'Bloco III', 10, 120, 10),
      weight('informatica', 'Informatica', 'bloco_1', 'Bloco I', 7, 120, 15),
      weight('raciocinio_logico_matematico', 'Raciocinio Logico-Matematico', 'bloco_1', 'Bloco I', 7, 120, 15),
      weight('fisica', 'Fisica', 'bloco_1', 'Bloco I', 6, 120, 15),
      weight('direito_administrativo', 'Direito Administrativo', 'bloco_3', 'Bloco III', 6, 120, 10),
      weight('legislacao_especial_prf', 'Legislacao Especial e PRF', 'bloco_3', 'Bloco III', 6, 120, 10),
      weight('direito_processual_penal', 'Direito Processual Penal', 'bloco_3', 'Bloco III', 5, 120, 10),
      weight('direitos_humanos', 'Direitos Humanos', 'bloco_3', 'Bloco III', 5, 120, 10),
      weight('etica', 'Etica', 'bloco_1', 'Bloco I', 4, 120, 15),
      weight('geopolitica_conhecimentos_gerais', 'Geopolitica e Conhecimentos Gerais', 'bloco_1', 'Bloco I', 4, 120, 15),
      weight('lingua_estrangeira', 'Lingua Estrangeira', 'bloco_1', 'Bloco I', 2, 120, 15)
    ]
  }
];

const { db, client: activeDbClient } = openStudyDatabase({ dbPath, databaseUrl, client: dbClient });

try {
  ensureSchema(db);
  seedProfiles(db, activeProfile);
  console.log(`Perfis semeados: ${PROFILES.length}`);
  console.log(`Perfil ativo: ${activeProfile}`);
  console.log(activeDbClient === 'postgres' ? 'Banco: Postgres (DATABASE_URL)' : `Banco: ${dbPath}`);
} finally {
  db.close();
}

function seedProfiles(database, active) {
  const upsertProfile = database.prepare(`
    INSERT INTO exam_profiles (id, name, description, source, source_url, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      source = excluded.source,
      source_url = excluded.source_url,
      is_active = excluded.is_active,
      updated_at = CURRENT_TIMESTAMP
  `);
  const upsertWeight = database.prepare(`
    INSERT INTO exam_subject_weights (
      profile_id, subject_key, subject_label, block_key, block_label, expected_items,
      expected_pct, min_score_cutoff, importance_weight, source_note, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(profile_id, subject_key) DO UPDATE SET
      subject_label = excluded.subject_label,
      block_key = excluded.block_key,
      block_label = excluded.block_label,
      expected_items = excluded.expected_items,
      expected_pct = excluded.expected_pct,
      min_score_cutoff = excluded.min_score_cutoff,
      importance_weight = excluded.importance_weight,
      source_note = excluded.source_note
  `);

  database.exec('BEGIN');
  try {
    for (const profile of PROFILES) {
      upsertProfile.run(
        profile.id,
        profile.name,
        profile.description,
        profile.source,
        profile.sourceUrl || '',
        profile.id === active ? 1 : 0
      );
      for (const item of profile.weights) {
        upsertWeight.run(
          profile.id,
          item.subjectKey,
          item.subjectLabel,
          item.blockKey,
          item.blockLabel,
          item.expectedItems,
          item.expectedPct,
          item.minScoreCutoff,
          item.importanceWeight,
          item.sourceNote
        );
      }
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function weight(subjectKey, subjectLabel, blockKey, blockLabel, expectedItems, totalItems, minScoreCutoff, sourceNote = '') {
  return {
    subjectKey,
    subjectLabel,
    blockKey,
    blockLabel,
    expectedItems,
    expectedPct: round((expectedItems / totalItems) * 100, 2),
    minScoreCutoff,
    importanceWeight: expectedItems / totalItems,
    sourceNote
  };
}

function ensureSchema(database) {
  const exists = database.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='exam_profiles'").get();
  if (!exists) {
    throw new Error('Rode scripts/migrate-exam-profiles.mjs antes do seed.');
  }
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
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
