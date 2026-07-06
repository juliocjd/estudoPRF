#!/usr/bin/env node
/**
 * Deck de GRAMÁTICA — cards de alto rendimento no padrão Cebraspe,
 * inseridos no mesmo motor de flashcards da lei seca (FSRS).
 *
 * Conteúdo curado: crase, concordância, regência, pontuação,
 * colocação pronominal e semântica/reescritura.
 *
 * Uso:
 *   node scripts/seed-grammar-cards.mjs            → dry-run (mostra amostra)
 *   node scripts/seed-grammar-cards.mjs --apply    → grava no SQLite
 *   (depois: node scripts/migrate-law-cloze-postgres.mjs para levar ao Postgres)
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dbPath = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'questoes-prf.sqlite';
const db = new DatabaseSync(path.resolve(dbPath));

const SOURCE = 'gramatica_portugues';
const VERSION = 'grammar-deck-v1';

/** [categoria, dica, texto com _______, resposta, prioridade] */
const CARDS = [
  // ===== CRASE =====
  ['crase', 'Crase', 'Antes de palavra MASCULINA, usar crase é _______ (ex.: "andar a pé", "vender a prazo").', 'proibido', 30],
  ['crase', 'Crase', '"Refiro-me _______ pessoas que chegaram cedo." (a + as = ?)', 'às', 30],
  ['crase', 'Crase', 'Antes de verbo, crase é _______ (ex.: "começou a chover").', 'proibida', 30],
  ['crase', 'Crase', '"Fique atento _______ mudanças na lei." — atento exige preposição A + artigo AS.', 'às', 28],
  ['crase', 'Crase', 'Em locuções femininas como "_______ vezes", "à noite", "às pressas", a crase é obrigatória.', 'às', 28],
  ['crase', 'Crase', '"Dirigiu-se _______ delegacia" leva crase; "Dirigiu-se a ela" não, porque antes de pronome pessoal a crase é _______.', 'à / proibida', 27],
  ['crase', 'Crase', '"De segunda _______ sexta" — com "de... a...", sem artigo, a crase é proibida.', 'a', 26],
  ['crase', 'Crase', '"Entregou o documento _______ Vossa Senhoria." Antes de pronome de tratamento (exceto senhora, senhorita, dona), crase _______.', 'a / não ocorre', 25],
  ['crase', 'Crase', '"Estava disposto _______ colaborar" — antes de verbo no infinitivo: sem crase. Já "disposto _______ colaboração": com crase.', 'a / à', 25],
  ['crase', 'Crase', 'Distância DETERMINADA leva crase: "a 200 metros" fica _______ 200 metros? (sim/não)', 'não — "a 200 metros" nunca tem crase; crase só em "à distância de 200 metros"', 24],
  // ===== CONCORDÂNCIA VERBAL =====
  ['concordancia_verbal', 'Concordância verbal', '"_______ dez anos que ele trabalha na PRF." (verbo HAVER no sentido de tempo decorrido fica no singular)', 'Faz', 30],
  ['concordancia_verbal', 'Concordância verbal', '"_______ muitos acidentes naquela rodovia." (HAVER no sentido de existir é impessoal)', 'Houve', 30],
  ['concordancia_verbal', 'Concordância verbal', '"A maioria dos condutores _______ as regras." (coletivo partitivo: singular ou plural — ambos corretos)', 'respeita/respeitam', 28],
  ['concordancia_verbal', 'Concordância verbal', '"_______ -se de documentos falsos." (verbo transitivo INDIRETO com SE = índice de indeterminação → singular)', 'Trata', 28],
  ['concordancia_verbal', 'Concordância verbal', '"Vendem-se _______ ." (verbo transitivo direto com SE = voz passiva sintética → concorda com o sujeito)', 'casas', 28],
  ['concordancia_verbal', 'Concordância verbal', '"Mais de um policial _______ ao local." (MAIS DE UM → verbo no singular)', 'compareceu', 26],
  ['concordancia_verbal', 'Concordância verbal', '"Um dos que _______ " — com "um dos que", a banca aceita plural (preferencial) ou singular.', 'chegaram/chegou', 24],
  ['concordancia_verbal', 'Concordância verbal', '"Deu _______ horas no relógio da igreja." (verbo DAR + horas concorda com o número)', 'dez', 24],
  ['concordancia_verbal', 'Concordância verbal', '"Os Estados Unidos _______ a medida." (nome próprio plural COM artigo → verbo no plural)', 'aprovaram', 23],
  ['concordancia_verbal', 'Concordância verbal', '"Sou eu quem _______ ." (com QUEM: 3ª pessoa é o padrão; com QUE, concorda com o pronome: "sou eu que pago")', 'paga', 23],
  // ===== CONCORDÂNCIA NOMINAL =====
  ['concordancia_nominal', 'Concordância nominal', '"É _______ entrada de estranhos." / "É proibida A entrada." (sem artigo → invariável; com artigo → concorda)', 'proibido a', 28],
  ['concordancia_nominal', 'Concordância nominal', '"Seguem _______ os documentos." (ANEXO concorda com o substantivo; "em anexo" é invariável)', 'anexos', 28],
  ['concordancia_nominal', 'Concordância nominal', '"Ela _______ disse que viria." (MESMO como reforço concorda: ela mesma, eles mesmos)', 'mesma', 26],
  ['concordancia_nominal', 'Concordância nominal', '"Estamos _______ com as ocorrências." (ALERTA é advérbio: invariável)', 'alerta', 26],
  ['concordancia_nominal', 'Concordância nominal', '"Havia _______ pessoas na fila." (BASTANTE como adjetivo = muitas → varia)', 'bastantes', 25],
  ['concordancia_nominal', 'Concordância nominal', '"Meio-dia e _______ ." (MEIA concorda com "hora", subentendido)', 'meia', 24],
  ['concordancia_nominal', 'Concordância nominal', '"A vítima estava _______ nervosa." (MEIO como advérbio = um pouco → invariável)', 'meio', 24],
  // ===== REGÊNCIA =====
  ['regencia', 'Regência', '"Assistir _______ filme" (ver = transitivo indireto na norma culta)', 'ao', 30],
  ['regencia', 'Regência', '"O policial visava _______ promoção." (visar = almejar pede preposição A)', 'à', 28],
  ['regencia', 'Regência', '"Prefiro estudar _______ dormir." (preferir: A, nunca "do que")', 'a', 28],
  ['regencia', 'Regência', '"Obedecer _______ sinalização é dever de todos." (obedecer é transitivo indireto)', 'à', 28],
  ['regencia', 'Regência', '"Informou o fato _______ delegado" ou "informou o delegado _______ fato" — informar: pessoa OU coisa leva preposição, nunca os dois sem.', 'ao / do', 26],
  ['regencia', 'Regência', '"Chegou _______ local dos fatos." (chegar/ir pedem A na norma culta, não EM)', 'ao', 26],
  ['regencia', 'Regência', '"O filme _______ gosto passou na TV." (gostar DE → o relativo vira DE QUE)', 'de que', 26],
  ['regencia', 'Regência', '"A decisão _______ discordo foi publicada." (discordar DE → relativo: DE QUE / DA QUAL)', 'de que', 25],
  ['regencia', 'Regência', '"Esqueci-me _______ ocorrido." (esquecer pronominal pede DE; sem pronome, direto: "esqueci o ocorrido")', 'do', 25],
  ['regencia', 'Regência', '"Custou _______ acreditar na versão." (custar = ser difícil: o "difícil" é sujeito → "custou-ME acreditar", nunca "eu custei")', 'ao investigador', 22],
  // ===== PONTUAÇÃO =====
  ['pontuacao', 'Pontuação', 'Vírgula entre SUJEITO e VERBO é _______ (erro clássico que a banca planta).', 'proibida', 30],
  ['pontuacao', 'Pontuação', 'Oração adjetiva EXPLICATIVA vem _______ vírgulas; a RESTRITIVA, sem. (A troca muda o sentido — pegadinha Cebraspe.)', 'entre', 30],
  ['pontuacao', 'Pontuação', 'Adjunto adverbial DESLOCADO no início da frase: vírgula _______ (obrigatória se longo, facultativa se curto).', 'recomendada', 26],
  ['pontuacao', 'Pontuação', '"Os agentes abordaram o veículo_______ os ocupantes fugiram." Duas orações com sujeitos diferentes ligadas sem conjunção: usa-se _______.', '; (ponto e vírgula)', 25],
  ['pontuacao', 'Pontuação', 'Vírgula antes de "E" é possível quando os sujeitos são _______ ou o E tem valor adversativo.', 'diferentes', 25],
  ['pontuacao', 'Pontuação', 'O aposto explicativo vem entre _______ (vírgulas, travessões ou parênteses).', 'vírgulas', 24],
  ['pontuacao', 'Pontuação', 'Retirar as vírgulas de uma explicativa transforma-a em restritiva: o sentido _______ e a banca considera a reescrita _______.', 'muda / incorreta (altera o sentido)', 27],
  // ===== PRONOMES / COLOCAÇÃO =====
  ['colocacao', 'Colocação pronominal', 'Palavra NEGATIVA antes do verbo _______ a próclise: "Não _______ viu."', 'exige / se', 28],
  ['colocacao', 'Colocação pronominal', 'Iniciar frase com pronome oblíquo ("Me dá") é _______ na norma culta escrita.', 'proibido', 28],
  ['colocacao', 'Colocação pronominal', 'Advérbio antes do verbo atrai o pronome: "Sempre _______ dedicou ao trabalho."', 'se', 26],
  ['colocacao', 'Colocação pronominal', 'Futuro do presente/pretérito NÃO aceita ênclise: "dir-_______-á" (mesóclise) ou próclise.', 'se-lhe → mesóclise: dir-se-á', 23],
  ['colocacao', 'Pronomes', '"Entre mim e _______ não há segredos." (depois de preposição: pronome oblíquo tônico, nunca "eu"... exceto com verbo: "para EU fazer")', 'ti', 25],
  ['colocacao', 'Pronomes', '"Convidaram ele" está _______ na norma culta; o correto é "convidaram-_______".', 'errado / no (convidaram-no)', 25],
  // ===== SEMÂNTICA / REESCRITURA (padrão Cebraspe) =====
  ['reescritura', 'Reescritura Cebraspe', 'Na reescritura, trocar "DEVE" por "PODE" (ou vice-versa) _______ o sentido — obrigação ≠ possibilidade.', 'altera', 30],
  ['reescritura', 'Reescritura Cebraspe', 'Trocar "AINDA QUE" (concessão) por "DESDE QUE" (condição) _______ o sentido original.', 'altera', 28],
  ['reescritura', 'Reescritura Cebraspe', '"PORQUANTO" equivale a _______ (causa/explicação: porque, visto que).', 'porque', 26],
  ['reescritura', 'Reescritura Cebraspe', '"NÃO OBSTANTE" tem valor _______ (equivale a "apesar disso").', 'concessivo/adversativo', 26],
  ['reescritura', 'Reescritura Cebraspe', 'Substituir voz passiva por ativa mantém a correção, mas a banca considera que mantém o sentido apenas se agente e paciente ficarem _______.', 'inalterados (mesmos papéis)', 25],
  ['reescritura', 'Reescritura Cebraspe', '"EM QUE PESE" tem valor _______ e na norma culta rege a preposição A: "em que pese AOS críticos".', 'concessivo', 23],
  ['reescritura', 'Reescritura Cebraspe', 'Deslocar "APENAS" muda o alcance: "apenas o agente multou" ≠ "o agente apenas multou" — o sentido _______.', 'muda', 27],
  ['reescritura', 'Reescritura Cebraspe', '"ONDE" só pode retomar _______; para tempo ou situação, usa-se "em que".', 'lugar físico', 27],
];

