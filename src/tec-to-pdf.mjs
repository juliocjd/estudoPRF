import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DEFAULT_CONFIG = {
  urlsFile: 'aulas.txt',
  outputDir: 'pdfs',
  browserProfileDir: '.browser-profile',
  headless: false,
  defaultTimeoutMs: 45000,
  settleMs: 1500,
  pdf: {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: {
      top: '12mm',
      right: '10mm',
      bottom: '12mm',
      left: '10mm'
    }
  },
  selectors: {
    ready: 'body',
    content: '',
    title: 'h1',
    printButton: 'a[href*="/imprimir-capitulo"]'
  },
  collect: {
    startUrl: '',
    linkSelector: 'a[href]',
    includePattern: '',
    outputFile: 'aulas.generated.txt'
  },
  prf: {
    guideUrl: 'https://www.tecconcursos.com.br/guias/prf-2021/policial-rodoviario-federal/-/-',
    outputFile: 'aulas.prf.txt',
    reportFile: 'aulas.prf.json',
    resolvePrintLinks: true,
    delayMs: 700
  }
};

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const args = parseArgs(argv);
  const config = await loadConfig(args.config);

  if (!command || ['-h', '--help', 'help'].includes(command)) {
    printHelp();
    return;
  }

  if (command === 'login') {
    await login(config, args);
    return;
  }

  if (command === 'pdf') {
    await exportPdfs(config, args);
    return;
  }

  if (command === 'pdf-prf') {
    await exportPrfPdfs(config, args);
    return;
  }

  if (command === 'organize-prf') {
    await organizePrfPdfs(config, args);
    return;
  }

  if (command === 'order-prf') {
    await orderPrfPdfs(config, args);
    return;
  }

  if (command === 'questions-prf') {
    await collectPrfQuestions(config, args);
    return;
  }

  if (command === 'backfill-answers-prf') {
    await backfillPrfCommentAnswers(config, args);
    return;
  }

  if (command === 'ai-comments-prf') {
    await generatePrfAiComments(config, args);
    return;
  }

  if (command === 'assets-prf') {
    await collectPrfCommentAssets(config, args);
    return;
  }

  if (command === 'collect') {
    await collectLinks(config, args);
    return;
  }

  if (command === 'collect-prf') {
    await collectPrfGuide(config, args);
    return;
  }

  throw new Error(`Comando desconhecido: ${command}`);
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

async function loadConfig(configPath) {
  if (!configPath) {
    return DEFAULT_CONFIG;
  }

  const raw = await fs.readFile(configPath, 'utf8');
  const userConfig = JSON.parse(raw);
  return mergeConfig(DEFAULT_CONFIG, userConfig);
}

function mergeConfig(base, override) {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      merged[key] = mergeConfig(base[key], value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return Boolean(fallback);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return !['0', 'false', 'no', 'nao', 'não'].includes(String(value).toLowerCase());
}

async function launchContext(config) {
  const userDataDir = path.resolve(config.browserProfileDir);
  return chromium.launchPersistentContext(userDataDir, {
    headless: Boolean(config.headless),
    acceptDownloads: true,
    viewport: { width: 1366, height: 900 }
  });
}

async function login(config, args) {
  const context = await launchContext(config);
  const page = await getFirstPage(context);
  page.setDefaultTimeout(config.defaultTimeoutMs);

  if (args['start-url']) {
    await page.goto(args['start-url'], { waitUntil: 'domcontentloaded' });
  }

  const rl = readline.createInterface({ input, output });
  await rl.question('Faça o login no navegador aberto e pressione Enter aqui para salvar a sessão...');
  rl.close();
  await context.close();
}

async function exportPdfs(config, args) {
  const urlsFile = args.urls || config.urlsFile;
  const urls = await readUrls(urlsFile);

  if (urls.length === 0) {
    throw new Error(`Nenhuma URL encontrada em ${urlsFile}`);
  }

  await fs.mkdir(config.outputDir, { recursive: true });

  const context = await launchContext(config);
  const page = await getFirstPage(context);
  page.setDefaultTimeout(config.defaultTimeoutMs);

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    const ordinal = String(index + 1).padStart(3, '0');

    console.log(`[${ordinal}/${urls.length}] Abrindo ${url}`);
    const printPage = await openPrintablePage(page, url, config);
    const title = await getDocumentTitle(printPage, config);
    const filename = `${ordinal}-${sanitizeFilename(title || url)}.pdf`;
    const pdfPath = path.resolve(config.outputDir, filename);

    await isolateContent(printPage, config.selectors.content);
    await printPage.emulateMedia({ media: 'print' });
    await printPage.pdf({ ...config.pdf, path: pdfPath });

    if (printPage !== page) {
      await printPage.close();
    }

    console.log(`  salvo em ${pdfPath}`);
  }

  await context.close();
}

async function exportPrfPdfs(config, args) {
  const reportFile = args.report || config.prf?.reportFile || 'aulas.prf.json';
  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
  const items = flattenPrfPrintableItems(report);

  if (items.length === 0) {
    throw new Error(`Nenhuma URL imprimivel encontrada em ${reportFile}`);
  }

  const outputDir = args.output || config.outputDir;
  await fs.mkdir(outputDir, { recursive: true });

  const context = await launchContext(config);
  const page = await getFirstPage(context);
  page.setDefaultTimeout(config.defaultTimeoutMs);

  const usedPaths = new Set();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const ordinal = String(index + 1).padStart(3, '0');
    const matterDir = path.resolve(outputDir, sanitizeFilename(item.matter || 'Sem materia'));
    await fs.mkdir(matterDir, { recursive: true });

    const baseName = sanitizeFilename(item.subject || item.printUrl || `aula-${ordinal}`);
    const pdfPath = await getUniquePdfPath(matterDir, baseName, usedPaths);

    console.log(`[${ordinal}/${items.length}] ${item.matter} > ${item.subject}`);
    const printPage = await openPrintablePage(page, item.printUrl, config);
    await isolateContent(printPage, config.selectors.content);
    await printPage.emulateMedia({ media: 'print' });
    await printPage.pdf({ ...config.pdf, path: pdfPath });

    if (printPage !== page) {
      await printPage.close();
    }

    console.log(`  salvo em ${pdfPath}`);
  }

  await context.close();
}

