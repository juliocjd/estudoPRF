# Pipeline de Teoria Aplicada (gerada por IA)

Gera um card de "Teoria aplicada" por questão: o que a questão cobra, a regra
aplicada, a pegadinha, as armadilhas e a conclusão. Onde há dispositivo legal
citado, o card é **ancorado** (trecho verbatim do CTB, lido do banco); onde não
há, sai como **`ai_reviewed`** com selo "Gerado por IA — confira".

A IA (agentes) escreve só a pedagogia e **sugere** o artigo do CTB. O texto da
lei nunca vem da IA — é resolvido contra `law_compendium_sections` na hora de
importar. Se o artigo sugerido não existir/vigorar, o card cai para "confira".

## Estado atual

- **Legislação de Trânsito**: 100% coberto (~2.388 cards; ~612 ancorados, o
  resto com selo — trânsito é muito baseado em Resolução CONTRAN/Anexo, sem
  artigo do CTB para ancorar).
- Demais matérias: pendentes. Como só o CTB está no compêndio, elas sairão
  quase todas como "confira" (a pedagogia é o valor; o selo é honesto).

## Como rodar para uma nova matéria

Substitua `"<MATÉRIA>"` pelo nome exato (veja os nomes em `/api/filters` ou no
seletor de matéria). Faça em **lotes de ~200** para não estourar o limite de
sessão do Claude no meio.

1. **Extrair** um lote (pula quem já tem card):
   ```
   node scripts/extract-theory-chunks.mjs --materia "<MATÉRIA>" --limit 200 --per 10 --out tmp/theory_chunks
   ```

2. **Gerar** com o run multiagente (via ferramenta Workflow do Claude Code):
   cada agente lê um `tmp/theory_chunks/chunk_NN.json`, escreve os cards em
   `tmp/theory_out/cards_NN.json`. O script do workflow está salvo em
   `.claude/.../workflows/scripts/gerar-teoria-transito-500-*.js` — reutilizável
   passando `args: {"count": <nº de chunks>}`. Ajuste a instrução do agente
   (que hoje só pede artigo do CTB) se a matéria tiver outra lei ancorável.

3. **Resolver âncoras + importar** (dry-run primeiro):
   ```
   node scripts/resolve-and-import-applied-theory.mjs --dir tmp/theory_out            # dry-run
   node scripts/resolve-and-import-applied-theory.mjs --dir tmp/theory_out --apply    # grava
   ```

4. Repetir 1–3 até `extract` retornar 0 questões.

## Observações

- Escreve direto no Postgres compartilhado (mesmo banco da Vercel); os cards
  aparecem em produção assim que o código de exibição está deployado (já está).
- Só mostra o card **depois** de responder a questão (regra de estudo).
- O selo/ancoragem é decidido no passo 3, não pela IA.
- Ancorar Resoluções CONTRAN foi avaliado e descartado: baixo ROI e vigência
  instável. O "confira" com pedagogia sólida atende. Ver o monitor de vigência
  (`/api/contran-resolutions/currency`) para o acompanhamento das substituições.
