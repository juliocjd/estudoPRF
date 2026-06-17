import path from 'node:path';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(args.db || 'questoes-prf.sqlite');
const databaseUrl = args['database-url'] || process.env.DATABASE_URL || '';
const dbClient = args['db-client'] || (args.db ? 'sqlite' : '');
const requestedProfile = String(args.profile || '');

const { db } = openStudyDatabase({ dbPath, databaseUrl, client: dbClient });

try {
  ensureSchema(db);
  const profileId = requestedProfile || getActiveProfile(db);
  if (!profileId) {
    throw new Error('Nenhum perfil informado ou ativo. Rode seed-prf-exam-profiles.mjs --active ...');
  }

  const weights = getProfileWeights(db, profileId);
  const aliases = buildAliasesForProfile(profileId, weights);
  const aliasSource = aliasSourceForProfile(profileId);
  seedAliases(db, aliases, aliasSource);
  const report = mapQuestions(db, profileId, aliasSource);
  printReport(profileId, report);
} finally {
  db.close();
}

function mapQuestions(database, profileId, aliasSource) {
  database.exec('BEGIN');
  try {
    database.prepare(`
      DELETE FROM question_exam_subjects
      WHERE profile_id = ?
    `).run(profileId);

    database.prepare(`
      INSERT INTO question_exam_subjects (
        question_id, profile_id, subject_key, subject_label, block_key, confidence, source
      )
      SELECT
        q.id_question,
        ?,
        w.subject_key,
        w.subject_label,
        w.block_key,
        MAX(sa.confidence),
        'alias'
      FROM questions q
      JOIN subject_aliases sa
        ON sa.raw_materia = q.materia
        AND sa.source = ?
        AND (
          COALESCE(sa.raw_assunto, '') = ''
          OR q.assunto = sa.raw_assunto
          OR (
            sa.raw_assunto != REPLACE(sa.raw_assunto, '%', '')
            AND q.assunto LIKE sa.raw_assunto
          )
        )
      JOIN exam_subject_weights w
        ON w.profile_id = ?
        AND w.subject_key = sa.subject_key
      GROUP BY q.id_question, w.subject_key, w.subject_label, w.block_key
      ON CONFLICT(question_id, profile_id, subject_key) DO UPDATE SET
        subject_label = excluded.subject_label,
        block_key = excluded.block_key,
        confidence = excluded.confidence,
        source = excluded.source
    `).run(profileId, aliasSource, profileId);

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  const questions = database.prepare('SELECT COUNT(*) AS total FROM questions').get().total || 0;
  const mapped = database.prepare(`
    SELECT COUNT(DISTINCT question_id) AS total
    FROM question_exam_subjects
    WHERE profile_id = ?
  `).get(profileId).total || 0;
  const unmapped = Math.max(0, Number(questions || 0) - Number(mapped || 0));
  const distribution = database.prepare(`
    SELECT subject_key, COUNT(*) AS total
    FROM question_exam_subjects
    WHERE profile_id = ?
    GROUP BY subject_key
    ORDER BY total DESC, subject_key
  `).all(profileId).map((row) => [row.subject_key, row.total]);
  const validAnswerDistribution = [];
  for (const row of database.prepare(`
    SELECT qes.subject_key, COUNT(*) AS total
    FROM question_exam_subjects qes
    JOIN questions q ON q.id_question = qes.question_id
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE qes.profile_id = ?
      AND COALESCE(q.anulada, 0) = 0
      AND COALESCE(q.desatualizada, 0) = 0
      AND ${bestAnswerSql('q', 'c')} != ''
    GROUP BY qes.subject_key
    ORDER BY total DESC, qes.subject_key
  `).all(profileId)) {
    validAnswerDistribution.push([row.subject_key, row.total]);
  }
  const unmappedMatters = database.prepare(`
    SELECT COALESCE(q.materia, '<sem materia>') AS matter, COUNT(*) AS total
    FROM questions q
    WHERE NOT EXISTS (
      SELECT 1
      FROM subject_aliases sa
      JOIN exam_subject_weights w
        ON w.profile_id = ?
        AND w.subject_key = sa.subject_key
      WHERE sa.raw_materia = q.materia
        AND sa.source = ?
        AND (
          COALESCE(sa.raw_assunto, '') = ''
          OR q.assunto = sa.raw_assunto
          OR (
            sa.raw_assunto != REPLACE(sa.raw_assunto, '%', '')
            AND q.assunto LIKE sa.raw_assunto
          )
        )
    )
    GROUP BY COALESCE(q.materia, '<sem materia>')
    ORDER BY total DESC, matter
  `).all(profileId, aliasSource).map((row) => [row.matter, row.total]);

  return {
    questions,
    mapped,
    unmapped,
    unmappedMatters,
    distribution,
    validAnswerDistribution
  };
}

function buildAliasesForProfile(profileId, weights) {
  const labels = new Map(weights.map((item) => [item.subject_key, item.subject_label]));
  const block = new Map(weights.map((item) => [item.subject_key, item.block_key || '']));
  const aliases = [];
  const push = (rawMateria, subjectKey, confidence = 1) => {
    if (!labels.has(subjectKey)) return;
    aliases.push({
      rawMateria,
      rawAssunto: '',
      subjectKey,
      subjectLabel: labels.get(subjectKey),
      blockKey: block.get(subjectKey) || '',
      confidence
    });
  };
  const pushTopic = (rawMateria, rawAssunto, subjectKey, confidence = 1) => {
    if (!labels.has(subjectKey)) return;
    aliases.push({
      rawMateria,
      rawAssunto,
      subjectKey,
      subjectLabel: labels.get(subjectKey),
      blockKey: block.get(subjectKey) || '',
      confidence
    });
  };

  if (profileId === 'prf_2021_edital_blocos') {
    push('Legislação de Trânsito e Transportes', 'bloco_2_legislacao_transito');
    for (const matter of [
      'Língua Portuguesa (Português)',
      'Redação Oficial',
      'Informática',
      'Matemática',
      'Estatística',
      'Raciocínio Lógico',
      'Física',
      'Ética no Serviço Público',
      'TI - Ciência de Dados e Inteligência Artificial',
      'TI - Redes de Computadores',
      'TI - Banco de Dados',
      'TI - Desenvolvimento de Sistemas',
      'TI - Organização e Arquitetura dos Computadores',
      'TI - Segurança da Informação',
      'TI - Sistemas Operacionais'
    ]) push(matter, 'bloco_1_conhecimentos_basicos', 0.9);
    for (const matter of [
      'Direito Administrativo (Doutrina e Leis Federais)',
      'Direito Administrativo Estadual e do DF',
      'Direito Administrativo Municipal',
      'Administração Geral e Pública',
      'Direito Constitucional (CF/1988 e Doutrina)',
      'Direito Penal',
      'Direito Processual Penal',
      'Direitos Humanos',
      'Legislação Penal e Processual Penal Especial',
      'Legislação Geral Federal',
      'Segurança Pública e Legislação Policial'
    ]) push(matter, 'bloco_3_conhecimentos_especificos', 0.9);
    return aliases;
  }

  const specialKey = labels.has('legislacao_especial_prf') ? 'legislacao_especial_prf' : 'legislacao_especial';
  const geoKey = labels.has('geopolitica_conhecimentos_gerais') ? 'geopolitica_conhecimentos_gerais' : 'geopolitica';

  if (profileId === 'prf_principais') {
    addPrincipaisPrfTopicAliases(pushTopic, specialKey);
    return aliases;
  }

  push('Legislação de Trânsito e Transportes', 'legislacao_transito');
  push('Língua Portuguesa (Português)', 'portugues');
  push('Redação Oficial', 'portugues', 0.9);
  push('Direito Administrativo (Doutrina e Leis Federais)', 'direito_administrativo');
  push('Direito Administrativo Estadual e do DF', 'direito_administrativo', 0.75);
  push('Direito Administrativo Municipal', 'direito_administrativo', 0.75);
  push('Administração Geral e Pública', 'direito_administrativo', 0.75);
  push('Direito Constitucional (CF/1988 e Doutrina)', 'direito_constitucional');
  push('Direito Penal', 'direito_penal');
  push('Direito Processual Penal', 'direito_processual_penal');
  push('Informática', 'informatica');
  push('TI - Ciência de Dados e Inteligência Artificial', 'informatica', 0.85);
  push('TI - Redes de Computadores', 'informatica', 0.85);
  push('TI - Banco de Dados', 'informatica', 0.85);
  push('TI - Desenvolvimento de Sistemas', 'informatica', 0.85);
  push('TI - Organização e Arquitetura dos Computadores', 'informatica', 0.85);
  push('TI - Segurança da Informação', 'informatica', 0.85);
  push('TI - Sistemas Operacionais', 'informatica', 0.85);
  push('Matemática', 'raciocinio_logico_matematico');
  push('Estatística', 'raciocinio_logico_matematico', 0.85);
  push('Raciocínio Lógico', 'raciocinio_logico_matematico');
  push('Física', 'fisica');
  push('Direitos Humanos', 'direitos_humanos');
  push('Ética no Serviço Público', 'etica');
  push('Legislação Penal e Processual Penal Especial', specialKey);
  push('Legislação Geral Federal', specialKey, 0.85);
  push('Segurança Pública e Legislação Policial', specialKey, 0.8);
  push('Direito Internacional Público e Privado', specialKey, 0.6);
  push('Direito Digital', specialKey, 0.55);
  push('Legislação Civil e Processual Civil Especial', specialKey, 0.55);
  push('Legislação Específica dos Ministérios Públicos', specialKey, 0.55);
  push('Pedagogia', geoKey, 0.4);
  push('Segurança Privada e Transportes', geoKey, 0.4);
  return aliases;
}

function addPrincipaisPrfTopicAliases(pushTopic, specialKey) {
  const addMany = (rawMateria, subjectKey, patterns, confidence = 1) => {
    for (const pattern of patterns) pushTopic(rawMateria, pattern, subjectKey, confidence);
  };

  addMany('Legislação de Trânsito e Transportes', 'legislacao_transito', [
    '%Normas Gerais de Circulação%',
    '%Infrações%',
    '%Penalidades%',
    '%Medidas Administrativas%',
    '%Processo Administrativo%',
    '%Habilita%',
    '%Sistema Nacional de Trânsito%',
    '%Dos Veículos%',
    '%Registro de Veículos%',
    '%Sinalização%',
    '%973/2022%',
    '%985/2022%',
    '%882/2021%',
    '%993/2023%',
    '%960/2022%',
    '%432/2013%',
    '%789/2020%',
    '%969/2022%',
    '%525/2015%',
    '%798/2020%',
    '%819/2021%',
    '%508/2014%',
    '%623/2016%',
    '%24/1998%',
    '%927/2022%',
    '%941/2022%'
  ]);

  addMany('Língua Portuguesa (Português)', 'portugues', [
    '%Interpreta%',
    '%Reescrita%',
    '%Coer%',
    '%Coes%',
    '%Pontua%',
    '%Concord%',
    '%Clareza%',
    '%Tipologia%',
    '%Gênero Textual%',
    '%Significa%',
    '%Conjun%',
    '%Sinônimos%',
    '%Colocação%',
    '%Regência%',
    '%Crase%'
  ]);
  addMany('Redação Oficial', 'portugues', [
    '%Atributos da Redação Oficial%',
    '%Fechos%',
    '%Identificação do Signatário%',
    '%Pronomes de Tratamento%',
    '%Padrão Ofício%',
    '%Vocativos%',
    '%Correio Eletrônico%',
    '%Julgamento de Trechos%'
  ], 0.9);

  addMany('Direito Constitucional (CF/1988 e Doutrina)', 'direito_constitucional', [
    '%Direitos e Deveres Individuais%',
    '%Segurança Pública%',
    '%Princípios Fundamentais%',
    '%União:%',
    '%Direitos Políticos%',
    '%Soberania Popular%',
    '%Nacionalidade%',
    '%Separação de Poderes%',
    '%Direitos Sociais%',
    '%Forças Armadas%'
  ]);

  addMany('Direito Administrativo (Doutrina e Leis Federais)', 'direito_administrativo', [
    '%Poder de Polícia%',
    '%Regime Disciplinar%',
    '%Lei nº 8.112%',
    '%Atos Administrativos%',
    '%Responsabilidade%',
    '%Administração Indireta%',
    '%Administração Direta%',
    '%Desconcentração%',
    '%Descentralização%',
    '%Acesso à Informação%',
    '%Lei nº 12.527%',
    '%Poder Disciplinar%',
    '%Poder Hierárquico%'
  ]);

  addMany('Direito Penal', 'direito_penal', [
    '%Imputabilidade Penal%',
    '%Conflitos de Leis Penais no Tempo%',
    '%Dolo, Culpa%',
    '%Tentativa%',
    '%Erro de Tipo%',
    '%Erro de Proibição%',
    '%Legítima Defesa%',
    '%Ilicitude%',
    '%Furto%',
    '%Roubo%',
    '%Peculato%',
    '%Corrupção Passiva%',
    '%Concussão%',
    '%Falsidade Ideológica%',
    '%Crimes contra a Administração%'
  ]);

  addMany('Direito Processual Penal', 'direito_processual_penal', [
    '%Ação Penal%',
    '%Prisão em Flagrante%',
    '%Prova%',
    '%Perícias%',
    '%Busca e Apreensão%',
    '%Inquérito Policial%',
    '%Interrogatório%',
    '%Cadeia de Custódia%',
    '%Prisão%',
    '%Medidas Cautelares%'
  ]);

  addMany('Direitos Humanos', 'direitos_humanos', [
    '%Declaração Universal%',
    '%Direitos Humanos na Constituição%',
    '%CADH%',
    '%Tratados Internacionais%',
    '%Posição Hierárquica%'
  ]);

  addMany('Informática', 'informatica', [
    '%Segurança da Informação%',
    '%Ameaças%',
    '%Internet%',
    '%Protocolos de Redes%',
    '%Redes%',
    '%Computação em Nuvem%',
    '%Cloud Computing%',
    '%Firewall%',
    '%Webmails%',
    '%Correio Eletrônico%',
    '%Navegadores%',
    '%Sistemas Operacionais%',
    '%Windows 10%',
    '%Windows 11%'
  ]);
  addMany('TI - Ciência de Dados e Inteligência Artificial', 'informatica', [
    '%Big Data%',
    '%Business Intelligence%',
    '%Analytics%',
    '%Machine Learning%',
    '%Inteligência Artificial%'
  ], 0.85);
  addMany('TI - Redes de Computadores', 'informatica', ['%Internet das Coisas%', '%Cloud Computing%'], 0.85);
  addMany('TI - Segurança da Informação', 'informatica', ['%Transferência Segura%'], 0.85);

  addMany('Matemática', 'raciocinio_logico_matematico', [
    '%Função%',
    '%Porcentagem%',
    '%Progressão Aritmética%',
    '%Proporções%',
    '%Gráficos e Tabelas%',
    '%Geometria Espacial%',
    '%Equações de Primeiro Grau%',
    '%Equações de Segundo Grau%'
  ]);
  addMany('Estatística', 'raciocinio_logico_matematico', [
    '%Probabilidade%',
    '%Análise Combinatória%',
    '%Séries Estatísticas%',
    '%Desvio Padrão%',
    '%Variância%',
    '%Mediana%',
    '%Quartil%'
  ], 0.85);
  addMany('Raciocínio Lógico', 'raciocinio_logico_matematico', ['%Sequências%']);

  addMany('Física', 'fisica', [
    '%Cinemática%',
    '%Dinâmica%',
    '%Energia%',
    '%Trabalho%',
    '%Potência%',
    '%Quantidade de Movimento%',
    '%Impulso%',
    '%Colisões%',
    '%Atrito%',
    '%Movimento Circular%'
  ]);

  addMany('Legislação Penal e Processual Penal Especial', specialKey, [
    '%Crimes no Código de Trânsito Brasileiro%',
    '%Lei nº 9.503/1997%'
  ]);
  addMany('Segurança Pública e Legislação Policial', specialKey, [
    '%Competências da PRF%',
    '%Carreira de Policial Rodoviário Federal%',
    '%PRF%'
  ], 0.85);
  addMany('Legislação Geral Federal', specialKey, ['%Indenização de Fronteira%'], 0.75);
}

function seedAliases(database, aliases, source) {
  const upsert = database.prepare(`
    INSERT INTO subject_aliases (
      raw_materia, raw_assunto, subject_key, subject_label, confidence, source
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(raw_materia, raw_assunto, subject_key) DO UPDATE SET
      subject_label = excluded.subject_label,
      source = excluded.source,
      confidence = CASE
        WHEN subject_aliases.confidence > excluded.confidence THEN subject_aliases.confidence
        ELSE excluded.confidence
      END
  `);
  for (const alias of aliases) {
    upsert.run(alias.rawMateria, alias.rawAssunto, alias.subjectKey, alias.subjectLabel, alias.confidence, source);
  }
}

function aliasSourceForProfile(profileId) {
  return `seed:${profileId}`;
}

function getProfileWeights(database, profileId) {
  const rows = database.prepare(`
    SELECT *
    FROM exam_subject_weights
    WHERE profile_id = ?
  `).all(profileId);
  if (!rows.length) {
    throw new Error(`Perfil sem pesos: ${profileId}`);
  }
  return rows;
}

function getActiveProfile(database) {
  return database.prepare('SELECT id FROM exam_profiles WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get()?.id || '';
}

function bestAnswerSql(questionAlias, commentAlias) {
  return `CASE
    WHEN COALESCE(${questionAlias}.desatualizada, 0) = 1 THEN ''
    ELSE COALESCE(NULLIF(${questionAlias}.official_answer, ''), NULLIF((
    SELECT nq.answer
    FROM notebook_questions nq
    WHERE nq.question_id = ${questionAlias}.id_question
      AND COALESCE(nq.answer, '') != ''
    ORDER BY nq.notebook_id, nq.position
    LIMIT 1
  ), ''), NULLIF(${commentAlias}.extracted_answer, ''), '')
  END`;
}

function printReport(profileId, report) {
  console.log(`Perfil: ${profileId}`);
  console.log(`Questoes analisadas: ${report.questions}`);
  console.log(`Mapeadas: ${report.mapped}`);
  console.log(`Sem mapeamento: ${report.unmapped}`);
  console.log('');
  console.log('Distribuicao por subject_key');
  for (const [key, total] of report.distribution) console.log(`  ${key}: ${total}`);
  console.log('');
  console.log('Questoes validas com gabarito por subject_key');
  for (const [key, total] of report.validAnswerDistribution) console.log(`  ${key}: ${total}`);
  console.log('');
  console.log('Materias sem correspondencia');
  for (const [matter, total] of report.unmappedMatters.slice(0, 30)) console.log(`  ${total} - ${matter}`);
}

function ensureSchema(database) {
  for (const tableName of ['exam_profiles', 'exam_subject_weights', 'subject_aliases', 'question_exam_subjects']) {
    if (!database.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(tableName)) {
      throw new Error(`Tabela ausente: ${tableName}. Rode migrate-exam-profiles primeiro.`);
    }
  }
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