console.log(`Deck de gramática: ${CARDS.length} cards`);
const byCategory = CARDS.reduce((acc, card) => { acc[card[0]] = (acc[card[0]] || 0) + 1; return acc; }, {});
console.log('Por categoria:', JSON.stringify(byCategory));

if (!apply) {
  console.log('\n=== AMOSTRA (dry-run — use --apply para gravar) ===');
  for (const card of CARDS.slice(0, 4)) {
    console.log(`\n[${card[1]}] ${card[2]}`);
    console.log(`  → ${card[3]}`);
  }
  process.exit(0);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS law_cloze_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL,
    source_slug TEXT NOT NULL,
    source_label TEXT,
    ref TEXT,
    cloze_text TEXT NOT NULL,
    answer TEXT NOT NULL,
    category TEXT NOT NULL,
    hint TEXT,
    priority REAL DEFAULT 0,
    generator_version TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(section_id, category, answer)
  )
`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO law_cloze_cards (
    section_id, source_slug, source_label, ref, cloze_text, answer, category, hint, priority, generator_version
  ) VALUES (?, ?, 'Gramática', ?, ?, ?, ?, ?, ?, ?)
`);

db.exec('BEGIN');
try {
  let inserted = 0;
  CARDS.forEach((card, index) => {
    const [category, hint, text, answer, priority] = card;
    // section_id negativo: não colide com seções do compêndio legal
    const result = insert.run(-(1000 + index), SOURCE, hint, text, answer, category, hint, priority, VERSION);
    inserted += Number(result.changes || 0);
  });
  db.exec('COMMIT');
  console.log(`\nGravados ${inserted} cards de gramática (duplicados ignorados).`);
  console.log('Leve ao Postgres com: node scripts/migrate-law-cloze-postgres.mjs');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
