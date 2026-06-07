#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
const { Client } = pg;
function parseArgs(argv){const o={}; for(let i=0;i<argv.length;i++){const a=argv[i]; if(a.startsWith('--')){const k=a.slice(2); const v=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true; o[k]=v;}} return o;}
const args=parseArgs(process.argv.slice(2));
const file=args.file || 'data/question_applied_theory_cards_golden_seed_v5.json';
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl){console.error('Defina DATABASE_URL.'); process.exit(1);}
const raw=await fs.readFile(path.resolve(file),'utf8');
const parsed=JSON.parse(raw); const items=Array.isArray(parsed)?parsed:parsed.items;
const client=new Client({connectionString:databaseUrl}); await client.connect();
let upserted=0;
for(const item of items){
  await client.query(`INSERT INTO question_applied_theory_cards (
    question_id, card_status, source_mode, historical_answer, current_answer, answer_changed, no_valid_alternative,
    title, question_focus, rule_that_solves_this_question, legal_basis, article_excerpt,
    applied_explanation, rule_summary_bullets, professor_tip, common_traps, study_conclusion, show_warning,
    show_before_answer, show_after_answer, source_urls, teaching_card_md, teaching_card_html, generated_by, verified_status, updated_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,$17,$18,$19,$20,$21::jsonb,$22,$23,$24,$25,now())
  ON CONFLICT (question_id) DO UPDATE SET
    card_status=EXCLUDED.card_status, source_mode=EXCLUDED.source_mode, historical_answer=EXCLUDED.historical_answer,
    current_answer=EXCLUDED.current_answer, answer_changed=EXCLUDED.answer_changed, no_valid_alternative=EXCLUDED.no_valid_alternative,
    title=EXCLUDED.title, question_focus=EXCLUDED.question_focus, rule_that_solves_this_question=EXCLUDED.rule_that_solves_this_question,
    legal_basis=EXCLUDED.legal_basis, article_excerpt=EXCLUDED.article_excerpt, applied_explanation=EXCLUDED.applied_explanation,
    rule_summary_bullets=EXCLUDED.rule_summary_bullets, professor_tip=EXCLUDED.professor_tip, common_traps=EXCLUDED.common_traps,
    study_conclusion=EXCLUDED.study_conclusion, show_warning=EXCLUDED.show_warning, show_before_answer=EXCLUDED.show_before_answer,
    show_after_answer=EXCLUDED.show_after_answer, source_urls=EXCLUDED.source_urls, teaching_card_md=EXCLUDED.teaching_card_md,
    teaching_card_html=EXCLUDED.teaching_card_html, generated_by=EXCLUDED.generated_by, verified_status=EXCLUDED.verified_status, updated_at=now()`, [
      item.question_id, item.card_status, item.source_mode, item.historical_answer||null, item.current_answer||null, item.answer_changed,
      Boolean(item.no_valid_alternative), item.title, item.question_focus, item.rule_that_solves_this_question, item.legal_basis, item.article_excerpt||null,
      item.applied_explanation, JSON.stringify(item.rule_summary_bullets||[]), item.professor_tip||null, JSON.stringify(item.common_traps||[]),
      item.study_conclusion, item.show_warning||null, Boolean(item.show_before_answer), item.show_after_answer!==false,
      JSON.stringify(item.source_urls||[]), item.teaching_card_md||null, item.teaching_card_html||null, item.generated_by||'import', item.verified_status||'unverified'
    ]);
  upserted++;
}
console.log(JSON.stringify({upserted},null,2));
await client.end();
