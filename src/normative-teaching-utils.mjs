export const ANSWER_POLICIES = new Set([
  'current_safe',
  'current_with_adaptation',
  'historical_only',
  'manual_review',
  'discard',
  'do_not_autocorrect'
]);

export const ADAPTATION_STATUSES = new Set([
  'no_adaptation_needed',
  'adapt_statement',
  'adapt_legal_reference',
  'adapt_alternatives',
  'manual_review',
  'discard',
  'needs_review'
]);

export const STUDY_RECOMMENDATIONS = new Set([
  'study_current_rule',
  'study_with_warning',
  'manual_review',
  'discard'
]);

export const SAFETY_LEVELS = new Set(['high', 'medium', 'low', 'manual']);

export function normalizeAnswerForQuestionType(rawAnswer, questionType, alternatives = []) {
  const raw = String(rawAnswer ?? '').trim();
  const type = normalizePlain(questionType);
  const normalizedType = type.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const letters = alternatives
    .map((alternative) => String(alternative.letter || '').trim().toUpperCase())
    .filter(Boolean);
  const letterSet = new Set(letters);
  const isTrueFalse = normalizedType.includes('certo_errado')
    || normalizedType.includes('certo') && normalizedType.includes('errado');

  if (!raw || isNullishAnswer(raw)) {
    return { answer: null, valid: true, reason: 'empty_or_manual' };
  }

  const normalizedRaw = normalizeAnswerCandidate(raw);
  if (isTrueFalse) {
    if (normalizedRaw === 'CERTO' || normalizedRaw === 'ERRADO') {
      return { answer: normalizedRaw, valid: true, reason: 'true_false_text' };
    }

    const letter = extractAnswerLetter(raw);
    const mapped = mapExplicitTrueFalseLetter(letter, alternatives);
    if (mapped) {
      return { answer: mapped, valid: true, reason: 'explicit_true_false_alternative' };
    }

    return {
      answer: null,
      valid: false,
      reason: 'true_false_requires_certo_errado'
    };
  }

  if (normalizedRaw === 'CERTO' || normalizedRaw === 'ERRADO') {
    return {
      answer: null,
      valid: false,
      reason: 'multiple_choice_rejects_certo_errado'
    };
  }

  const letter = extractAnswerLetter(raw);
  if (letter && letterSet.has(letter)) {
    return { answer: letter, valid: true, reason: 'multiple_choice_letter' };
  }

  return {
    answer: null,
    valid: false,
    reason: 'answer_not_in_alternatives'
  };
}

export function validateTeachingPayload(payload, context) {
  const data = payload && typeof payload === 'object' ? { ...payload } : {};
  const issues = [];
  const alternatives = context.alternatives || [];
  const normalizedCurrent = normalizeAnswerForQuestionType(data.current_answer, context.questionType, alternatives);
  const normalizedHistorical = normalizeAnswerForQuestionType(data.historical_answer, context.questionType, alternatives);

  if (!normalizedCurrent.valid) {
    issues.push(`current_answer_invalid:${normalizedCurrent.reason}`);
  }

  data.current_answer = normalizedCurrent.answer;
  data.historical_answer = normalizedHistorical.answer || cleanText(data.historical_answer || context.historicalAnswer || '');
  data.current_answer_label = cleanText(data.current_answer_label || answerLabel(data.current_answer));
  data.current_answer_confidence = clampNumber(data.current_answer_confidence, 0, 1, 0);
  data.answer_changed = Boolean(data.current_answer && normalizedHistorical.answer && data.current_answer !== normalizedHistorical.answer);
  data.answer_policy = validChoice(data.answer_policy, ANSWER_POLICIES, data.current_answer ? 'current_with_adaptation' : 'manual_review');
  data.adaptation_status = validChoice(data.adaptation_status, ADAPTATION_STATUSES, 'needs_review');
  data.study_recommendation = validChoice(data.study_recommendation, STUDY_RECOMMENDATIONS, 'manual_review');
  data.safety_level = validChoice(data.safety_level, SAFETY_LEVELS, 'manual');

  if (!data.current_answer && data.answer_policy === 'current_safe') {
    data.answer_policy = 'manual_review';
    data.study_recommendation = 'manual_review';
    issues.push('current_safe_without_current_answer');
  }

  if ((data.safety_level === 'low' || data.safety_level === 'manual')
    && (data.answer_policy === 'current_safe' || data.answer_policy === 'current_with_adaptation')) {
    data.answer_policy = 'manual_review';
    data.study_recommendation = 'manual_review';
    issues.push('unsafe_policy_downgraded');
  }

  data.adapted_statement = cleanText(data.adapted_statement);
  data.short_explanation = cleanText(data.short_explanation);
  data.teaching_comment_md = cleanText(data.teaching_comment_md);
  data.teaching_comment_html = data.teaching_comment_html || markdownToSafeHtml(data.teaching_comment_md);
  data.legal_basis = cleanText(data.legal_basis);
  data.current_rule_summary = cleanText(data.current_rule_summary);
  data.why_outdated = cleanText(data.why_outdated);
  data.literal_statement_warning = cleanText(data.literal_statement_warning);
  data.alternatives_analysis = Array.isArray(data.alternatives_analysis) ? data.alternatives_analysis : [];

  return {
    data,
    issues,
    validCurrentAnswer: Boolean(data.current_answer && normalizedCurrent.valid)
  };
}