async function organizePrfPdfs(config, args) {
  const sourceDir = path.resolve(args.source || config.outputDir || 'pdfs');
  const reportFile = args.report || config.prf?.reportFile || 'aulas.prf.json';
  const dryRun = Boolean(args['dry-run']);
  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
  const metadataByUrl = buildFirstPrfMetadataByUrl(report);
  const directPdfFiles = (await fs.readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'));

  const byOrdinal = new Map();
  const withoutOrdinal = [];

  for (const file of directPdfFiles) {
    const match = file.name.match(/^(\d+)-.+\.pdf$/i);
    const fullPath = path.join(sourceDir, file.name);
    const stats = await fs.stat(fullPath);
    const item = {
      name: file.name,
      fullPath,
      ordinal: match ? Number(match[1]) : 0,
      mtimeMs: stats.mtimeMs
    };

    if (!match) {
      withoutOrdinal.push(item);
      continue;
    }

    const group = byOrdinal.get(item.ordinal) || [];
    group.push(item);
    byOrdinal.set(item.ordinal, group);
  }

  const usedDestinations = new Set();
  const operations = [];

  for (const [ordinal, files] of [...byOrdinal.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const primary = sorted[0];
    const url = report.urls?.[ordinal - 1] || '';
    const metadata = metadataByUrl.get(url);

    if (!metadata || !isValidPrintUrl(url) || /404\s*-\s*p[aá]gina n[aã]o encontrada/i.test(primary.name)) {
      operations.push({
        kind: 'move',
        reason: 'sem aula imprimivel valida no relatorio',
        from: primary.fullPath,
        to: await getUniquePdfPath(path.join(sourceDir, '_nao_organizados'), stripPdfExtension(primary.name), usedDestinations)
      });
    } else {
      const matterDir = path.join(sourceDir, sanitizeFilename(metadata.matter || 'Sem materia'));
      operations.push({
        kind: 'move',
        reason: `${metadata.matter} > ${metadata.subject}`,
        from: primary.fullPath,
        to: await getUniquePdfPath(matterDir, sanitizeFilename(metadata.subject || primary.name), usedDestinations)
      });
    }

    for (const duplicate of sorted.slice(1)) {
      operations.push({
        kind: 'move',
        reason: `duplicado do indice ${String(ordinal).padStart(3, '0')}`,
        from: duplicate.fullPath,
        to: await getUniquePdfPath(path.join(sourceDir, '_duplicados'), stripPdfExtension(duplicate.name), usedDestinations)
      });
    }
  }

  for (const file of withoutOrdinal) {
    operations.push({
      kind: 'move',
      reason: 'arquivo sem prefixo numerico',
      from: file.fullPath,
      to: await getUniquePdfPath(path.join(sourceDir, '_nao_organizados'), stripPdfExtension(file.name), usedDestinations)
    });
  }

  console.log(`${operations.length} arquivo(s) para organizar em ${sourceDir}`);

  if (dryRun) {
    for (const operation of operations.slice(0, 25)) {
      console.log(`[simulacao] ${operation.from} -> ${operation.to}`);
    }
    if (operations.length > 25) {
      console.log(`[simulacao] ...mais ${operations.length - 25} operacoes`);
    }
    return;
  }

  let moved = 0;
  for (const operation of operations) {
    await fs.mkdir(path.dirname(operation.to), { recursive: true });
    await fs.rename(operation.from, operation.to);
    moved += 1;
  }

  console.log(`${moved} arquivo(s) organizados.`);
}

async function orderPrfPdfs(config, args) {
  const sourceDir = path.resolve(args.source || config.outputDir || 'pdfs');
  const reportFile = args.report || config.prf?.reportFile || 'aulas.prf.json';
  const dryRun = Boolean(args['dry-run']);
  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
  const items = flattenPrfPrintableItems(report);
  const countersByMatter = new Map();
  const operations = [];
  const reservedTargets = new Set();

  for (const item of items) {
    const matter = item.matter || 'Sem materia';
    const matterDir = path.join(sourceDir, sanitizeFilename(matter));
    const currentBase = sanitizeFilename(item.subject || item.printUrl || 'aula');
    const sequence = (countersByMatter.get(matter) || 0) + 1;
    countersByMatter.set(matter, sequence);

    const targetBase = `${String(sequence).padStart(3, '0')} - ${currentBase}`.slice(0, 150);
    const currentPath = await findExistingPrfPdf(matterDir, currentBase);
    if (!currentPath) {
      continue;
    }

    const desiredTargetPath = path.resolve(matterDir, `${targetBase}.pdf`);
    if (path.resolve(currentPath).toLowerCase() === desiredTargetPath.toLowerCase()) {
      continue;
    }

    let targetPath = desiredTargetPath;
    const targetKey = targetPath.toLowerCase();
    if (reservedTargets.has(targetKey) || await fileExists(targetPath)) {
      targetPath = await getUniquePdfPath(matterDir, targetBase, reservedTargets);
    } else {
      reservedTargets.add(targetKey);
    }

    operations.push({
      from: currentPath,
      to: targetPath,
      reason: `${matter} > ${item.subject}`
    });
  }

  console.log(`${operations.length} arquivo(s) para renomear em ordem do guia.`);

  if (dryRun) {
    for (const operation of operations.slice(0, 30)) {
      console.log(`[simulacao] ${operation.from} -> ${operation.to}`);
    }
    if (operations.length > 30) {
      console.log(`[simulacao] ...mais ${operations.length - 30} operacoes`);
    }
    return;
  }

  for (const operation of operations) {
    await fs.rename(operation.from, operation.to);
  }

  console.log(`${operations.length} arquivo(s) renomeados.`);
}

async function collectPrfQuestions(config, args) {
  const reportFile = args.report || config.prf?.reportFile || 'aulas.prf.json';
  const dbPath = args.db || config.prf?.questionsDb || 'questoes-prf.sqlite';
  const assetsDir = args.assets || config.prf?.assetsDir || 'assets';
  const delayMs = Number(args.delay || config.prf?.questionDelayMs || 2000);
  const limit = Number(args.limit || 0);
  const batchSize = Number(args['batch-size'] || config.prf?.questionBatchSize || 0);
  const batchPauseMs = Number(args['batch-pause'] || config.prf?.questionBatchPauseMs || 0);
  const blockRetries = Number(args['block-retries'] || config.prf?.blockRetries || 0);
  const blockPauseMs = Number(args['block-pause'] || config.prf?.blockPauseMs || 0);
  const startAt = Number(args['start-at'] || 1);
  const explicitStartAt = args['start-at'] != null;
  const noAutoResume = Boolean(args['no-auto-resume']);
  const skipQuestionMatterPatterns = getListOption(
    args['skip-matter'],
    config.prf?.skipQuestionMatterPatterns || []
  );
  const skipQuestionNotebookIds = getNumberListOption(
    args['skip-notebook'],
    config.prf?.skipQuestionNotebookIds || []
  );
  const onlyQuestionMatterPatterns = getListOption(
    args['only-matter'],
    config.prf?.onlyQuestionMatterPatterns || []
  );
  const onlyQuestionNotebookIds = getNumberListOption(
    args['only-notebook'],
    config.prf?.onlyQuestionNotebookIds || []
  );
  const skipComments = Boolean(args['skip-comments']);
  const skipInedita = Boolean(args['skip-inedita']);
  const skipAssets = Boolean(args['skip-assets']);
  const commentsOnly = Boolean(args['comments-only']);
  const indexOnly = Boolean(args['index-only']);
  const refreshIndex = Boolean(args['refresh-index']);
  const manualOnBlock = Boolean(args['manual-on-block'] || config.prf?.manualOnBlock);
  // Opt-in: abre a página real da questão antes de buscar o comentário. O fetch
  // "seco" do comentário a partir da home era barrado como robô (HUMAN_VERIFICATION);
  // feito do contexto da própria questão, passa. Sem o flag, comportamento original.
  const navBeforeComment = Boolean(args['nav-before-comment']);
  const navSettleMs = Number(args['nav-settle'] || 2000);
  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
  const notebooks = getPrfNotebookRefs(report);

  if (notebooks.length === 0) {
    throw new Error(`Nenhum caderno encontrado em ${reportFile}`);
  }

  const db = await openQuestionsDb(dbPath);
  initQuestionsSchema(db);

  const context = await launchContext(config);
  const page = await getFirstPage(context);
  page.setDefaultTimeout(config.defaultTimeoutMs);
  if (navBeforeComment) {
    // Coleta leve: aborta imagens/fontes/mídia nas navegações da página da questão
    // (mantém HTML/JS/XHR, que estabelecem o contexto humano). Corta a maioria das
    // requisições por questão → estoura o rate limit de volume bem mais devagar.
    await page.route('**/*', (route) => {
      const req = route.request();
      const url = req.url();
      // NUNCA bloqueia recursos do reCAPTCHA/Google — senão o desafio de imagens
      // do "human" não carrega e fica impossível resolver. Só corta imagem/fonte/
      // mídia do resto (o peso do tec).
      if (/google\.com|gstatic\.com|googleapis\.com|recaptcha|hcaptcha|cloudflare/i.test(url)) {
        return route.continue();
      }
      const type = req.resourceType();
      if (type === 'image' || type === 'font' || type === 'media') return route.abort();
      return route.continue();
    });
  }
  await page.goto('https://www.tecconcursos.com.br/', { waitUntil: 'domcontentloaded' });
  // A sessão/cookies às vezes demoram a valer após o goto (a 1ª chamada volta a
  // shell da SPA e dava falso "não autenticada" com a sessão válida). Tenta
  // algumas vezes com espera antes de desistir.
  {
    let sessionOk = false;
    for (let attempt = 1; attempt <= 4 && !sessionOk; attempt += 1) {
      await page.waitForTimeout(3000);
      try { await ensureApiSession(page); sessionOk = true; }
      catch (error) { if (attempt === 4) throw error; }
    }
  }

  let processed = 0;
  let indexed = 0;
  let indexedAnswers = 0;
  let skippedInedita = 0;

  if (commentsOnly) {
    processed = await collectMissingQuestionComments(db, page, {
      assetsDir,
      delayMs,
      limit,
      batchSize,
      batchPauseMs,
      manualOnBlock,
      blockRetries,
      blockPauseMs,
      onlyQuestionMatterPatterns,
      onlyQuestionNotebookIds,
      skipQuestionMatterPatterns,
      skipQuestionNotebookIds,
      skipAssets
    });
    await context.close();
    db.close();
    console.log(`Comentários processados nesta execução: ${processed}.`);
    return;
  }

  for (const notebook of notebooks) {
    if (onlyQuestionNotebookIds.length && !onlyQuestionNotebookIds.includes(notebook.id)) {
      console.log(`Pulando caderno ${notebook.id}: fora da lista de prioridade`);
      continue;
    }

    if (onlyQuestionMatterPatterns.length && !notebookMatchesAnyPattern(notebook, onlyQuestionMatterPatterns)) {
      console.log(`Pulando caderno ${notebook.id}: sem materia prioritaria`);
      continue;
    }

    if (skipQuestionNotebookIds.includes(notebook.id)) {
      console.log(`Pulando caderno ${notebook.id}: configurado em skipQuestionNotebookIds`);
      continue;
    }

    if (shouldSkipNotebookQuestions(notebook, skipQuestionMatterPatterns)) {
      console.log(`Pulando caderno ${notebook.id}: ${getNotebookMatterSummary(notebook)}`);
      continue;
    }

    upsertNotebook(db, notebook);
    console.log(`Preparando caderno ${notebook.id}: ${notebook.title}`);
    let indexRows;

    if (!refreshIndex && !indexOnly) {
      indexRows = getStoredNotebookQuestionIndex(db, notebook.id);
      if (indexRows.length > 0) {
        console.log(`  usando indice salvo: ${indexRows.length} questoes`);
      }
    }

    if (!indexRows?.length) {
      console.log('  indexando no Tec...');
      try {
        indexRows = await runTecOperation(page, () => fetchNotebookQuestionIndex(page, notebook.id), {
          manualOnBlock,
          blockRetries,
          blockPauseMs,
          label: `indexar caderno ${notebook.id}`
        });
      } catch (error) {
        if (isTemporaryTecBlockError(error)) {
          await context.close();
          db.close();
          console.error('O Tec limitou temporariamente a coleta. A execução foi pausada sem perder o que já estava no banco.');
          console.error('Aguarde um tempo, faça login/verificação no navegador se necessário e retome com --limit menor e --delay maior.');
          process.exitCode = 2;
          return;
        }

        throw error;
      }
      console.log(`  ${indexRows.length} questoes no indice`);

      for (const row of indexRows) {
        const result = upsertNotebookQuestion(db, notebook.id, row);
        indexed += 1;
        if (result.answer) {
          indexedAnswers += 1;
        }
      }
    }

    if (indexOnly) {
      continue;
    }

    // Auto-resume: sem --start-at explícito, começa direto na 1ª questão ainda
    // não capturada deste caderno (não perde tempo iterando as já feitas). As já
    // feitas depois desse ponto continuam sendo puladas pelo skip normal.
    let effectiveStartAt = startAt;
    if (!explicitStartAt && !noAutoResume) {
      const resume = getResumePosition(db, notebook.id);
      if (resume > 1) {
        effectiveStartAt = resume;
        console.log(`  retomada automática: começando na posição ${resume} (anteriores já feitas)`);
      }
    }

    for (const row of indexRows) {
      if (row.posicaoCaderno < effectiveStartAt) {
        continue;
      }
      if (limit > 0 && processed >= limit) {
        await context.close();
        db.close();
        console.log(`Limite de ${limit} questoes atingido.`);
        return;
      }

      const existing = getQuestionStatus(db, row.idQuestao);
      if (existing?.question_collected && (skipComments || existing?.comment_checked)) {
        continue;
      }

      try {
        let question;
        if (existing?.question_collected) {
          // Corpo já baixado numa sessão anterior: NÃO re-baixa. O endpoint de
          // questão do tec às vezes devolve HTTP 500 no re-fetch e abortava ANTES
          // do comentário (deixando a questão sem comentário pra sempre). Vai
          // direto ao comentário usando o possui_comentario já salvo.
          const dbq = db.prepare('SELECT id_question, possui_comentario, raw_json FROM questions WHERE id_question = ?').get(row.idQuestao);
          // Inéditas (premium) ficam fora do plano do usuário: sem acesso ao
          // comentário. Pula pra não gastar reCAPTCHA/tempo nelas.
          if (skipInedita && isIneditaRaw(dbq.raw_json)) { skippedInedita += 1; continue; }
          question = { idQuestao: dbq.id_question, possuiComentario: dbq.possui_comentario == 1 };
        } else {
          question = await runTecOperation(page, () => fetchQuestionByPosition(page, notebook.id, row.posicaoCaderno), {
            manualOnBlock,
            blockRetries,
            blockPauseMs,
            label: `baixar questao #${row.idQuestao}`
          });
          upsertQuestion(db, question);
          replaceAlternatives(db, question);
          if (skipInedita && question.questaoAdaptadaOuInedita) { skippedInedita += 1; continue; }
        }

        if (!skipComments) {
          if (navBeforeComment && question.possuiComentario) {
            await page.goto(`https://www.tecconcursos.com.br/questoes/${question.idQuestao}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(navSettleMs);
          }
          const comment = question.possuiComentario
            ? await runTecOperation(page, () => fetchQuestionComment(page, question.idQuestao), {
              manualOnBlock,
              blockRetries,
              blockPauseMs,
              label: `baixar comentario da questao #${question.idQuestao}`
            })
            : null;
          upsertComment(db, question.idQuestao, comment);
          if (!skipAssets && comment?.textoComentario) {
            await downloadCommentAssets(db, page, {
              questionId: question.idQuestao,
              html: comment.textoComentario,
              assetsDir
            });
          }
        }

        processed += 1;
        if (processed % 25 === 0) {
          console.log(`  coletadas ${processed} nesta execucao; ultima #${row.idQuestao}`);
        }

        if (shouldPauseBatch(processed, batchSize, batchPauseMs, limit)) {
          console.log(`  pausa de lote: aguardando ${formatDuration(batchPauseMs)} antes de continuar...`);
          await page.waitForTimeout(batchPauseMs);
        } else if (delayMs) {
          await page.waitForTimeout(delayMs);
        }
      } catch (error) {
        if (isTemporaryTecBlockError(error)) {
          await context.close();
          db.close();
          console.error('O Tec limitou temporariamente a coleta. A execução foi pausada sem perder o que já estava no banco.');
          console.error('Aguarde um tempo, faça login/verificação no navegador se necessário e retome com --limit menor e --delay maior.');
          process.exitCode = 2;
          return;
        }

        insertCollectionError(db, {
          notebookId: notebook.id,
          position: row.posicaoCaderno,
          questionId: row.idQuestao,
          stage: 'question',
          error: error.message
        });
      }
    }
  }

  await context.close();
  db.close();
  if (indexOnly) {
    console.log(`Indexacao concluida. Banco: ${path.resolve(dbPath)}. Itens de indice salvos: ${indexed}. Gabaritos inferidos do indice: ${indexedAnswers}.`);
    console.log('Nenhuma questao foi baixada porque --index-only salva apenas o indice/gabarito do caderno.');
    return;
  }

  console.log(`Coleta concluida. Banco: ${path.resolve(dbPath)}. Questões processadas nesta execucao: ${processed}.${skipInedita ? ` Inéditas puladas (fora do plano): ${skippedInedita}.` : ''}`);
}

async function collectMissingQuestionComments(db, page, {
  assetsDir,
  delayMs,
  limit,
  batchSize,
  batchPauseMs,
  manualOnBlock,
  blockRetries,
  blockPauseMs,
  onlyQuestionMatterPatterns,
  onlyQuestionNotebookIds,
  skipQuestionMatterPatterns,
  skipQuestionNotebookIds,
  skipAssets
}) {
  let rows = db.prepare(`
    SELECT q.id_question, q.materia, q.assunto
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE q.possui_comentario = 1
      AND (c.question_id IS NULL OR COALESCE(c.html_local, c.html, c.text, '') = '')
    ORDER BY q.id_question
  `).all();

  if (onlyQuestionMatterPatterns.length) {
    rows = rows.filter((row) => matchesQuestionMatter(row, onlyQuestionMatterPatterns));
  }
  if (skipQuestionMatterPatterns.length) {
    rows = rows.filter((row) => !matchesQuestionMatter(row, skipQuestionMatterPatterns));
  }
  if (onlyQuestionNotebookIds.length) {
    rows = rows.filter((row) => questionInAnyNotebook(db, row.id_question, onlyQuestionNotebookIds));
  }
  if (skipQuestionNotebookIds.length) {
    rows = rows.filter((row) => !questionInAnyNotebook(db, row.id_question, skipQuestionNotebookIds));
  }

  let processed = 0;
  let consecErrors = 0;
  for (const row of rows) {
    if (limit > 0 && processed >= limit) {
      break;
    }

    try {
      const comment = await runTecOperation(page, () => fetchQuestionComment(page, row.id_question), {
        manualOnBlock,
        blockRetries,
        blockPauseMs,
        label: `baixar comentario da questao #${row.id_question}`
      });
      upsertComment(db, row.id_question, comment);
      if (!skipAssets && comment?.textoComentario) {
        await downloadCommentAssets(db, page, {
          questionId: row.id_question,
          html: comment.textoComentario,
          assetsDir
        });
      }
      processed += 1;
      consecErrors = 0;

      if (processed % 10 === 0) {
        console.log(`  comentários coletados ${processed}; última #${row.id_question}`);
      }
      if (shouldPauseBatch(processed, batchSize, batchPauseMs, limit)) {
        console.log(`  pausa de lote: aguardando ${formatDuration(batchPauseMs)} antes de continuar...`);
        await page.waitForTimeout(batchPauseMs);
      } else if (delayMs) {
        await page.waitForTimeout(delayMs);
      }
    } catch (error) {
      if (isTemporaryTecBlockError(error)) {
        console.error('O Tec limitou temporariamente a coleta de comentários. A execução foi pausada.');
        process.exitCode = 2;
        break;
      }

      const msg = String(error?.message || error);
      // HTTP 5xx = comentário indisponível/quebrado no TEC p/ ESTA questão.
      // Não trava a fila e não conta como "página morta": só pula e segue.
      if (/HTTP 5\d\d/.test(msg)) {
        console.error(`Comentário indisponível (5xx) em #${row.id_question} — pulando.`);
        insertCollectionError(db, { questionId: row.id_question, stage: 'comment', error: error.message });
        consecErrors = 0;
        if (delayMs) await page.waitForTimeout(delayMs);
        continue;
      }
      // Outros erros (provável navegador/página fechada): mostra e para após 3
      // seguidos, para não "queimar" a fila em silêncio (fica retomável).
      console.error(`Erro (não-bloqueio) em #${row.id_question}: ${error?.name || 'Error'}: ${msg.slice(0, 200)}`);
      insertCollectionError(db, {
        questionId: row.id_question,
        stage: 'comment',
        error: error.message
      });
      consecErrors += 1;
      if (consecErrors >= 3) {
        console.error(`3 erros seguidos (provável navegador/página fechada) — pausando p/ reabrir e retomar. Última: #${row.id_question}.`);
        process.exitCode = 2;
        break;
      }
    }
  }

  return processed;
}

async function collectPrfCommentAssets(config, args) {
  const dbPath = args.db || config.prf?.questionsDb || 'questoes-prf.sqlite';
  const assetsDir = args.assets || config.prf?.assetsDir || 'assets';
  const limit = Number(args.limit || 0);
  const delayMs = Number(args.delay || 500);
  const db = await openQuestionsDb(dbPath);
  initQuestionsSchema(db);

  const rows = db.prepare(`
    SELECT question_id, html
    FROM comments
    WHERE html IS NOT NULL
      AND html != ''
      AND html LIKE '%<img%'
    ORDER BY question_id
  `).all();

  if (rows.length === 0) {
    db.close();
    console.log('Nenhum comentario com imagem encontrado no banco.');
    return;
  }

  const context = await launchContext(config);
  const page = await getFirstPage(context);
  page.setDefaultTimeout(config.defaultTimeoutMs);
  await page.goto('https://www.tecconcursos.com.br/', { waitUntil: 'domcontentloaded' });
  // A sessão/cookies às vezes demoram a valer após o goto (a 1ª chamada volta a
  // shell da SPA e dava falso "não autenticada" com a sessão válida). Tenta
  // algumas vezes com espera antes de desistir.
  {
    let sessionOk = false;
    for (let attempt = 1; attempt <= 4 && !sessionOk; attempt += 1) {
      await page.waitForTimeout(3000);
      try { await ensureApiSession(page); sessionOk = true; }
      catch (error) { if (attempt === 4) throw error; }
    }
  }

  let processed = 0;
  for (const row of rows) {
    if (limit > 0 && processed >= limit) {
      break;
    }

    await downloadCommentAssets(db, page, {
      questionId: row.question_id,
      html: row.html,
      assetsDir
    });

    processed += 1;
    if (processed % 25 === 0) {
      console.log(`  processados ${processed} comentarios com imagens`);
    }
    if (delayMs) {
      await page.waitForTimeout(delayMs);
    }
  }

  await context.close();
  db.close();
  console.log(`Assets processados para ${processed} comentario(s). Pasta: ${path.resolve(assetsDir)}`);
}

async function backfillPrfCommentAnswers(config, args) {
  const dbPath = args.db || config.prf?.questionsDb || 'questoes-prf.sqlite';
  const limit = Number(args.limit || 0);
  const dryRun = Boolean(args['dry-run']);
  const db = await openQuestionsDb(dbPath);
  initQuestionsSchema(db);
  initAnswerAuditSchema(db);

  const rows = db.prepare(`
    SELECT q.id_question, q.statement_text, q.type_question, c.text AS comment_text
    FROM questions q
    JOIN comments c ON c.question_id = q.id_question
    WHERE COALESCE(c.text, '') != ''
      AND COALESCE(c.extracted_answer, '') = ''
      AND COALESCE(q.official_answer, '') = ''
      AND NOT EXISTS (
        SELECT 1
        FROM notebook_questions nq
        WHERE nq.question_id = q.id_question
          AND COALESCE(nq.answer, '') != ''
      )
    ORDER BY q.id_question
    ${limit > 0 ? 'LIMIT ?' : ''}
  `).all(...(limit > 0 ? [limit] : []));

  const rejected = new Map();
  let candidates = 0;
  let applied = 0;
  for (const row of rows) {
    const alternatives = getQuestionAlternatives(db, row.id_question);
    const result = extractAnswerFromQuestionCommentV2(row, alternatives, row.comment_text);
    if (!result.answer) {
      incrementMap(rejected, result.rejectReason || 'sem_candidato');
      continue;
    }
    candidates += 1;

    if (result.confidence < 0.9) {
      incrementMap(rejected, 'baixa_confianca');
      continue;
    }

    applied += 1;
    console.log(`${dryRun ? 'inferiria' : 'inferido'} #${row.id_question}: ${result.answer} (${result.confidence})`);
    if (!dryRun) {
      db.prepare(`
        UPDATE comments
        SET extracted_answer = ?,
            checked_at = CURRENT_TIMESTAMP
        WHERE question_id = ?
      `).run(result.answer, row.id_question);
      insertQuestionAnswerAudit(db, {
        questionId: row.id_question,
        answer: result.answer,
        source: 'comment_inferred',
        confidence: result.confidence,
        evidenceText: result.evidenceText,
        extractorVersion: 'comment-answer-v2'
      });
    }
  }

  db.close();
  console.log(`Comentarios analisados: ${rows.length}.`);
  console.log(`Candidatos encontrados: ${candidates}.`);
  console.log(`${dryRun ? 'Aplicaveis' : 'Aplicados'}: ${applied}.`);
  console.log(`Rejeitados: ${sumMap(rejected)}.`);
  for (const [reason, count] of rejected) {
    console.log(`  ${reason}: ${count}`);
  }
  console.log(`Banco: ${path.resolve(dbPath)}`);
}

async function generatePrfAiComments(config, args) {
  const dbPath = args.db || config.prf?.questionsDb || 'questoes-prf.sqlite';
  const dryRun = Boolean(args['dry-run']);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey && !dryRun) {
    throw new Error('Defina OPENAI_API_KEY antes de rodar ai-comments-prf.');
  }

  const model = String(args.model || config.ai?.model || 'gpt-5-mini');
  const limit = Math.max(1, Number(args.limit || config.ai?.limit || 20));
  const delayMs = Math.max(0, Number(args.delay || config.ai?.delayMs || 1000));
  const overwriteAi = Boolean(args['overwrite-ai']);
  const db = await openQuestionsDb(dbPath);
  initQuestionsSchema(db);
  initAiCommentSchema(db);

  const questions = getAiCommentCandidates(db, {
    limit,
    overwriteAi,
    includeTecMissing: Boolean(args['include-tec-missing'])
  });
  if (!questions.length) {
    db.close();
    console.log('Nenhuma questao sem comentario encontrada para gerar com IA.');
    return;
  }

  console.log(`Gerando comentarios IA para ${questions.length} questao(oes). Modelo: ${model}${dryRun ? ' (dry-run)' : ''}`);
  let processed = 0;
  for (const question of questions) {
    const alternatives = getQuestionAlternatives(db, question.id_question);
    if (!alternatives.length) {
      insertCollectionError(db, {
        questionId: question.id_question,
        stage: 'ai-comment',
        error: 'Questao sem alternativas cadastradas'
      });
      continue;
    }

    try {
      if (dryRun) {
        processed += 1;
        console.log(`  previa ${processed}/${questions.length} #${question.id_question}: ${question.materia || ''} - ${question.assunto || ''}`);
        console.log(`    ${trimPreview(question.statement_text, 160)}`);
        continue;
      }

      const generated = await requestAiQuestionSolution({ apiKey, model, question, alternatives });
      const answer = normalizeGeneratedAnswer(question, alternatives, generated.answer);
      if (!answer) {
        throw new Error(`Resposta IA invalida: ${generated.answer || '<vazia>'}`);
      }

      const record = {
        ...generated,
        answer,
        model,
        generatedAt: new Date().toISOString()
      };

      if (!dryRun) {
        upsertAiComment(db, question, record);
      }

      processed += 1;
      console.log(`  ${processed}/${questions.length} #${question.id_question}: ${answer}`);
      if (delayMs && processed < questions.length) {
        await sleep(delayMs);
      }
    } catch (error) {
      insertCollectionError(db, {
        questionId: question.id_question,
        stage: 'ai-comment',
        error: error.message || String(error)
      });
      console.log(`  erro #${question.id_question}: ${error.message || error}`);
    }
  }

  db.close();
  console.log(`Concluido. Comentarios IA gravados: ${dryRun ? 0 : processed}. Banco: ${path.resolve(dbPath)}`);
}

function insertQuestionAnswerAudit(db, record) {
  db.prepare(`
    INSERT INTO question_answer_audit (
      question_id, answer, source, confidence, evidence_text, extractor_version, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    record.questionId,
    record.answer,
    record.source,
    record.confidence,
    record.evidenceText || '',
    record.extractorVersion || ''
  );
}

function incrementMap(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sumMap(map) {
  let total = 0;
  for (const value of map.values()) {
    total += value;
  }
  return total;
}

async function openQuestionsDb(dbPath) {
  const { DatabaseSync } = await import('node:sqlite');
  return new DatabaseSync(dbPath);
}

function initQuestionsSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS notebooks (
      id INTEGER PRIMARY KEY,
      title TEXT,
      url TEXT,
      collected_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notebook_questions (
      notebook_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      type_question TEXT,
      answer TEXT,
      answer_source TEXT,
      anulada INTEGER,
      favorita INTEGER,
      anotada INTEGER,
      raw_json TEXT,
      PRIMARY KEY (notebook_id, position)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id_question INTEGER PRIMARY KEY,
      url TEXT,
      statement_html TEXT,
      statement_text TEXT,
      statement_hash TEXT,
      content_hash TEXT,
      type_question TEXT,
      format_question TEXT,
      banca TEXT,
      banca_url TEXT,
      orgao_sigla TEXT,
      orgao_nome TEXT,
      orgao_url TEXT,
      cargo TEXT,
      concurso_id INTEGER,
      concurso_ano INTEGER,
      concurso_url TEXT,
      materia_id INTEGER,
      materia TEXT,
      assunto_id INTEGER,
      assunto TEXT,
      assunto_url TEXT,
      capitulo INTEGER,
      anulada INTEGER,
      desatualizada INTEGER,
      possui_comentario INTEGER,
      possui_comentario_video INTEGER,
      possui_comentario_ia INTEGER,
      possui_resolucao_banca INTEGER,
      official_answer TEXT,
      official_answer_source TEXT,
      raw_json TEXT,
      collected_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS alternatives (
      question_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      letter TEXT NOT NULL,
      html TEXT,
      text TEXT,
      PRIMARY KEY (question_id, position)
    );

    CREATE TABLE IF NOT EXISTS comments (
      question_id INTEGER PRIMARY KEY,
      html TEXT,
      html_local TEXT,
      text TEXT,
      professor TEXT,
      date_text TEXT,
      extracted_answer TEXT,
      raw_json TEXT,
      checked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS comment_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      original_url TEXT NOT NULL,
      local_path TEXT NOT NULL,
      mime_type TEXT,
      sha256 TEXT,
      bytes INTEGER,
      downloaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, original_url)
    );

    CREATE TABLE IF NOT EXISTS collection_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notebook_id INTEGER,
      position INTEGER,
      question_id INTEGER,
      stage TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_questions_banca ON questions(banca);
    CREATE INDEX IF NOT EXISTS idx_questions_materia_assunto ON questions(materia, assunto);
    CREATE INDEX IF NOT EXISTS idx_questions_concurso ON questions(concurso_ano, cargo);
    CREATE INDEX IF NOT EXISTS idx_questions_statement_hash ON questions(statement_hash);
    CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON questions(content_hash);
    CREATE INDEX IF NOT EXISTS idx_notebook_questions_question ON notebook_questions(question_id);
  `);

  ensureColumn(db, 'questions', 'statement_hash', 'TEXT');
  ensureColumn(db, 'questions', 'content_hash', 'TEXT');
  ensureColumn(db, 'questions', 'official_answer', 'TEXT');
  ensureColumn(db, 'questions', 'official_answer_source', 'TEXT');
  ensureColumn(db, 'notebook_questions', 'answer', 'TEXT');
  ensureColumn(db, 'notebook_questions', 'answer_source', 'TEXT');
  ensureColumn(db, 'notebook_questions', 'raw_json', 'TEXT');
  ensureColumn(db, 'comments', 'html_local', 'TEXT');
  ensureColumn(db, 'comments', 'source_type', 'TEXT');
  ensureColumn(db, 'comments', 'ai_model', 'TEXT');
  ensureColumn(db, 'comments', 'ai_generated_at', 'TEXT');
  ensureColumn(db, 'comments', 'ai_confidence', 'REAL');
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function initAiCommentSchema(db) {
  ensureColumn(db, 'comments', 'source_type', 'TEXT');
  ensureColumn(db, 'comments', 'ai_model', 'TEXT');
  ensureColumn(db, 'comments', 'ai_generated_at', 'TEXT');
  ensureColumn(db, 'comments', 'ai_confidence', 'REAL');
  ensureColumn(db, 'questions', 'ai_answer', 'TEXT');
  ensureColumn(db, 'questions', 'ai_answer_model', 'TEXT');
  ensureColumn(db, 'questions', 'ai_answer_generated_at', 'TEXT');
}

function initAnswerAuditSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS question_answer_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      answer TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL,
      evidence_text TEXT,
      extractor_version TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_question_answer_audit_question ON question_answer_audit(question_id, source);
  `);
}

function getAiCommentCandidates(db, { limit, overwriteAi, includeTecMissing }) {
  const overwriteClause = overwriteAi
    ? "AND COALESCE(c.source_type, '') = 'ai'"
    : "AND COALESCE(c.html_local, c.html, c.text, '') = ''";
  const tecCommentClause = includeTecMissing ? '' : 'AND COALESCE(q.possui_comentario, 0) = 0';

  return db.prepare(`
    SELECT q.*
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE COALESCE(q.statement_text, '') != ''
      AND EXISTS (
        SELECT 1
        FROM alternatives a
        WHERE a.question_id = q.id_question
      )
      ${tecCommentClause}
      ${overwriteClause}
    ORDER BY COALESCE(q.materia, ''), COALESCE(q.assunto, ''), q.id_question
    LIMIT ?
  `).all(limit);
}

function getQuestionAlternatives(db, questionId) {
  return db.prepare(`
    SELECT letter, position, text
    FROM alternatives
    WHERE question_id = ?
    ORDER BY position
  `).all(questionId);
}

function questionInAnyNotebook(db, questionId, notebookIds) {
  if (!notebookIds.length) {
    return false;
  }

  const placeholders = notebookIds.map(() => '?').join(', ');
  const row = db.prepare(`
    SELECT 1 AS found
    FROM notebook_questions
    WHERE question_id = ?
      AND notebook_id IN (${placeholders})
    LIMIT 1
  `).get(questionId, ...notebookIds);

  return Boolean(row);
}

async function requestAiQuestionSolution({ apiKey, model, question, alternatives }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            'Voce e um professor de concursos publicos no Brasil.',
            'Resolva a questao com rigor, mas seja direto.',
            'Nao invente jurisprudencia, artigo ou precedente especifico se nao tiver certeza.',
            'A resposta e comentario serao marcados no banco como gerados por IA, nao como gabarito oficial.'
          ].join(' ')
        },
        {
          role: 'user',
          content: buildAiQuestionPrompt(question, alternatives)
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'question_solution',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              answer: {
                type: 'string',
                description: 'A-E para multipla escolha; CERTO ou ERRADO para certo/errado.'
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1
              },
              explanation: {
                type: 'string',
                description: 'Comentario em portugues explicando por que a resposta e correta.'
              },
              warning: {
                type: 'string',
                description: 'Alerta curto se houver incerteza, desatualizacao normativa ou ambiguidade; vazio se nao houver.'
              }
            },
            required: ['answer', 'confidence', 'explanation', 'warning']
          }
        }
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}: ${JSON.stringify(data).slice(0, 600)}`);
  }

  const text = extractResponseText(data);
  if (!text) {
    throw new Error('Resposta da OpenAI sem texto estruturado.');
  }

  try {
    return {
      ...JSON.parse(text),
      rawResponse: data
    };
  } catch (error) {
    throw new Error(`JSON invalido retornado pela IA: ${text.slice(0, 300)}`);
  }
}

