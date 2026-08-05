// Gatilho "à prova de futuro": quando uma resolução em que correções pela lei
// atual se basearam é SUPERADA, volta essas correções para needs_audit (o app
// passa a avisar "reauditar"). O curador roda isto ao saber de uma mudança —
// informando a resolução superada — ou usa o que o mapa CONTRAN já registra.
//
// Casa a resolução extraída de source_version + legal_basis + article_reference.
//   node --env-file=.env scripts/revalidate-current-law.mjs --from-map               # prévia (mapa)
//   node --env-file=.env scripts/revalidate-current-law.mjs --superseded 960/2022    # prévia (informado)
//   node --env-file=.env scripts/revalidate-current-law.mjs --superseded 960/2022 --apply
import postgres from 'postgres';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const useMap = argv.includes('--from-map');
const idx = argv.indexOf('--superseded');
const cliKeys = idx >= 0 && argv[idx + 1] ? argv[idx + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];

const REF_RE = /(\d[\d.]{0,6})\s*\/\s*((?:19|20)\d{2})/;
const parseRef = (t) => {
  const m = String(t || '').match(REF_RE);
  return m ? `${Number(String(m[1]).replace(/\./g, ''))}/${m[2]}` : '';
};
const extractRefs = (...texts) => {
  const out = new Set();
  const re = new RegExp(REF_RE, 'g');
  for (const t of texts) { const s = String(t || ''); let m; while ((m = re.exec(s))) out.add(`${Number(String(m[1]).replace(/\./g, ''))}/${m[2]}`); }
  return out;
};

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  const superseded = new Set();
  for (const k of cliKeys) { const kk = parseRef(k); if (kk) superseded.add(kk); }
  if (useMap) {
    const rows = await sql`
      SELECT source_number, source_year, source_aliases
      FROM contran_prf_2021_current_map
      WHERE COALESCE(target_number::text, '') <> ''
        AND (target_number::text <> source_number::text OR target_year::text <> source_year::text)`;
    for (const r of rows) {
      const k = parseRef(`${r.source_number}/${r.source_year}`);
      if (k) superseded.add(k);
      const aliases = Array.isArray(r.source_aliases) ? r.source_aliases : [];
      for (const a of aliases) { const ak = parseRef(a); if (ak) superseded.add(ak); }
    }
  }
  if (useMap) {
    console.log('AVISO: --from-map é agressivo — casa correções que apenas CITAM a resolução');
    console.log('antiga para explicar que ela mudou (essas já estão corretas). Confira a lista antes de --apply.\n');
  }
  console.log('resoluções superadas consideradas:', [...superseded].join(', ') || '(nenhuma)');
  if (!superseded.size) { console.log('Nada a fazer (informe --superseded e/ou --from-map).'); await sql.end(); process.exit(0); }

  const corrections = await sql`
    SELECT question_id, source_version, legal_basis, article_reference, current_law_status, raw_json
    FROM question_current_law_answers`;
  const flips = [];
  for (const r of corrections) {
    // Só a base efetiva (source_version/article_reference), nunca legal_basis
    // (que cita a lei antiga só para explicar — geraria falso-positivo).
    const refs = extractRefs(r.source_version, r.article_reference);
    const hit = [...refs].find((k) => superseded.has(k));
    if (!hit) continue;
    const raw = (r.raw_json && typeof r.raw_json === 'object') ? r.raw_json : {};
    if (raw?.revalidation?.supersededFrom === hit) continue; // idempotente
    flips.push({ questionId: Number(r.question_id), hit, prev: r.current_law_status, raw });
  }
  console.log(`\ncorreções que casam com resolução superada: ${flips.length}`);
  for (const f of flips.slice(0, 30)) console.log(`  Q${f.questionId} | base ${f.hit} | status ${f.prev} -> needs_audit`);
  if (flips.length > 30) console.log(`  ... +${flips.length - 30}`);

  if (!apply) { console.log('\nDRY-RUN (use --apply para gravar).'); await sql.end(); process.exit(0); }

  let n = 0;
  for (const f of flips) {
    const nextRaw = { ...f.raw, revalidation: { supersededFrom: f.hit, supersededTo: '', at: new Date().toISOString(), previousStatus: f.prev } };
    await sql`
      UPDATE question_current_law_answers
      SET current_law_status = 'needs_audit', can_auto_score_current_law = false,
          raw_json = ${sql.json(nextRaw)}, updated_at = now()
      WHERE question_id = ${f.questionId}`;
    n += 1;
  }
  console.log(`\nAPLICADO: ${n} correções voltaram para needs_audit.`);
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1; } finally { await sql.end(); }
