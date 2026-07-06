#!/usr/bin/env node
/**
 * Áudio de lei seca para revisão passiva (deslocamento, treino físico).
 *
 * Monta roteiros dos artigos mais cobrados (agrupados por artigo, priorizados
 * por incidência em questões) e gera MP3 com voz neural pt-BR gratuita via
 * edge-tts (Microsoft). Sem edge-tts instalado, deixa os roteiros .txt prontos.
 *
 * Pré-requisito para o MP3 (uma vez):  pip install edge-tts
 *
 * Uso:
 *   node scripts/generate-law-audio.mjs               → gera roteiros + tenta MP3
 *   node scripts/generate-law-audio.mjs --top 30      → nº de artigos (padrão 30)
 *   node scripts/generate-law-audio.mjs --only-text   → só roteiros .txt
 */
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const onlyText = args.includes('--only-text');
const top = Number(value('top', 30));
const outDir = path.resolve(value('out', 'audio-lei-seca'));

const db = new DatabaseSync(path.resolve(value('db', 'questoes-prf.sqlite')));
fs.mkdirSync(outDir, { recursive: true });

// Agrupa seções por artigo, prioriza artigos com mais questões vinculadas.
const rows = db.prepare(`
  SELECT s.section_key, s.source_slug, s.text, s.order_index,
    (SELECT COUNT(*) FROM law_section_question_links l WHERE l.section_id = s.id) AS links
  FROM law_compendium_sections s
  WHERE s.is_current = 1 AND COALESCE(s.is_revoked, 0) = 0 AND LENGTH(s.text) >= 25
  ORDER BY s.order_index
`).all();

const articles = new Map();
for (const row of rows) {
  const parts = String(row.section_key || '').split(':');
  const artPart = parts.find((part) => part.startsWith('art_'));
  if (!artPart) continue;
  const key = `${row.source_slug}:${artPart}`;
  if (!articles.has(key)) {
    articles.set(key, { key, source: row.source_slug, art: artPart, texts: [], links: 0, order: row.order_index });
  }
  const article = articles.get(key);
  article.texts.push(String(row.text).replace(/\s+/g, ' ').trim());
  article.links += Number(row.links || 0);
}

const ranked = [...articles.values()]
  .sort((a, b) => b.links - a.links || a.order - b.order)
  .slice(0, top);

const sourceNames = { lei_9503_1997_ctb_compilado: 'CTB' };
const cleanArt = (art) => art.replace('art_', '').replace(/_/g, '-').toUpperCase();

let index = 0;
const playlist = [];
for (const article of ranked) {
  index += 1;
  const sourceName = sourceNames[article.source] || article.source;
  const title = `${String(index).padStart(2, '0')} - ${sourceName} art ${cleanArt(article.art)}`;
  const script = [
    `${sourceName}, artigo ${cleanArt(article.art)}.`,
    ...article.texts.map((text) => text
      // limpa marcações que atrapalham a narração
      .replace(/\((Inclu[íi]do|Reda[çc][ãa]o dada|Revogado|Vig[êe]ncia)[^)]*\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim())
  ].filter(Boolean).join('\n');

  const txtPath = path.join(outDir, `${title}.txt`);
  fs.writeFileSync(txtPath, script, 'utf8');

  if (!onlyText) {
    const mp3Path = path.join(outDir, `${title}.mp3`);
    const result = spawnSync('edge-tts', [
      '--voice', 'pt-BR-AntonioNeural',
      '--rate', '+10%',
      '--file', txtPath,
      '--write-media', mp3Path
    ], { stdio: 'pipe' });
    if (result.status === 0) {
      playlist.push(path.basename(mp3Path));
      console.log(`♪ ${title}.mp3`);
    } else if (index === 1) {
      console.log('edge-tts não encontrado — gerando apenas roteiros .txt.');
      console.log('Para os MP3: pip install edge-tts  e rode de novo.\n');
    }
  }
  if (onlyText || !playlist.length) console.log(`txt: ${title}`);
}

if (playlist.length) {
  fs.writeFileSync(path.join(outDir, 'lei-seca.m3u'), playlist.join('\n'), 'utf8');
  console.log(`\n${playlist.length} MP3 + playlist lei-seca.m3u em ${outDir}`);
} else {
  console.log(`\n${ranked.length} roteiros em ${outDir} (MP3 pendente de edge-tts).`);
}