export function buildTemplateTeachingComment(record) {
  const question = record.question || record;
  const normative = record.normativeUpdate || record.normative_update || {};
  const alternatives = record.alternatives || [];
  const questionType = question.type_question || question.typeQuestion || '';
  const historicalRaw = normative.gabarito_banco || normative.gabaritoBanco || record.historicalAnswer || '';
  const currentRaw = normative.gabarito_atualizado_provavel || normative.gabaritoAtualizadoProvavel || '';
  const current = normalizeAnswerForQuestionType(currentRaw, questionType, alternatives);
  const historical = normalizeAnswerForQuestionType(historicalRaw, questionType, alternatives);
  const safety = mapSafetyLevel(normative.nivel_seguranca || normative.nivelSeguranca);
  const recommendation = normalizePlain(normative.recomendacao);
  const changedText = normalizePlain(normative.mudanca_gabarito || normative.mudancaGabarito);
  const discard = recommendation.includes('descartar');
  const manual = recommendation.includes('revisao manual') || changedText.includes('revisao manual') || safety === 'low' || safety === 'manual';
  const adapt = recommendation.includes('adaptar');
  const answerPolicy = discard
    ? 'discard'
    : manual
      ? 'manual_review'
      : current.answer
        ? (adapt ? 'current_with_adaptation' : 'current_safe')
        : 'manual_review';
  const adaptationStatus = discard
    ? 'discard'
    : manual
      ? 'manual_review'
      : adapt
        ? 'adapt_legal_reference'
        : 'no_adaptation_needed';
  const studyRecommendation = discard
    ? 'discard'
    : manual
      ? 'manual_review'
      : adapt
        ? 'study_with_warning'
        : 'study_current_rule';

  const currentLabel = current.answer ? answerLabel(current.answer) : 'Revisao manual necessaria';
  const whyOutdated = cleanText(normative.por_que_desatualizada || normative.porQueDesatualizada);
  const legalBasis = cleanText(normative.fundamento_juridico_atual || normative.fundamentoJuridicoAtual);
  const currentRule = cleanText(normative.nova_regra_estado_atual || normative.novaRegraEstadoAtual);
  const literalWarning = cleanText(normative.observacao_enunciado_literal || normative.observacaoEnunciadoLiteral);
  const shortExplanation = current.answer
    ? `Pela regra atual, o gabarito provavel seria ${current.answer}. ${adapt ? 'A questao exige adaptacao do enunciado ou do fundamento antes de uso definitivo.' : 'A analise normativa indica aproveitamento com cautela.'}`
    : 'Nao ha seguranca suficiente para definir gabarito atual automaticamente. Revisao manual necessaria.';

  const alternativesAnalysis = buildAlternativesAnalysis(alternatives, current.answer, questionType);
  const md = [
    '# Comentario atualizado',
    '',
    current.answer
      ? `Pela regra atual, o gabarito provavel seria: **${current.answer}**.`
      : 'Nao ha seguranca suficiente para definir gabarito atual. Revisao manual necessaria.',
    '',
    discard
      ? 'Questao nao recomendada para estudo sem reformulacao.'
      : adapt
        ? 'Esta questao pode ser estudada, mas o enunciado ou o fundamento deve ser adaptado.'
        : 'A questao pode ser usada como revisao da regra atual, com conferencia manual.',
    '',
    whyOutdated ? `## Por que ficou desatualizada\n${whyOutdated}` : '',
    currentRule ? `## Regra atual\n${currentRule}` : '',
    legalBasis ? `## Fundamento atual\n${legalBasis}` : '',
    literalWarning ? `## Alerta sobre o enunciado\n${literalWarning}` : '',
    alternativesAnalysis.length
      ? `## Alternativas\n${alternativesAnalysis.map((item) => `- ${item.letter}: ${item.analysis}`).join('\n')}`
      : '',
    '',
    'Comentario normativo auxiliar. Nao e gabarito oficial. Conferir manualmente antes de usar como atualizacao definitiva.'
  ].filter(Boolean).join('\n\n');

  return validateTeachingPayload({
    historical_answer: historical.answer || historicalRaw,
    current_answer: current.answer,
    current_answer_label: currentLabel,
    current_answer_confidence: current.answer && !manual ? (safety === 'high' ? 0.92 : 0.78) : 0,
    answer_changed: Boolean(current.answer && historical.answer && current.answer !== historical.answer),
    answer_policy: answerPolicy,
    adaptation_status: adaptationStatus,
    study_recommendation: studyRecommendation,
    safety_level: safety,
    adapted_statement: adapt ? cleanText(question.statement_text || question.statementText) : '',
    short_explanation: shortExplanation,
    teaching_comment_md: md,
    teaching_comment_html: markdownToSafeHtml(md),
    legal_basis: legalBasis,
    current_rule_summary: currentRule,
    why_outdated: whyOutdated,
    literal_statement_warning: literalWarning,
    alternatives_analysis: alternativesAnalysis
  }, {
    questionType,
    alternatives,
    historicalAnswer: historicalRaw
  }).data;
}

