export const meta = {
  name: 'resolver-gabarito',
  description: 'Resolve E comenta questoes SEM comentario, do zero (triplo passe independente; so aceita unanime + confianca alta)',
  phases: [{ title: 'Resolver', detail: '3 agentes independentes resolvem+explicam cada lote' }]
};

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : (args || {});
const N = Number(parsedArgs.batches || 0);

const SOLVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'integer' },
          determinable: { type: 'boolean' },
          answer: { type: 'string', description: 'CERTO, ERRADO, A, B, C, D, E ou vazio' },
          confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          explanation: { type: 'string', description: 'Resolucao pedagogica curta e correta (2-5 frases), citando o fundamento (lei/artigo/conceito/calculo).' }
        },
        required: ['id', 'determinable', 'answer', 'confidence', 'explanation']
      }
    }
  },
  required: ['results']
};

const prompt = (idx) => `Voce e um professor especialista resolvendo questoes do concurso da PRF (banca CEBRASPE).

Leia tmp/gab-batches/batch-${String(idx).padStart(3, '0')}.json (array de questoes; cada uma tem id, type ("CERTO_ERRADO" ou "MULTIPLA_ESCOLHA"), materia, assunto, statement, alternatives). NAO ha comentario nem gabarito oficial — voce deve RESOLVER do zero.

Para CADA questao:
- Determine a resposta correta: CERTO_ERRADO -> "CERTO"/"ERRADO"; MULTIPLA_ESCOLHA -> a letra (A-E).
- Escreva uma explanation pedagogica CURTA e CORRETA (2-5 frases) citando o fundamento (lei/artigo, conceito ou calculo passo a passo em fisica/matematica).
- confidence: "alta" so se voce tem certeza tecnica; "media" se provavel; "baixa" se incerto.
- Se a questao depende de um TEXTO/IMAGEM/TABELA externo que NAO esta no statement (ex.: "com base no texto acima", grafico), ou se voce nao tem certeza: determinable=false, answer="", confidence="baixa".
- Rigor juridico/tecnico: atencao a pegadinhas ("somente", "sempre"), negacoes, e ao enunciado que pede a INCORRETA. NAO invente dispositivo legal.

Retorne um item por questao (todos os ids), no schema pedido.`;

const batches = Array.from({ length: N }, (_, i) => i);

// Triplo passe INDEPENDENTE por lote.
const results = await pipeline(batches, (idx) => parallel([
  () => agent(prompt(idx), { schema: SOLVE_SCHEMA, phase: 'Resolver', label: `p1:${idx}` }),
  () => agent(prompt(idx), { schema: SOLVE_SCHEMA, phase: 'Resolver', label: `p2:${idx}` }),
  () => agent(prompt(idx), { schema: SOLVE_SCHEMA, phase: 'Resolver', label: `p3:${idx}` })
]));

const norm = (v) => String(v || '').trim().toUpperCase();
const accepted = [];
let considered = 0;
for (const passes of results.filter(Boolean)) {
  const [A, B, C] = passes;
  if (!A || !B || !C) continue;
  const mapB = new Map((B.results || []).map((x) => [x.id, x]));
  const mapC = new Map((C.results || []).map((x) => [x.id, x]));
  for (const a of (A.results || [])) {
    considered += 1;
    const b = mapB.get(a.id);
    const c = mapC.get(a.id);
    if (!b || !c) continue;
    const ans = norm(a.answer);
    const unanime = a.determinable && b.determinable && c.determinable
      && ans && ans === norm(b.answer) && ans === norm(c.answer);
    const confAlta = a.confidence === 'alta' && b.confidence === 'alta' && c.confidence === 'alta';
    if (unanime && confAlta) {
      // usa a explicacao mais completa entre os 3 (todos concordam na resposta)
      const best = [a, b, c].sort((x, y) => (y.explanation || '').length - (x.explanation || '').length)[0];
      accepted.push({ id: a.id, answer: ans, explanation: best.explanation });
    }
  }
}

log(`considered=${considered} aceitas(unanime+alta)=${accepted.length}`);
return { considered, accepted };
