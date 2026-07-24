export const meta = {
  name: 'inferir-gabarito',
  description: 'Infere gabarito das questoes sem resposta a partir do comentario do professor (duplo passe independente + concordancia)',
  phases: [
    { title: 'Inferir', detail: 'passe A: agente le o lote e infere do comentario' },
    { title: 'Conferir', detail: 'passe B independente; so aceita se concordar' }
  ]
};

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : (args || {});
const N = Number(parsedArgs.batches || 0);

const INFER_SCHEMA = {
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
          answer: { type: 'string', description: "CERTO, ERRADO, A, B, C, D, E ou vazio" },
          confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          evidence: { type: 'string' }
        },
        required: ['id', 'determinable', 'answer', 'confidence', 'evidence']
      }
    }
  },
  required: ['results']
};

const prompt = (idx) => `Voce vai inferir o GABARITO de questoes do concurso da PRF a partir do COMENTARIO DO PROFESSOR.

Leia o arquivo tmp/gab-batches/batch-${String(idx).padStart(3, '0')}.json (um array de questoes; cada uma tem: id, type ("CERTO_ERRADO" ou "MULTIPLA_ESCOLHA"), statement, alternatives, comment).

Para CADA questao do lote, determine a resposta correta USANDO SOMENTE o comentario do professor (ele explica o porque, mesmo sem cravar "certo/errado"):
- type CERTO_ERRADO: answer = "CERTO" ou "ERRADO".
- type MULTIPLA_ESCOLHA: answer = a letra (A, B, C, D ou E) que o comentario aponta como correta.
- Se o comentario NAO permitir determinar com seguranca: determinable=false, answer="", confidence="baixa".
- confidence: "alta" se o comentario deixa claro; "media" se da para inferir com boa base; "baixa" se duvidoso.
- evidence: cite o TRECHO EXATO do comentario que sustenta a resposta (curto, uma frase).
- NAO invente. Na duvida, determinable=false (melhor sem gabarito do que gabarito errado).
- Atencao a negacoes e pegadinhas ("somente", "sempre", "apenas") e ao enunciado que pede a INCORRETA.

Retorne um item por questao do lote (todos os ids), no schema pedido.`;

const batches = Array.from({ length: N }, (_, i) => i);

const results = await pipeline(
  batches,
  (idx) => agent(prompt(idx), { schema: INFER_SCHEMA, phase: 'Inferir', label: `infer:${idx}` }),
  (passA, idx) => agent(prompt(idx), { schema: INFER_SCHEMA, phase: 'Conferir', label: `conferir:${idx}` })
    .then((passB) => ({ passA, passB }))
);

const norm = (v) => String(v || '').trim().toUpperCase();
const accepted = [];
let considered = 0;
for (const r of results.filter(Boolean)) {
  const a = (r.passA && r.passA.results) || [];
  const bMap = new Map(((r.passB && r.passB.results) || []).map((x) => [x.id, x]));
  for (const ia of a) {
    considered += 1;
    const ib = bMap.get(ia.id);
    if (!ib) continue;
    const ansA = norm(ia.answer);
    const ansB = norm(ib.answer);
    if (ia.determinable && ib.determinable && ansA && ansA === ansB
        && ia.confidence !== 'baixa' && ib.confidence !== 'baixa') {
      accepted.push({ id: ia.id, answer: ansA, confidence: ia.confidence, evidence: ia.evidence });
    }
  }
}

log(`considered=${considered} aceitas(concordancia)=${accepted.length}`);
return { considered, accepted };