export function buildGenerationPrompt(record) {
  return {
    system: [
      'Voce e professor de Legislacao de Transito para concursos PRF.',
      'Transforme uma questao desatualizada em comentario didatico atualizado.',
      'Use somente enunciado, alternativas, comentario historico, analise normativa e fundamento informado.',
      'Nao invente artigo, resolucao ou fundamento nao fornecido.',
      'Se a analise normativa for insuficiente, use current_answer=null, answer_policy=manual_review e explique a pendencia.',
      'Nunca diga que e gabarito oficial. Use gabarito provavel pela regra atual.',
      'Responda somente JSON valido no schema solicitado.'
    ].join('\n'),
    user: JSON.stringify(record, null, 2)
  };
}

export function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Resposta vazia do gerador.');
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Resposta do gerador nao contem JSON.');
    return JSON.parse(raw.slice(start, end + 1));
  }
}

export function markdownToSafeHtml(markdown) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const chunks = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    chunks.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    chunks.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(3, heading[1].length);
      chunks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return chunks.join('\n');
}

export function safeJsonParse(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export function mapSafetyLevel(value) {
  const normalized = normalizePlain(value);
  if (normalized.includes('manual')) return 'manual';
  if (normalized.includes('baixo')) return 'low';
  if (normalized.includes('alto')) return 'high';
  if (normalized.includes('medio') || normalized.includes('media')) return 'medium';
  return 'manual';
}

export function answerLabel(answer) {
  if (!answer) return '';
  if (answer === 'CERTO' || answer === 'ERRADO') return answer;
  return `Alternativa ${answer}`;
}

export function normalizePlain(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeAnswerCandidate(value) {
  const normalized = normalizePlain(value).toUpperCase();
  if (normalized.includes('ERRADO') || normalized.includes('INCORRETO')) return 'ERRADO';
  if (normalized.includes('CERTO') || normalized.includes('CORRETO')) return 'CERTO';
  return extractAnswerLetter(value) || normalized;
}

function extractAnswerLetter(value) {
  const text = String(value || '').trim().toUpperCase();
  const direct = text.match(/^\s*([A-Z])(?:\b|\s|[-–—.):])/);
  if (direct) return direct[1];
  const word = text.match(/\b([A-E])\b/);
  return word ? word[1] : '';
}

function isNullishAnswer(value) {
  const normalized = normalizePlain(value);
  return normalized === 'null'
    || normalized.includes('revisao manual')
    || normalized.includes('nao aplicavel')
    || normalized.includes('descartar')
    || normalized.includes('sem seguranca');
}

function mapExplicitTrueFalseLetter(letter, alternatives) {
  if (!letter || !['A', 'B'].includes(letter)) return '';
  const map = new Map(alternatives.map((alternative) => [
    String(alternative.letter || '').trim().toUpperCase(),
    normalizePlain(alternative.text || alternative.html || '')
  ]));
  const first = map.get('A') || '';
  const second = map.get('B') || '';
  if (first === 'certo' && second === 'errado') {
    return letter === 'A' ? 'CERTO' : 'ERRADO';
  }
  return '';
}

function buildAlternativesAnalysis(alternatives, currentAnswer, questionType) {
  if (!alternatives.length) {
    return [];
  }
  const isTrueFalse = normalizePlain(questionType).includes('certo_errado');
  if (isTrueFalse) {
    return [{
      letter: currentAnswer || '',
      is_correct_current_rule: Boolean(currentAnswer),
      analysis: currentAnswer
        ? `Pela regra atual, o item ficaria ${currentAnswer}.`
        : 'A analise normativa nao permite definir com seguranca se o item fica CERTO ou ERRADO.'
    }];
  }
  return alternatives.map((alternative) => ({
    letter: String(alternative.letter || '').trim().toUpperCase(),
    is_correct_current_rule: Boolean(currentAnswer && String(alternative.letter || '').trim().toUpperCase() === currentAnswer),
    analysis: currentAnswer
      ? (String(alternative.letter || '').trim().toUpperCase() === currentAnswer
        ? 'Alternativa apontada como provavel correta pela regra atual, conforme a analise normativa cadastrada.'
        : 'Alternativa nao indicada como correta pela regra atual na analise normativa cadastrada.')
      : 'Sem gabarito atual seguro; exige revisao manual.'
  }));
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function validChoice(value, allowed, fallback) {
  const text = String(value || '').trim();
  return allowed.has(text) ? text : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cleanText(value) {
  return String(value || '').trim();
}