function buildAiQuestionPrompt(question, alternatives) {
  return [
    `ID da questao: ${question.id_question}`,
    `Banca: ${question.banca || ''}`,
    `Ano: ${question.concurso_ano || ''}`,
    `Cargo: ${question.cargo || ''}`,
    `Materia: ${question.materia || ''}`,
    `Assunto: ${question.assunto || ''}`,
    `Tipo: ${question.type_question || ''}`,
    '',
    'Enunciado:',
    question.statement_text || '',
    '',
    'Alternativas:',
    ...alternatives.map((alternative) => `${alternative.letter}) ${alternative.text || ''}`),
    '',
    'Retorne apenas JSON no schema solicitado. Para questoes CERTO_ERRADO, use CERTO ou ERRADO no campo answer.'
  ].join('\n');
}

function extractResponseText(response) {
  if (typeof response.output_text === 'string') {
    return response.output_text.trim();
  }

  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

function normalizeGeneratedAnswer(question, alternatives, rawAnswer) {
  const normalized = normalizeAnswerValue(rawAnswer);
  const type = String(question.type_question || '').toUpperCase();
  if (type === 'CERTO_ERRADO') {
    if (['CERTO', 'ERRADO'].includes(normalized)) {
      return normalized;
    }
    const byLetter = alternatives.find((alternative) => alternative.letter === normalized);
    const byLetterText = normalizeAnswerValue(byLetter?.text || '');
    return ['CERTO', 'ERRADO'].includes(byLetterText) ? byLetterText : '';
  }

  const letters = new Set(alternatives.map((alternative) => alternative.letter));
  return letters.has(normalized) ? normalized : '';
}

function upsertAiComment(db, question, generated) {
  const text = buildAiCommentText(generated);
  const html = buildAiCommentHtml(generated);
  const rawJson = JSON.stringify({
    provider: 'openai',
    model: generated.model,
    answer: generated.answer,
    confidence: generated.confidence,
    warning: generated.warning || '',
    response: generated.rawResponse
  });

  db.prepare(`
    INSERT INTO comments (
      question_id, html, html_local, text, professor, date_text, extracted_answer,
      raw_json, checked_at, source_type, ai_model, ai_generated_at, ai_confidence
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'ai', ?, ?, ?)
    ON CONFLICT(question_id) DO UPDATE SET
      html = excluded.html,
      html_local = excluded.html_local,
      text = excluded.text,
      professor = excluded.professor,
      date_text = excluded.date_text,
      extracted_answer = excluded.extracted_answer,
      raw_json = excluded.raw_json,
      checked_at = CURRENT_TIMESTAMP,
      source_type = 'ai',
      ai_model = excluded.ai_model,
      ai_generated_at = excluded.ai_generated_at,
      ai_confidence = excluded.ai_confidence
  `).run(
    question.id_question,
    html,
    html,
    text,
    'IA (OpenAI)',
    generated.generatedAt,
    generated.answer,
    rawJson,
    generated.model,
    generated.generatedAt,
    Number(generated.confidence || 0)
  );

  db.prepare(`
    UPDATE questions
    SET possui_comentario_ia = 1,
        ai_answer = ?,
        ai_answer_model = ?,
        ai_answer_generated_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id_question = ?
  `).run(generated.answer, generated.model, generated.generatedAt, question.id_question);
}

function buildAiCommentText(generated) {
  return [
    'Comentario gerado por IA. Nao e gabarito oficial do Tec Concursos.',
    `Gabarito indicado pela IA: ${generated.answer}`,
    generated.warning ? `Observacao: ${generated.warning}` : '',
    '',
    generated.explanation || ''
  ].filter(Boolean).join('\n');
}

function buildAiCommentHtml(generated) {
  return [
    '<p><strong>Comentario gerado por IA.</strong> Nao e gabarito oficial do Tec Concursos.</p>',
    `<p><strong>Gabarito indicado pela IA:</strong> ${escapeHtml(generated.answer)}</p>`,
    generated.warning ? `<p><strong>Observacao:</strong> ${escapeHtml(generated.warning)}</p>` : '',
    `<p>${escapeHtml(generated.explanation || '').replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
  ].filter(Boolean).join('\n');
}

function getPrfNotebookRefs(report) {
  const refs = [];
  const seen = new Set();

  for (const notebook of report.notebooks || []) {
    const match = String(notebook.url || '').match(/\/questoes\/cadernos\/(\d+)/);
    if (!match) {
      continue;
    }

    const id = Number(match[1]);
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    refs.push({
      id,
      title: notebook.title || `Caderno ${id}`,
      url: notebook.url,
      subjects: notebook.subjects || []
    });
  }

  return refs;
}

function shouldSkipNotebookQuestions(notebook, patterns) {
  if (!patterns.length) {
    return false;
  }

  return notebookMatchesAnyPattern(notebook, patterns);
}

function notebookMatchesAnyPattern(notebook, patterns) {
  const values = [
    notebook.title,
    ...((notebook.subjects || []).flatMap((subject) => [
      subject.matter,
      subject.subject
    ]))
  ];

  return values.some((value) => matchesAnyPattern(value, patterns));
}

function matchesQuestionMatter(question, patterns) {
  const values = [
    question.materia,
    question.assunto,
    question.nomeMateria,
    question.nomeAssunto
  ];

  return values.some((value) => matchesAnyPattern(value, patterns));
}

function getNotebookMatterSummary(notebook) {
  const matters = unique((notebook.subjects || [])
    .map((subject) => subject.matter)
    .filter(Boolean));

  if (matters.length) {
    return matters.join(', ');
  }

  return notebook.title || `Caderno ${notebook.id}`;
}

async function ensureApiSession(page) {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/cadernos/ultimos-acessados?menuSelecionado=RECENTES&requestId=check-session', {
      credentials: 'include'
    });
    return {
      ok: response.ok,
      contentType: response.headers.get('content-type') || '',
      text: await response.text()
    };
  });

  if (!result.ok || !result.contentType.includes('json')) {
    throw new Error('Sessão do Tec não está autenticada. Rode npm run login e tente novamente.');
  }
}

async function fetchApiJson(page, apiPath) {
  return page.evaluate(async (pathName) => {
    const response = await fetch(pathName, { credentials: 'include' });
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (response.status === 405 && /Human Verification/i.test(text)) {
      throw new Error('HUMAN_VERIFICATION');
    }

    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    if (!contentType.includes('json')) {
      throw new Error(`Resposta nao JSON em ${pathName}: ${text.slice(0, 300)}`);
    }

    return JSON.parse(text);
  }, apiPath);
}

function isTemporaryTecBlockError(error) {
  return /HUMAN_VERIFICATION|Human Verification|RATE_LIMIT|HTTP 429|Too Many Requests|Failed to fetch|NetworkError|Load failed|net::ERR|ERR_NETWORK/i.test(String(error?.message || error));
}

async function runTecOperation(page, operation, { manualOnBlock, blockRetries = 0, blockPauseMs = 0, label }) {
  let attempts = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isTemporaryTecBlockError(error)) {
        throw error;
      }

      if (manualOnBlock) {
        await waitForManualTecVerification(page, label, error);
        continue;
      }

      if (attempts >= blockRetries || blockPauseMs <= 0) {
        throw error;
      }

      attempts += 1;
      console.error(`O Tec limitou temporariamente durante: ${label}.`);
      console.error(`Detalhe: ${String(error?.message || error)}`);
      console.error(`Pausa conservadora: aguardando ${formatDuration(blockPauseMs)} antes da tentativa ${attempts}/${blockRetries}...`);
      await page.waitForTimeout(blockPauseMs);
    }
  }
}

async function waitForManualTecVerification(page, label, error) {
  console.error(`O Tec pediu verificacao/limitou durante: ${label}.`);
  console.error(`Detalhe: ${String(error?.message || error)}`);
  console.error('Resolva a verificacao manualmente no navegador aberto. Depois volte ao terminal.');

  await page.bringToFront().catch(() => {});
  await page.goto('https://www.tecconcursos.com.br/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  const rl = readline.createInterface({ input, output });
  try {
    await rl.question('Pressione Enter para tentar continuar do mesmo ponto...');
  } finally {
    rl.close();
  }

  await page.waitForTimeout(1000);
}

async function fetchNotebookQuestionIndex(page, notebookId) {
  const firstPage = await fetchApiJson(page, `/api/cadernos/${notebookId}/gabarito?exibicao=TODAS&pagina=1`);
  const rows = [...(firstPage.list || [])];
  const totalPages = Number(firstPage.totalPages || 1);

  for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
    const data = await fetchApiJson(page, `/api/cadernos/${notebookId}/gabarito?exibicao=TODAS&pagina=${pageNumber}`);
    rows.push(...(data.list || []));
  }

  return rows;
}

async function fetchQuestionByPosition(page, notebookId, position) {
  const data = await fetchApiJson(page, `/api/cadernos/${notebookId}/questoes/${position}?atualizarCronometro=false`);
  if (!data.questao?.idQuestao) {
    throw new Error(`Questao ausente no caderno ${notebookId}, posicao ${position}`);
  }

  return data.questao;
}

async function fetchQuestionComment(page, questionId) {
  const data = await fetchApiJson(page, `/api/questoes/${questionId}/comentario?tokenPreVisualizacao=`);
  return data.comentario || null;
}

function upsertNotebook(db, notebook) {
  db.prepare(`
    INSERT INTO notebooks (id, title, url, collected_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url
  `).run(notebook.id, notebook.title, notebook.url);
}

function upsertNotebookQuestion(db, notebookId, row) {
  const answer = extractAnswerFromIndexRow(row);
  db.prepare(`
    INSERT INTO notebook_questions (notebook_id, position, question_id, type_question, answer, answer_source, anulada, favorita, anotada, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(notebook_id, position) DO UPDATE SET
      question_id = excluded.question_id,
      type_question = excluded.type_question,
      answer = excluded.answer,
      answer_source = excluded.answer_source,
      anulada = excluded.anulada,
      favorita = excluded.favorita,
      anotada = excluded.anotada,
      raw_json = excluded.raw_json
  `).run(
    notebookId,
    row.posicaoCaderno,
    row.idQuestao,
    row.tipoQuestao || '',
    answer.value,
    answer.source,
    boolToInt(row.anulada),
    boolToInt(row.favorita),
    boolToInt(row.anotada),
    JSON.stringify(row)
  );

  if (answer.value) {
    db.prepare(`
      UPDATE questions
      SET official_answer = COALESCE(NULLIF(official_answer, ''), ?),
          official_answer_source = COALESCE(NULLIF(official_answer_source, ''), ?)
      WHERE id_question = ?
    `).run(answer.value, answer.source, row.idQuestao);
  }

  return {
    answer: answer.value
  };
}

function getStoredNotebookQuestionIndex(db, notebookId) {
  return db.prepare(`
    SELECT
      position AS posicaoCaderno,
      question_id AS idQuestao,
      type_question AS tipoQuestao,
      answer,
      answer_source AS answerSource,
      anulada,
      favorita,
      anotada
    FROM notebook_questions
    WHERE notebook_id = ?
    ORDER BY position
  `).all(notebookId);
}

function extractAnswerFromIndexRow(row) {
  const answerFromAttempt = extractAnswerFromAttemptStatus(row);
  if (answerFromAttempt.value) {
    return answerFromAttempt;
  }

  const candidates = [];
  collectAnswerCandidates(row, candidates);

  for (const candidate of candidates) {
    const value = normalizeAnswerValue(candidate.value);
    if (value) {
      return {
        value,
        source: candidate.path
      };
    }
  }

  return {
    value: '',
    source: ''
  };
}

function extractAnswerFromAttemptStatus(row) {
  const selected = Number(row?.alternativa);
  if (!Number.isFinite(selected) || selected <= 0) {
    return { value: '', source: '' };
  }

  if (row.acertou === true) {
    return {
      value: numberToAnswerLetter(selected),
      source: 'indice.alternativa_acertou'
    };
  }

  if (row.acertou === false && String(row.tipoQuestao || '').toUpperCase() === 'CERTO_ERRADO') {
    if (selected === 1) {
      return { value: 'B', source: 'indice.alternativa_errada_certo_errado' };
    }
    if (selected === 2) {
      return { value: 'A', source: 'indice.alternativa_errada_certo_errado' };
    }
  }

  return { value: '', source: '' };
}

function numberToAnswerLetter(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 5) {
    return '';
  }
  return String.fromCharCode(64 + number);
}

function collectAnswerCandidates(value, candidates, pathParts = []) {
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const pathName = [...pathParts, key].join('.');
    const normalizedKey = normalizeSearchText(key);
    const keyLooksLikeAnswer = /gabarito|resposta correta|respostacorreta|alternativa correta|alternativacorreta|correta|answer|correct/.test(normalizedKey);

    if (keyLooksLikeAnswer && child !== null && typeof child !== 'object') {
      candidates.push({ path: pathName, value: child });
    }

    if (child && typeof child === 'object') {
      collectAnswerCandidates(child, candidates, [...pathParts, key]);
    }
  }
}

function normalizeAnswerValue(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) {
    return '';
  }

  const text = normalizeSearchText(value);
  if (!text || ['false', 'true', '0'].includes(text)) {
    return '';
  }

  if (/\bcerto\b/.test(text)) return 'CERTO';
  if (/\berrado\b/.test(text)) return 'ERRADO';

  const letter = text.match(/\b[a-e]\b/);
  if (letter) {
    return letter[0].toUpperCase();
  }

  if (/^[1-5]$/.test(text)) {
    return String.fromCharCode(64 + Number(text));
  }

  return '';
}

function getQuestionStatus(db, questionId) {
  return db.prepare(`
    SELECT
      q.id_question IS NOT NULL AS question_collected,
      c.question_id IS NOT NULL AS comment_checked
    FROM (SELECT ? AS id_question) x
    LEFT JOIN questions q ON q.id_question = x.id_question
    LEFT JOIN comments c ON c.question_id = x.id_question
  `).get(questionId);
}

// Retomada automática: 1ª posição do caderno que AINDA não está pronta (sem corpo
// OU sem linha de comentário) — mesmo critério do skip do loop. Começar aqui pula
// o bloco inicial já feito sem iterar questão por questão.
function isIneditaRaw(rawJson) {
  if (!rawJson) return false;
  try { return Boolean(JSON.parse(rawJson).questaoAdaptadaOuInedita); } catch { return false; }
}

function getResumePosition(db, notebookId) {
  const row = db.prepare(`
    SELECT MIN(nq.position) AS pos
    FROM notebook_questions nq
    LEFT JOIN questions q ON q.id_question = nq.question_id
    LEFT JOIN comments c ON c.question_id = nq.question_id
    WHERE nq.notebook_id = ?
      AND (q.id_question IS NULL OR c.question_id IS NULL)
  `).get(notebookId);
  return Number(row?.pos || 1);
}

function upsertQuestion(db, question) {
  const statementHtml = question.enunciado || '';
  const statementText = htmlToText(statementHtml);
  const alternativeTexts = (question.alternativas || []).map((alternative) => htmlToText(alternative));
  const statementHash = stableTextHash(statementText);
  const contentHash = stableTextHash([statementText, ...alternativeTexts].join('\n'));
  const indexedAnswer = getIndexedQuestionAnswer(db, question.idQuestao);
  db.prepare(`
    INSERT INTO questions (
      id_question, url, statement_html, statement_text, statement_hash, content_hash, type_question, format_question,
      banca, banca_url, orgao_sigla, orgao_nome, orgao_url, cargo, concurso_id,
      concurso_ano, concurso_url, materia_id, materia, assunto_id, assunto,
      assunto_url, capitulo, anulada, desatualizada, possui_comentario,
      possui_comentario_video, possui_comentario_ia, possui_resolucao_banca,
      official_answer, official_answer_source, raw_json, collected_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id_question) DO UPDATE SET
      url = excluded.url,
      statement_html = excluded.statement_html,
      statement_text = excluded.statement_text,
      statement_hash = excluded.statement_hash,
      content_hash = excluded.content_hash,
      type_question = excluded.type_question,
      format_question = excluded.format_question,
      banca = excluded.banca,
      banca_url = excluded.banca_url,
      orgao_sigla = excluded.orgao_sigla,
      orgao_nome = excluded.orgao_nome,
      orgao_url = excluded.orgao_url,
      cargo = excluded.cargo,
      concurso_id = excluded.concurso_id,
      concurso_ano = excluded.concurso_ano,
      concurso_url = excluded.concurso_url,
      materia_id = excluded.materia_id,
      materia = excluded.materia,
      assunto_id = excluded.assunto_id,
      assunto = excluded.assunto,
      assunto_url = excluded.assunto_url,
      capitulo = excluded.capitulo,
      anulada = excluded.anulada,
      desatualizada = excluded.desatualizada,
      possui_comentario = excluded.possui_comentario,
      possui_comentario_video = excluded.possui_comentario_video,
      possui_comentario_ia = excluded.possui_comentario_ia,
      possui_resolucao_banca = excluded.possui_resolucao_banca,
      official_answer = COALESCE(NULLIF(questions.official_answer, ''), excluded.official_answer),
      official_answer_source = COALESCE(NULLIF(questions.official_answer_source, ''), excluded.official_answer_source),
      raw_json = excluded.raw_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    question.idQuestao,
    `https://www.tecconcursos.com.br/questoes/${question.idQuestao}`,
    statementHtml,
    statementText,
    statementHash,
    contentHash,
    question.tipoQuestao || '',
    question.formatoQuestao || '',
    question.bancaSigla || '',
    question.bancaUrl || '',
    question.orgaoSigla || '',
    question.orgaoNome || '',
    question.orgaoUrl || '',
    question.cargoSigla || '',
    question.concursoId || null,
    question.concursoAno || null,
    question.urlConcurso || '',
    question.idMateria || null,
    question.nomeMateria || '',
    question.idAssunto || null,
    question.nomeAssunto || '',
    question.assuntoUrl || '',
    question.capitulo || null,
    boolToInt(question.anulada),
    boolToInt(question.desatualizada),
    boolToInt(question.possuiComentario),
    boolToInt(question.possuiComentarioVideo),
    boolToInt(question.possuiComentarioIA),
    boolToInt(question.possuiResolucaoDaBanca),
    indexedAnswer.value,
    indexedAnswer.source,
    JSON.stringify(question)
  );
}

function getIndexedQuestionAnswer(db, questionId) {
  const row = db.prepare(`
    SELECT answer, answer_source
    FROM notebook_questions
    WHERE question_id = ?
      AND COALESCE(answer, '') != ''
    ORDER BY notebook_id, position
    LIMIT 1
  `).get(questionId);

  return {
    value: row?.answer || '',
    source: row?.answer_source || ''
  };
}

function replaceAlternatives(db, question) {
  db.prepare('DELETE FROM alternatives WHERE question_id = ?').run(question.idQuestao);
  const insert = db.prepare(`
    INSERT INTO alternatives (question_id, position, letter, html, text)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (let index = 0; index < (question.alternativas || []).length; index += 1) {
    const html = question.alternativas[index] || '';
    insert.run(
      question.idQuestao,
      index + 1,
      String.fromCharCode(65 + index),
      html,
      htmlToText(html)
    );
  }
}

function upsertComment(db, questionId, comment) {
  if (comment?.error && isTemporaryTecBlockError(comment.error)) {
    throw new Error(comment.error);
  }

  const html = comment?.textoComentario || '';
  const text = htmlToText(html);
  const professor = comment?.professor?.nome || comment?.nomeProfessor || comment?.autor || '';
  const dateText = comment?.dataComentarioFormatada || comment?.dataComentario || '';
  const question = db.prepare(`
    SELECT id_question, statement_text, type_question
    FROM questions
    WHERE id_question = ?
  `).get(questionId) || { id_question: questionId };
  const alternatives = getQuestionAlternatives(db, questionId);
  const extractedAnswer = extractAnswerFromQuestionComment(question, alternatives, text);

  db.prepare(`
    INSERT INTO comments (question_id, html, html_local, text, professor, date_text, extracted_answer, raw_json, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(question_id) DO UPDATE SET
      html = excluded.html,
      html_local = COALESCE(comments.html_local, excluded.html_local),
      text = excluded.text,
      professor = excluded.professor,
      date_text = excluded.date_text,
      extracted_answer = excluded.extracted_answer,
      raw_json = excluded.raw_json,
      checked_at = CURRENT_TIMESTAMP
  `).run(
    questionId,
    html,
    html,
    text,
    professor,
    String(dateText || ''),
    extractedAnswer,
    comment ? JSON.stringify(comment) : ''
  );
}

async function downloadCommentAssets(db, page, { questionId, html, assetsDir }) {
  const sources = extractImageSources(html);
  if (sources.length === 0) {
    db.prepare('UPDATE comments SET html_local = ? WHERE question_id = ?').run(html, questionId);
    return;
  }

  const replacements = new Map();

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    if (/^data:/i.test(source)) {
      continue;
    }

    const originalUrl = new URL(source, 'https://www.tecconcursos.com.br/').href;
    const existing = db.prepare(`
      SELECT local_path
      FROM comment_assets
      WHERE question_id = ? AND original_url = ?
    `).get(questionId, originalUrl);

    if (existing?.local_path && await fileExists(path.resolve(existing.local_path))) {
      replacements.set(source, normalizeAssetPath(existing.local_path));
      continue;
    }

    try {
      const asset = await fetchAssetBytes(page, originalUrl);
      const sha256 = crypto.createHash('sha256').update(asset.bytes).digest('hex');
      const ext = extensionForAsset(originalUrl, asset.mimeType);
      const fileName = `${String(index + 1).padStart(2, '0')}-${sha256.slice(0, 16)}${ext}`;
      const filePath = path.resolve(assetsDir, 'comments', String(questionId), fileName);
      const localPath = normalizeAssetPath(path.relative(process.cwd(), filePath));

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, asset.bytes);

      db.prepare(`
        INSERT INTO comment_assets (question_id, original_url, local_path, mime_type, sha256, bytes, downloaded_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(question_id, original_url) DO UPDATE SET
          local_path = excluded.local_path,
          mime_type = excluded.mime_type,
          sha256 = excluded.sha256,
          bytes = excluded.bytes,
          downloaded_at = CURRENT_TIMESTAMP
      `).run(
        questionId,
        originalUrl,
        localPath,
        asset.mimeType,
        sha256,
        asset.bytes.length
      );

      replacements.set(source, localPath);
    } catch (error) {
      insertCollectionError(db, {
        questionId,
        stage: 'asset',
        error: `${originalUrl}: ${error.message}`
      });
    }
  }

  const htmlLocal = replaceImageSources(html, replacements);
  db.prepare('UPDATE comments SET html_local = ? WHERE question_id = ?').run(htmlLocal, questionId);
}

function extractImageSources(html) {
  const sources = [];
  const pattern = /<img\b[^>]*\bsrc\s*=\s*(['"])(.*?)\1/gi;
  let match;

  while ((match = pattern.exec(String(html || '')))) {
    const source = match[2]?.trim();
    if (source && !sources.includes(source)) {
      sources.push(source);
    }
  }

  return sources;
}

function replaceImageSources(html, replacements) {
  return String(html || '').replace(/(<img\b[^>]*\bsrc\s*=\s*(['"]))(.*?)(\2)/gi, (match, prefix, quote, source, suffix) => {
    const replacement = replacements.get(source.trim());
    return replacement ? `${prefix}${replacement}${suffix}` : match;
  });
}

async function fetchAssetBytes(page, url) {
  try {
    const asset = await page.evaluate(async (assetUrl) => {
      const response = await fetch(assetUrl, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const mimeType = response.headers.get('content-type') || '';
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }

      return {
        base64: btoa(binary),
        mimeType
      };
    }, url);

    return {
      bytes: Buffer.from(asset.base64, 'base64'),
      mimeType: asset.mimeType
    };
  } catch {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao baixar asset ${url}: HTTP ${response.status}`);
    }

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || ''
    };
  }
}

function extensionForAsset(url, mimeType) {
  const cleanPath = new URL(url).pathname.toLowerCase();
  const ext = path.extname(cleanPath);
  if (/^\.[a-z0-9]{2,5}$/.test(ext)) {
    return ext;
  }

  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('svg')) return '.svg';
  return '.bin';
}

function normalizeAssetPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function trimPreview(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function insertCollectionError(db, errorInfo) {
  db.prepare(`
    INSERT INTO collection_errors (notebook_id, position, question_id, stage, error)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    errorInfo.notebookId || null,
    errorInfo.position || null,
    errorInfo.questionId || null,
    errorInfo.stage || '',
    errorInfo.error || ''
  );
}

function boolToInt(value) {
  return value ? 1 : 0;
}

function htmlToText(html) {
  return decodeHtmlEntities(String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(value) {
  const named = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', ccedil: 'ç',
    eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', ocirc: 'ô',
    otilde: 'õ', uacute: 'ú', uuml: 'ü',
    Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Ccedil: 'Ç',
    Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í', Oacute: 'Ó', Ocirc: 'Ô',
    Otilde: 'Õ', Uacute: 'Ú', Uuml: 'Ü', ndash: '-', mdash: '-',
    ordm: 'º', ordf: 'ª'
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const codePoint = entity[1]?.toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return named[entity] ?? match;
  });
}

function extractAnswerFromText(text) {
  return extractDirectAnswerCandidates(text)[0]?.answer || '';
}

function extractAnswerFromQuestionComment(question, alternatives, text) {
  return extractAnswerFromQuestionCommentV2(question, alternatives, text).answer || '';
}

function extractAnswerFromQuestionCommentV2(question, alternatives, text) {
  const candidates = [];
  const itemStatus = extractExplicitItemStatusCandidate(question, text);
  if (itemStatus) {
    return itemStatus;
  }

  const labeled = extractLabeledAlternativeStatuses(text);
  const targetStatus = commentLikelyAsksForWrongAnswer(question, text) ? 'ERRADA' : 'CORRETA';
  const labeledMatches = labeled.filter((item) => item.status === targetStatus);

  if (labeledMatches.length === 1) {
    const directCandidates = extractDirectAnswerCandidates(text);
    const authoritativeDirect = directCandidates.filter((candidate) => (
      candidate.method.startsWith('gabarito_')
      || candidate.method.startsWith('resposta_')
      || candidate.method === 'logo_correta'
    ));
    const authoritativeAnswers = new Set(authoritativeDirect.map((candidate) => candidate.answer));
    if (authoritativeAnswers.size > 0 && !authoritativeAnswers.has(labeledMatches[0].letter)) {
      return { answer: '', rejectReason: 'candidatos_conflitantes' };
    }
    return {
      answer: labeledMatches[0].letter,
      confidence: 0.95,
      evidenceText: trimPreview(labeledMatches[0].evidenceText || labeledMatches[0].block || '', 500),
      method: `alternativa_${targetStatus.toLowerCase()}_explicita`
    };
  }

  if (labeledMatches.length > 1) {
    return { answer: '', rejectReason: 'multiplas_alternativas_rotuladas' };
  }

  for (const candidate of extractDirectAnswerCandidates(text)) {
    candidates.push(candidate);
  }

  const semanticAlternativeCue = extractSemanticAlternativeCueCandidate(question, alternatives, text);
  if (semanticAlternativeCue) {
    candidates.push(semanticAlternativeCue);
  }

  const byAnswerCue = extractLetterByAnswerCueCandidate(text);
  if (byAnswerCue) {
    candidates.push(byAnswerCue);
  }

  if (labeled.length) {
    const matches = labeled.filter((item) => item.status === targetStatus);
    if (matches.length === 1) {
      candidates.push({
        answer: matches[0].letter,
        confidence: 0.92,
        evidenceText: trimPreview(matches[0].evidenceText || matches[0].block || '', 500),
        method: `alternativa_${targetStatus.toLowerCase()}_unica`
      });
    } else if (matches.length > 1) {
      return { answer: '', rejectReason: 'multiplas_alternativas_rotuladas' };
    }
  }

  if (!candidates.length) {
    return { answer: '', rejectReason: 'sem_candidato' };
  }

  const validated = [];
  for (const candidate of candidates) {
    const answer = normalizeAnswerForQuestion(question, alternatives, candidate.answer);
    if (!answer) {
      continue;
    }
    validated.push({ ...candidate, answer });
  }

  if (!validated.length) {
    return { answer: '', rejectReason: 'invalido_para_tipo' };
  }

  const answers = new Set(validated.map((candidate) => candidate.answer));
  if (answers.size > 1) {
    return { answer: '', rejectReason: 'candidatos_conflitantes' };
  }

  validated.sort((left, right) => right.confidence - left.confidence);
  return validated[0];
}

function extractDirectAnswerCandidates(text) {
  const normalized = normalizeWhitespace(text);
  const search = normalizeSearchText(text);
  const patterns = [
    {
      pattern: /Gabarito(?:\s+(?:oficial|preliminar|definitivo))?\s*[:\-]\s*(?:Letra\s*)?([A-E])/i,
      confidence: 0.97,
      method: 'gabarito_letra'
    },
    {
      pattern: /Gabarito\s+(?:Letra\s*)["'“”]?([A-E])["'“”]?/i,
      confidence: 0.96,
      method: 'gabarito_letra_sem_pontuacao'
    },
    {
      pattern: /Resposta\s*[:\-]\s*(?:Letra\s*)?([A-E])/i,
      confidence: 0.95,
      method: 'resposta_letra'
    },
    {
      pattern: /Alternativa\s+correta\s*[:\-]?\s*([A-E])/i,
      confidence: 0.95,
      method: 'alternativa_correta'
    },
    {
      pattern: /A\s+resposta\s+(?:e|é)\s+(?:a\s+)?(?:letra\s+)?([A-E])/i,
      confidence: 0.94,
      method: 'resposta_e_letra'
    },
    {
      pattern: /Logo,\s*correta\s+a\s+alternativa\s+([A-E])/i,
      confidence: 0.94,
      method: 'logo_correta'
    },
    {
      pattern: /Gabarito\s*[:\-]\s*(Certo|Errado)/i,
      confidence: 0.97,
      method: 'gabarito_certo_errado'
    },
    {
      pattern: /Resposta\s*[:\-]\s*(Certo|Errado)/i,
      confidence: 0.95,
      method: 'resposta_certo_errado'
    },
    {
      pattern: /Item\s+(Certo|Errado)/i,
      confidence: 0.93,
      method: 'item_certo_errado'
    },
    {
      pattern: /(?:O\s+)?item\s+(?:est[aá]|estÃ¡|esta|é|e)\s+(certo|errado|correto|incorreto)/i,
      confidence: 0.94,
      method: 'item_status',
      map: () => ''
    },
    {
      pattern: /(?:Portanto|Logo|Assim),?\s+(certo|errado|correto|incorreto)\s+o\s+item/i,
      confidence: 0.94,
      method: 'status_o_item',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /A\s+assertiva\s+(?:esta|está)\s+(correta|incorreta)/i,
      confidence: 0.93,
      method: 'assertiva_status',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /A\s+afirmativa\s+(?:esta|está)\s+(correta|incorreta)/i,
      confidence: 0.93,
      method: 'afirmativa_status',
      map: mapCorrectWrongStatus
    }
  ];

  const candidates = [];
  for (const item of patterns) {
    const match = normalized.match(item.pattern);
    if (!match) {
      continue;
    }
    candidates.push({
      answer: item.map ? item.map(match[1]) : match[1].toUpperCase(),
      confidence: item.confidence,
      evidenceText: trimPreview(match[0], 500),
      method: item.method
    });
  }
  const searchPatterns = [
    {
      pattern: /\bgabarito\s*(?:[:\-–—]|e\s+|eh\s+)?(?:a\s+)?(?:letra\s*)["']?([a-e])\b/,
      confidence: 0.96,
      method: 'gabarito_letra_busca',
      map: (value) => String(value || '').toUpperCase()
    },
    {
      pattern: /\bgabarito\W{0,8}(?:letra\W{0,4})?([a-e])\b/,
      confidence: 0.96,
      method: 'gabarito_letra_com_aspas_busca',
      map: (value) => String(value || '').toUpperCase()
    },
    {
      pattern: /\bresposta\s*(?:[:\-–—]|e\s+|eh\s+)?(?:a\s+)?(?:letra\s*)["']?([a-e])\b/,
      confidence: 0.95,
      method: 'resposta_letra_busca',
      map: (value) => String(value || '').toUpperCase()
    },
    {
      pattern: /\balternativa\s+correta\s*(?:[:\-–—]|e\s+|eh\s+)?(?:a\s+)?(?:letra\s*)?["']?([a-e])\b/,
      confidence: 0.95,
      method: 'alternativa_correta_letra_busca',
      map: (value) => String(value || '').toUpperCase()
    },
    {
      pattern: /\b(?:a\s+)?resposta\s+(?:esta\s+na|e|eh)\s+(?:a\s+)?(?:letra\s*)?["']?([a-e])\b/,
      confidence: 0.94,
      method: 'resposta_e_letra_busca',
      map: (value) => String(value || '').toUpperCase()
    },
    {
      pattern: /\bgabarito\s*(?:[:\-–—])?\s*(?:questao\s*)?(certo|certa|correto|correta|errado|errada|incorreto|incorreta)\b/,
      confidence: 0.97,
      method: 'gabarito_certo_errado_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\bgabarito\s*(?:[:\-–—])?\s*(?:item\s*)?(certo|certa|correto|correta|errado|errada|incorreto|incorreta)\b/,
      confidence: 0.97,
      method: 'gabarito_item_certo_errado_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\bgabarito\s+indicado\s+(?:pela\s+banca(?:\s+examinadora)?|pelo\s+professor)?\s*[:\-–—]?\s*(certo|certa|correto|correta|errado|errada|incorreto|incorreta)\b/,
      confidence: 0.97,
      method: 'gabarito_indicado_status_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\bgabarito\s+(?:da\s+(?:questao|banca)\s*)?(?:e|eh|[:\-–—])\s*(certo|certa|correto|correta|errado|errada|incorreto|incorreta)\b/,
      confidence: 0.97,
      method: 'gabarito_da_questao_status_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\bresposta\s*(?:[:\-–—])?\s*(certo|certa|correto|correta|errado|errada|incorreto|incorreta)\b/,
      confidence: 0.95,
      method: 'resposta_certo_errado_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /^\s*(certo|certa|correto|correta|errado|errada|incorreto|incorreta)\b/,
      confidence: 0.93,
      method: 'status_inicio_comentario_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /^\s*(?:item|questao)\s+(certo|certa|correto|correta|errado|errada|incorreto|incorreta)\b/,
      confidence: 0.93,
      method: 'item_questao_status_inicio_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\b(?:a\s+)?(?:questao|assertiva|afirmativa)\s+(?:esta|e)\s+(certa|correta|errada|incorreta)\b/,
      confidence: 0.93,
      method: 'questao_assertiva_afirmativa_status_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\b(?:a\s+)?(?:questao|assertiva|afirmativa|afirmacao|item)\s+(?:esta|estava|e|eh|continua|permanece)?\s*(?:plenamente|totalmente|integralmente)?\s*(certa|correta|errada|incorreta|certo|correto|errado|incorreto|verdadeira|falsa)\b/,
      confidence: 0.94,
      method: 'sujeito_status_explicito_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\b(?:a\s+)?(?:questao|assertiva|afirmativa|afirmacao|item)\s+(?:esta|estava|e|eh)?\s*(certinha|certinho)\b/,
      confidence: 0.94,
      method: 'sujeito_certinho_busca',
      map: () => 'CERTO'
    },
    {
      pattern: /\b(?:a\s+)?(?:questao|assertiva|afirmativa|afirmacao|item)\s+(?:esta|estava|e|eh)?\s*(equivocada|equivocado)\b/,
      confidence: 0.94,
      method: 'sujeito_equivocado_busca',
      map: () => 'ERRADO'
    },
    {
      pattern: /\b(?:trata-se|trata se)\s+de\s+(?:item|questao|assertiva|afirmativa)\s+(certo|certa|correto|correta|errado|errada|incorreto|incorreta)\b/,
      confidence: 0.94,
      method: 'trata_se_status_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\bnao\s+ha\s+(?:qualquer\s+)?erro\s+(?:no|na)\s+(?:item|questao|assertiva|afirmativa)\b/,
      confidence: 0.94,
      method: 'sem_erro_no_item_busca',
      map: () => 'CERTO'
    },
    {
      pattern: /\b(?:ha|existe)\s+erro\s+(?:no|na)\s+(?:item|questao|assertiva|afirmativa)\b/,
      confidence: 0.94,
      method: 'ha_erro_no_item_busca',
      map: () => 'ERRADO'
    },
    {
      pattern: /\bo\s+gabarito\s+indica\s+(erro|acerto)\b/,
      confidence: 0.94,
      method: 'gabarito_indica_status_busca',
      map: (value) => normalizeSearchText(value).includes('erro') ? 'ERRADO' : 'CERTO'
    },
    {
      pattern: /\b(?:portanto|logo|assim),?\s+(certo|certa|correto|correta|errado|errada|incorreto|incorreta)\s+(?:o\s+)?(?:item|afirmativa|assertiva)\b/,
      confidence: 0.94,
      method: 'status_o_item_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\b(?:portanto|logo|assim),?\s+(?:esta|e)\s+(certa|correta|errada|incorreta)\b/,
      confidence: 0.93,
      method: 'portanto_esta_status_busca',
      map: mapCorrectWrongStatus
    },
    {
      pattern: /\balternativa\s+([a-e])\s+(?:esta\s+)?correta\b/,
      confidence: 0.92,
      method: 'alternativa_x_correta_busca',
      map: (value) => String(value || '').toUpperCase()
    },
    {
      pattern: /\balternativa\W{0,4}([a-e])\W{0,6}(?:e|eh|esta)\s+(?:a\s+)?correta\b/,
      confidence: 0.92,
      method: 'alternativa_x_e_correta_busca',
      map: (value) => String(value || '').toUpperCase()
    },
    {
      pattern: /\bletra\s+\W{0,3}([a-e])\W{0,3}\s*$/,
      confidence: 0.91,
      method: 'letra_final_busca',
      map: (value) => String(value || '').toUpperCase()
    }
  ];
  for (const item of searchPatterns) {
    const match = search.match(item.pattern);
    if (!match) {
      continue;
    }
    candidates.push({
      answer: item.map ? item.map(match[1]) : String(match[1] || '').toUpperCase(),
      confidence: item.confidence,
      evidenceText: trimPreview(match[0], 500),
      method: item.method
    });
  }
  return candidates;
}

function extractSemanticAlternativeCueCandidate(question, alternatives, text) {
  if (String(question?.type_question || '').toUpperCase() !== 'MULTIPLA_ESCOLHA') {
    return null;
  }

  const normalized = normalizeSearchText(`${question?.statement_text || ''}\n${text || ''}`);
  if (!/\bidentific(?:a|ar|acao|acao|ara|arao|ou)\b/.test(normalized)) {
    return null;
  }

  const matches = [];
  for (const alternative of alternatives || []) {
    const terms = meaningfulAlternativeTerms(alternative.text || '');
    if (!terms.length) {
      continue;
    }
    const matchedTerm = terms.find((term) => (
      new RegExp(`\\bidentific\\w*\\W{0,80}${escapeRegExp(term)}\\b`).test(normalized)
      || new RegExp(`\\b${escapeRegExp(term)}\\b\\W{0,80}\\b(?:do|da|de)?\\s*veiculo\\b`).test(normalized)
    ));
    if (matchedTerm) {
      matches.push({
        answer: alternative.letter,
        term: matchedTerm
      });
    }
  }

  const letters = [...new Set(matches.map((match) => match.answer))];
  if (letters.length !== 1) {
    return null;
  }

  return {
    answer: letters[0],
    confidence: 0.94,
    evidenceText: trimPreview(matches[0].term, 500),
    method: 'alternativa_por_pista_material_identificacao'
  };
}

function meaningfulAlternativeTerms(text) {
  const stopwords = new Set(['a', 'as', 'o', 'os', 'de', 'da', 'do', 'das', 'dos', 'um', 'uma', 'veiculo', 'veiculos']);
  const normalized = normalizeSearchText(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const words = normalized
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopwords.has(word));
  return [...new Set(words)];
}

function mapCorrectWrongStatus(value) {
  const normalized = normalizeSearchText(value);
  return /\bincorreto\b|\bincorreta\b|\berrado\b|\berrada\b|\bfalso\b|\bfalsa\b|\bequivocado\b|\bequivocada\b/.test(normalized) ? 'ERRADO' : 'CERTO';
}

function extractLetterByAnswerCue(text) {
  return extractLetterByAnswerCueCandidate(text)?.answer || '';
}

function extractExplicitItemStatusCandidate(question, text) {
  if (String(question?.type_question || '').toUpperCase() !== 'CERTO_ERRADO') {
    return null;
  }

  const normalized = normalizeSearchText(text);
  const matches = [];
  const patterns = [
    /\b(?:gabarito\s*[:\-]?\s*)?item\s+(certo|correto|errado|incorreto)\b/g,
    /\bo\s+item\s+(?:esta|e)\s+(certo|correto|errado|incorreto)\b/g,
    /\b(?:a\s+)?(?:assertiva|afirmativa|questao)\s+(?:esta|e)\s+(certa|correta|errada|incorreta)\b/g,
    /\b(?:portanto|logo|assim),?\s+(certo|correto|errado|incorreto)\s+o\s+item\b/g
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      matches.push({
        answer: mapCorrectWrongStatus(match[1]),
        evidenceText: match[0]
      });
    }
  }

  const answers = new Set(matches.map((match) => match.answer));
  if (answers.size !== 1) {
    return null;
  }

  const match = matches[matches.length - 1];
  return {
    answer: match.answer,
    confidence: 0.96,
    evidenceText: trimPreview(match.evidenceText, 500),
    method: 'item_status_explicito'
  };
}

function extractLetterByAnswerCueCandidate(text) {
  const matches = getCommentAlternativeBlocks(text)
    .filter((item) => /aqui esta a resposta|esta e a resposta|essa e a resposta/.test(normalizeSearchText(item.block)));
  return matches.length === 1
    ? {
        answer: matches[0].letter,
        confidence: 0.93,
        evidenceText: trimPreview(matches[0].block || '', 500),
        method: 'bloco_indica_resposta'
      }
    : null;
}

function extractLabeledAlternativeStatuses(text) {
  const items = [];

  for (const item of getCommentAlternativeBlocks(text)) {
    const block = normalizeSearchText(item.block);
    const hasCorrect = /\bcorreta\b|\bcorreto\b/.test(block);
    const hasWrong = /\berrada\b|\berrado\b|\bincorreta\b|\bincorreto\b/.test(block);
    if (hasCorrect && !hasWrong) {
      items.push({ letter: item.letter, status: 'CORRETA', block: item.block, evidenceText: item.block });
    } else if (hasWrong && !hasCorrect) {
      items.push({ letter: item.letter, status: 'ERRADA', block: item.block, evidenceText: item.block });
    } else if (/aqui esta a resposta|esta e a resposta|essa e a resposta/.test(block)) {
      items.push({ letter: item.letter, status: hasWrong ? 'ERRADA' : 'CORRETA', block: item.block, evidenceText: item.block });
    }
  }

  const seen = new Set(items.map((item) => `${item.letter}:${item.status}`));
  const explicitAlternativePattern = /\balternativa\s+([a-e])\s*(?:[-:]\s*)?(incorreta|incorreto|errada|errado|correta|correto)\b/gi;
  for (const match of normalizeSearchText(text).matchAll(explicitAlternativePattern)) {
    const letter = match[1].toUpperCase();
    const status = mapCorrectWrongStatus(match[2]) === 'CERTO' ? 'CORRETA' : 'ERRADA';
    const key = `${letter}:${status}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({ letter, status, block: match[0], evidenceText: match[0] });
  }

  const directPattern = /\b([a-e])\)\s*(correta|correto|errada|errado|incorreta|incorreto)\s*[:.;-]/gi;
  for (const match of normalizeSearchText(text).matchAll(directPattern)) {
    const letter = match[1].toUpperCase();
    const status = mapCorrectWrongStatus(match[2]) === 'CERTO' ? 'CORRETA' : 'ERRADA';
    const key = `${letter}:${status}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push({ letter, status, block: match[0], evidenceText: match[0] });
  }

  return items;
}

function getCommentAlternativeBlocks(text) {
  const normalized = String(text || '').replace(/\r/g, '\n');
  const pattern = /(?:^|\n)\s*([a-e])\)\s*([\s\S]*?)(?=(?:^|\n)\s*[a-e]\)\s|\s*$)/gi;
  return [...normalized.matchAll(pattern)].map((match) => ({
    letter: match[1].toUpperCase(),
    block: match[2] || ''
  }));
}

function commentLikelyAsksForWrongAnswer(question, text) {
  const statement = normalizeSearchText(question?.statement_text || '');
  const combined = normalizeSearchText(`${question?.statement_text || ''}\n${text || ''}`);
  return /\bexceto\b|\bincorreta\b|\bincorreto\b|\berrada\b|\berrado\b|\bnao\s+(?:e|esta)\s+correta\b/.test(statement)
    || /buscando a resposta errada|resposta errada|alternativa errada|alternativa incorreta/.test(combined);
}

function normalizeAnswerForQuestion(question, alternatives, value) {
  const normalized = normalizeAnswerValue(value);
  if (!normalized) {
    return '';
  }

  const type = String(question?.type_question || '').toUpperCase();
  if (type === 'CERTO_ERRADO') {
    if (['CERTO', 'ERRADO'].includes(normalized)) {
      return normalized;
    }
    const alternative = alternatives.find((item) => item.letter === normalized);
    const alternativeText = normalizeAnswerValue(alternative?.text || '');
    return ['CERTO', 'ERRADO'].includes(alternativeText) ? alternativeText : '';
  }

  if (/^[A-E]$/.test(normalized)) {
    return alternatives.some((item) => item.letter === normalized) ? normalized : '';
  }

  return '';
}

function stableTextHash(value) {
  const normalized = normalizeWhitespace(String(value || ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flattenPrfPrintableItems(report) {
  const metadataByUrl = buildFirstPrfMetadataByUrl(report);
  const urls = report.urls?.length ? report.urls : [...metadataByUrl.keys()];

  return urls
    .filter(isValidPrintUrl)
    .map((url) => metadataByUrl.get(url))
    .filter(Boolean);
}

function buildFirstPrfMetadataByUrl(report) {
  const metadataByUrl = new Map();

  for (const notebook of report.notebooks || []) {
    for (const item of notebook.printableUrls || []) {
      if (!item.printUrl || metadataByUrl.has(item.printUrl)) {
        continue;
      }

      metadataByUrl.set(item.printUrl, {
        notebook: notebook.title || '',
        matter: item.matter || notebook.title || '',
        subject: item.subject || '',
        printUrl: item.printUrl
      });
    }
  }

  return metadataByUrl;
}

async function getUniquePdfPath(directory, baseName, usedPaths) {
  let attempt = 0;

  while (true) {
    const suffix = attempt === 0 ? '' : ` (${attempt + 1})`;
    const candidate = path.resolve(directory, `${baseName}${suffix}.pdf`);
    const key = candidate.toLowerCase();

    if (!usedPaths.has(key) && !(await fileExists(candidate))) {
      usedPaths.add(key);
      return candidate;
    }

    attempt += 1;
  }
}

async function findExistingPrfPdf(directory, baseName) {
  const exactPath = path.resolve(directory, `${baseName}.pdf`);
  if (await fileExists(exactPath)) {
    return exactPath;
  }

  if (!(await directoryExists(directory))) {
    return '';
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const escaped = escapeRegExp(baseName);
  const orderedPattern = new RegExp(`^\\d{3}\\s+-\\s+${escaped}(?: \\(\\d+\\))?\\.pdf$`, 'i');
  const duplicatePattern = new RegExp(`^${escaped}(?: \\(\\d+\\))?\\.pdf$`, 'i');
  const match = entries.find((entry) => entry.isFile() && orderedPattern.test(entry.name))
    || entries.find((entry) => entry.isFile() && duplicatePattern.test(entry.name));

  return match ? path.resolve(directory, match.name) : '';
}

async function directoryExists(directory) {
  try {
    const stats = await fs.stat(directory);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function openPrintablePage(page, url, config) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForPage(page, config);

  const printButton = config.selectors?.printButton;
  if (!printButton) {
    return page;
  }

  if (/\/imprimir-capitulo\b/.test(page.url())) {
    return page;
  }

  const button = page.locator(printButton).first();
  if (!(await button.count())) {
    console.warn(`  aviso: botao de impressao nao encontrado: ${printButton}`);
    return page;
  }

  const href = await button.getAttribute('href').catch(() => null);
  if (href) {
    await page.goto(new URL(href, page.url()).href, { waitUntil: 'domcontentloaded' });
    await waitForPage(page, config);
    return page;
  }

  const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
  await button.click();
  const popup = await popupPromise;

  if (popup) {
    await waitForPage(popup, config);
    return popup;
  }

  await waitForPage(page, config);
  return page;
}

async function waitForPage(page, config) {
  const ready = config.selectors?.ready || 'body';
  await page.waitForSelector(ready, { state: 'visible' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(Number(config.settleMs || 0));
}

async function getDocumentTitle(page, config) {
  const selector = config.selectors?.title;

  if (selector) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const text = normalizeWhitespace(await locator.textContent());
      if (text) {
        return text;
      }
    }
  }

  return normalizeWhitespace(await page.title());
}

async function isolateContent(page, contentSelector) {
  if (!contentSelector) {
    return;
  }

  await page.evaluate((selector) => {
    const content = document.querySelector(selector);
    if (!content) {
      return;
    }

    const clone = content.cloneNode(true);
    document.body.replaceChildren(clone);
  }, contentSelector);
}

async function collectLinks(config, args) {
  const collectConfig = config.collect || {};
  const startUrl = args['start-url'] || collectConfig.startUrl;

  if (!startUrl) {
    throw new Error('Informe collect.startUrl no config ou use --start-url.');
  }

  const context = await launchContext(config);
  const page = await getFirstPage(context);
  page.setDefaultTimeout(config.defaultTimeoutMs);

  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  await waitForPage(page, config);

  const linkSelector = args['link-selector'] || collectConfig.linkSelector || 'a[href]';
  const includePattern = args.include || collectConfig.includePattern || '';
  const urls = await page.$$eval(linkSelector, (links) => {
    return links
      .map((link) => link.href)
      .filter(Boolean);
  });

  const filtered = unique(urls)
    .filter((url) => !includePattern || url.includes(includePattern))
    .sort((a, b) => a.localeCompare(b));

  const outputFile = args.output || collectConfig.outputFile || 'aulas.generated.txt';
  await fs.writeFile(outputFile, `${filtered.join('\n')}\n`, 'utf8');
  await context.close();

  console.log(`${filtered.length} links salvos em ${path.resolve(outputFile)}`);
}

async function collectPrfGuide(config, args) {
  const prfConfig = config.prf || {};
  const guideUrl = args['guide-url'] || prfConfig.guideUrl;
  const outputFile = args.output || prfConfig.outputFile || 'aulas.prf.txt';
  const reportFile = args.report || prfConfig.reportFile || 'aulas.prf.json';
  const resolvePrintLinks = parseBoolean(args['resolve-print'], prfConfig.resolvePrintLinks);
  const saveMissing = Boolean(args['save-missing']);
  const delayMs = Number(args.delay || prfConfig.delayMs || 0);
  const limitNotebooks = Number(args['limit-notebooks'] || 0);
  const limitSubjects = Number(args['limit-subjects'] || 0);

  const context = await launchContext(config);
  const page = await getFirstPage(context);
  page.setDefaultTimeout(config.defaultTimeoutMs);

  await page.goto(guideUrl, { waitUntil: 'domcontentloaded' });
  await waitForPage(page, config);
  await ensureLoggedIn(page);

  if (saveMissing) {
    await saveAllAvailableGuideNotebooks(page, config);
  }

  let notebooks = await collectGuideNotebooks(page);
  if (notebooks.length === 0) {
    throw new Error('Nenhum caderno do guia foi encontrado. Faça login e, se necessário, rode com --save-missing.');
  }

  if (limitNotebooks > 0) {
    notebooks = notebooks.slice(0, limitNotebooks);
  }

  const report = {
    source: guideUrl,
    collectedAt: new Date().toISOString(),
    resolvePrintLinks: Boolean(resolvePrintLinks),
    notebooks: [],
    urls: []
  };

  for (let index = 0; index < notebooks.length; index += 1) {
    const notebook = notebooks[index];
    const ordinal = String(index + 1).padStart(2, '0');
    console.log(`[${ordinal}/${notebooks.length}] Lendo caderno: ${notebook.title || notebook.url}`);

    let subjectLinks = await collectNotebookSubjectLinks(page, notebook.url, config);
    if (limitSubjects > 0) {
      subjectLinks = subjectLinks.slice(0, limitSubjects);
    }
    const notebookReport = {
      ...notebook,
      subjects: subjectLinks,
      printableUrls: []
    };

    if (resolvePrintLinks) {
      for (const subject of subjectLinks) {
        await page.goto(subject.url, { waitUntil: 'domcontentloaded' });
        await waitForPage(page, config);

        const printUrl = await findPrintUrl(page, config.selectors?.printButton);
        if (printUrl) {
          notebookReport.printableUrls.push({
            ...subject,
            printUrl
          });
          report.urls.push(printUrl);
        }

        if (delayMs) {
          await page.waitForTimeout(delayMs);
        }
      }
    } else {
      notebookReport.printableUrls = subjectLinks.map((subject) => ({
        ...subject,
        printUrl: subject.url
      }));
      report.urls.push(...subjectLinks.map((subject) => subject.url));
    }

    report.notebooks.push(notebookReport);
    console.log(`  assuntos: ${subjectLinks.length}; imprimiveis: ${notebookReport.printableUrls.length}`);
  }

  report.urls = unique(report.urls);
  await fs.writeFile(outputFile, `${report.urls.join('\n')}\n`, 'utf8');
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await context.close();

  console.log(`${report.urls.length} URLs salvas em ${path.resolve(outputFile)}`);
  console.log(`Relatorio salvo em ${path.resolve(reportFile)}`);
}

async function ensureLoggedIn(page) {
  if (/\/login\b/.test(page.url())) {
    throw new Error('A sessão não está logada. Rode npm run login primeiro e tente novamente.');
  }
}

async function saveAllAvailableGuideNotebooks(page, config) {
  const saveAll = page.locator('button.btn-total, button:has-text("SALVAR TUDO")');
  if (!(await saveAll.count())) {
    return;
  }

  console.log('Salvando cadernos disponiveis do guia...');
  await saveAll.first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(Number(config.settleMs || 0) + 3000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPage(page, config);
}

async function collectGuideNotebooks(page) {
  return page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/questoes/cadernos/"]')];
    const seen = new Set();

    return links
      .map((link) => {
        const url = link.href;
        if (seen.has(url)) {
          return null;
        }

        seen.add(url);
        const container = link.closest('.caderno-guia, .guia-item, li, article, section, div') || link.parentElement;
        const text = container?.innerText || link.innerText || '';
        const firstLine = text
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line && !['ABRIR', 'aqui'].includes(line));

        return {
          title: firstLine || link.innerText.trim() || url,
          url
        };
      })
      .filter(Boolean);
  });
}

async function collectNotebookSubjectLinks(page, notebookUrl, config) {
  await page.goto(notebookUrl, { waitUntil: 'domcontentloaded' });
  await waitForPage(page, config);

  const indexTab = page.getByText('Índice', { exact: true });
  if (await indexTab.count()) {
    await indexTab.first().click();
    await page.waitForTimeout(1000);
  }

  const expand = page.getByText('Expandir', { exact: true });
  if (await expand.count()) {
    await expand.first().click();
    await page.waitForTimeout(1500);
  }

  const subjectLinks = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('a.assunto-nome')];
    const results = [];
    let currentMatter = null;

    for (const row of rows) {
      const scope = window.angular?.element(row).scope();
      const item = scope?.assunto;
      if (!item || typeof item.id !== 'number') {
        continue;
      }

      if (item.tipo === 'Materia') {
        currentMatter = {
          id: item.id,
          name: item.nome || row.innerText.trim()
        };
        continue;
      }

      if (item.tipo !== 'Assunto' || !currentMatter) {
        continue;
      }

      results.push({
        matterId: currentMatter.id,
        matter: currentMatter.name,
        subjectId: item.id,
        subject: item.nome || row.innerText.trim(),
        questions: item.contagem || 0,
        url: `${location.origin}/aulas/materias/${currentMatter.id}/assuntos/${item.id}`
      });
    }

    return results;
  });

  return uniqueBy(subjectLinks, (subject) => subject.url);
}

async function findPrintUrl(page, printSelector) {
  const selector = printSelector || 'a[href*="/imprimir-capitulo"]';
  const link = page.locator(selector).first();

  if (!(await link.count())) {
    return '';
  }

  const href = await link.getAttribute('href').catch(() => '');
  if (!href) {
    return '';
  }

  const printUrl = new URL(href, page.url()).href;
  return isValidPrintUrl(printUrl) ? printUrl : '';
}

async function getFirstPage(context) {
  const existing = context.pages()[0];
  return existing || context.newPage();
}

async function readUrls(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueBy(values, getKey) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const key = getKey(value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function getListOption(value, fallback = []) {
  if (value === undefined || value === true || value === '') {
    return Array.isArray(fallback) ? fallback : [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getNumberListOption(value, fallback = []) {
  return getListOption(value, fallback)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function normalizeWhitespace(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSearchText(value) {
  return normalizeWhitespace(String(value || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sanitizeFilename(value) {
  return normalizeWhitespace(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\.+$/g, '')
    .slice(0, 130) || 'aula';
}

function stripPdfExtension(filename) {
  return filename.replace(/\.pdf$/i, '');
}

function isValidPrintUrl(url) {
  return /\/aulas\/capitulos\/\d+\/imprimir-capitulo\b/.test(String(url || ''));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAnyPattern(value, patterns) {
  const normalizedValue = normalizeSearchText(value);
  return patterns.some((pattern) => {
    const normalizedPattern = normalizeSearchText(pattern);
    return normalizedPattern && normalizedValue.includes(normalizedPattern);
  });
}

function shouldPauseBatch(processed, batchSize, batchPauseMs, limit) {
  if (!batchSize || !Number.isFinite(batchSize) || batchSize <= 0) {
    return false;
  }
  if (!batchPauseMs || !Number.isFinite(batchPauseMs) || batchPauseMs <= 0) {
    return false;
  }
  if (processed <= 0 || processed % batchSize !== 0) {
    return false;
  }
  if (limit > 0 && processed >= limit) {
    return false;
  }
  return true;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes && seconds) {
    return `${minutes} min ${seconds} s`;
  }
  if (minutes) {
    return `${minutes} min`;
  }
  return `${seconds} s`;
}

function printHelp() {
  console.log(`
Uso:
  node src/tec-to-pdf.mjs login --config config.local.json --start-url "https://www.tecconcursos.com.br/"
  node src/tec-to-pdf.mjs pdf --config config.local.json --urls aulas.txt
  node src/tec-to-pdf.mjs pdf-prf --config config.local.json --report aulas.prf.json
  node src/tec-to-pdf.mjs organize-prf --config config.local.json
  node src/tec-to-pdf.mjs order-prf --config config.local.json
  node src/tec-to-pdf.mjs questions-prf --config config.local.json
  node src/tec-to-pdf.mjs questions-prf --config config.local.json --skip-comments --limit 300 --delay 3000
  node src/tec-to-pdf.mjs questions-prf --config config.local.json --skip-comments --limit 10000 --manual-on-block
  node src/tec-to-pdf.mjs questions-prf --config config.local.json --skip-comments --limit 300 --delay 3000 --batch-size 75 --batch-pause 1800000
  node src/tec-to-pdf.mjs questions-prf --config config.local.json --comments-only --skip-assets --limit 100 --delay 8000
  node src/tec-to-pdf.mjs ai-comments-prf --config config.local.json --limit 10 --model gpt-5-mini
  node src/tec-to-pdf.mjs assets-prf --config config.local.json
  node src/tec-to-pdf.mjs collect --config config.local.json --start-url "https://..."
  node src/tec-to-pdf.mjs collect-prf --config config.local.json
`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
