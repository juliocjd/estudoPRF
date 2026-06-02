const PAGE_SIZE = 20;

const state = {
  page: 1,
  totalPages: 1,
  total: 0,
  rows: [],
  rowIndex: 0,
  selectedId: null,
  currentQuestion: null,
  answerResult: null,
  adaptiveTarget: null,
  eliminatedAnswers: new Set(),
  activeProfile: '',
  theoryUrl: '',
  resumeLast: true,
  sessionId: buildSessionId(),
  studyMode: 'study',
  supportOpen: false,
  supportTab: 'comment',
  lastSupportTrigger: null,
  questionStartedAt: Date.now(),
  timerId: null,
  sawComment: false,
  openedTheory: false,
  filters: {
    q: '',
    materia: '',
    assunto: '',
    commented: false,
    unanswered: false,
    lastWrong: false,
    hideOutdated: false,
    hideStudyExcluded: true,
    hideDuplicates: false,
    representative: false,
    normative: ''
  },
  subjects: [],
  subjectsVisible: false,
  coverageVisible: false,
  normativeVisible: false,
  teachingEditMode: false
};

const els = {
  stats: document.querySelector('#stats'),
  advancedFilterToggle: document.querySelector('#advancedFilterToggle'),
  advancedFilters: document.querySelector('#advancedFilters'),
  activeFiltersLabel: document.querySelector('#activeFiltersLabel'),
  clearFilters: document.querySelector('#clearFilters'),
  searchInput: document.querySelector('#searchInput'),
  matterSelect: document.querySelector('#matterSelect'),
  subjectSelect: document.querySelector('#subjectSelect'),
  profileSelect: document.querySelector('#profileSelect'),
  commentedOnly: document.querySelector('#commentedOnly'),
  unansweredOnly: document.querySelector('#unansweredOnly'),
  wrongOnly: document.querySelector('#wrongOnly'),
  hideOutdated: document.querySelector('#hideOutdated'),
  hideStudyExcluded: document.querySelector('#hideStudyExcluded'),
  hideDuplicates: document.querySelector('#hideDuplicates'),
  representativeOnly: document.querySelector('#representativeOnly'),
  normativeFilter: document.querySelector('#normativeFilter'),
  resumeLast: document.querySelector('#resumeLast'),
  prevPage: document.querySelector('#prevPage'),
  nextPage: document.querySelector('#nextPage'),
  studyPlanLabel: document.querySelector('#studyPlanLabel'),
  studyNow: document.querySelector('#studyNow'),
  viewAllQuestions: document.querySelector('#viewAllQuestions'),
  nextSubject: document.querySelector('#nextSubject'),
  nextUnanswered: document.querySelector('#nextUnanswered'),
  smartQueue: document.querySelector('#smartQueue'),
  repairQueue: document.querySelector('#repairQueue'),
  dueReviews: document.querySelector('#dueReviews'),
  modeMenuButton: document.querySelector('#modeMenuButton'),
  reportsMenuButton: document.querySelector('#reportsMenuButton'),
  supportMenuButton: document.querySelector('#supportMenuButton'),
  toggleCoverage: document.querySelector('#toggleCoverage'),
  toggleSubjects: document.querySelector('#toggleSubjects'),
  toggleNormative: document.querySelector('#toggleNormative'),
  pageLabel: document.querySelector('#pageLabel'),
  questionMeta: document.querySelector('#questionMeta'),
  questionQuickStatus: document.querySelector('#questionQuickStatus'),
  questionBadges: document.querySelector('#questionBadges'),
  questionTitle: document.querySelector('#questionTitle'),
  normativeAlert: document.querySelector('#normativeAlert'),
  openTeaching: document.querySelector('#openTeaching'),
  openTheory: document.querySelector('#openTheory'),
  openHistory: document.querySelector('#openHistory'),
  toggleNormativeSupport: document.querySelector('#toggleNormativeSupport'),
  statement: document.querySelector('#statement'),
  answerForm: document.querySelector('#answerForm'),
  answerHint: document.querySelector('#answerHint'),
  alternatives: document.querySelector('#alternatives'),
  answerStatus: document.querySelector('#answerStatus'),
  answerDetails: document.querySelector('#answerDetails'),
  answerResult: document.querySelector('#answerResult'),
  timerLabel: document.querySelector('#timerLabel'),
  masteryScore: document.querySelector('#masteryScore'),
  masteryLabel: document.querySelector('#masteryLabel'),
  nextDue: document.querySelector('#nextDue'),
  confidenceSelect: document.querySelector('#confidenceSelect'),
  confidenceOptions: document.querySelector('#confidenceOptions'),
  errorTypeWrapper: document.querySelector('#errorTypeWrapper'),
  errorTypeSelect: document.querySelector('#errorTypeSelect'),
  submitAnswer: document.querySelector('#submitAnswer'),
  secondaryExplain: document.querySelector('#secondaryExplain'),
  similarQuestions: document.querySelector('#similarQuestions'),
  toggleComment: document.querySelector('#toggleComment'),
  showSimilar: document.querySelector('#showSimilar'),
  supportOverlay: document.querySelector('#supportOverlay'),
  supportDrawer: document.querySelector('#supportDrawer'),
  supportTitle: document.querySelector('#supportTitle'),
  supportSubtitle: document.querySelector('#supportSubtitle'),
  closeSupport: document.querySelector('#closeSupport'),
  supportTabs: document.querySelectorAll('[data-support-tab]'),
  supportTheoryPanel: document.querySelector('#supportTheoryPanel'),
  supportNormativePanel: document.querySelector('#supportNormativePanel'),
  supportHistoryPanel: document.querySelector('#supportHistoryPanel'),
  supportSimilarPanel: document.querySelector('#supportSimilarPanel'),
  normativeSupportInfo: document.querySelector('#normativeSupportInfo'),
  supportNormativeBody: document.querySelector('#supportNormativeBody'),
  theoryInfo: document.querySelector('#theoryInfo'),
  supportTheoryBody: document.querySelector('#supportTheoryBody'),
  historyInfo: document.querySelector('#historyInfo'),
  supportHistoryBody: document.querySelector('#supportHistoryBody'),
  similarInfo: document.querySelector('#similarInfo'),
  supportSimilarBody: document.querySelector('#supportSimilarBody'),
  commentPanel: document.querySelector('#commentPanel'),
  commentInfo: document.querySelector('#commentInfo'),
  commentBody: document.querySelector('#commentBody'),
  subjectsPanel: document.querySelector('#subjectsPanel'),
  subjectsInfo: document.querySelector('#subjectsInfo'),
  subjectsList: document.querySelector('#subjectsList'),
  coveragePanel: document.querySelector('#coveragePanel'),
  coverageInfo: document.querySelector('#coverageInfo'),
  coverageAlerts: document.querySelector('#coverageAlerts'),
  coverageTable: document.querySelector('#coverageTable'),
  normativePanel: document.querySelector('#normativePanel'),
  normativeInfo: document.querySelector('#normativeInfo'),
  normativeStats: document.querySelector('#normativeStats'),
  normativeRecommendationFilter: document.querySelector('#normativeRecommendationFilter'),
  normativeSecurityFilter: document.querySelector('#normativeSecurityFilter'),
  normativeChangedFilter: document.querySelector('#normativeChangedFilter'),
  normativeReviewStatusFilter: document.querySelector('#normativeReviewStatusFilter'),
  normativeTeachingStatusFilter: document.querySelector('#normativeTeachingStatusFilter'),
  normativeTable: document.querySelector('#normativeTable'),
  supportTabTeaching: document.querySelector('#supportTabTeaching'),
  supportTeachingPanel: document.querySelector('#supportTeachingPanel'),
  teachingInfo: document.querySelector('#teachingInfo'),
  supportTeachingBody: document.querySelector('#supportTeachingBody'),
  studyStatusControl: document.querySelector('#studyStatusControl'),
  studyStatusText: document.querySelector('#studyStatusText'),
  studyStatusReason: document.querySelector('#studyStatusReason'),
  excludeFromStudy: document.querySelector('#excludeFromStudy'),
  reviewLater: document.querySelector('#reviewLater'),
  restoreToStudy: document.querySelector('#restoreToStudy')
};

let searchTimer = null;

boot();

async function boot() {
  const [studyState] = await Promise.all([loadStudyState(), loadStats(), loadFilters(), loadExamProfiles()]);
  bindEvents();
  const initialTargetId = getInitialTargetId();
  if (initialTargetId) {
    setStudyMode('all');
    await openQuestionDirect(initialTargetId, { replaceUrl: true });
    return;
  }
  if (studyState.resumeLast) {
    await loadResumeTarget();
  } else {
    await loadQuestions();
  }
}

function bindEvents() {
  bindDropdowns();
  updateAdvancedFiltersSummary();

  els.advancedFilterToggle.addEventListener('click', () => {
    const willOpen = els.advancedFilters.hidden;
    els.advancedFilters.hidden = !willOpen;
    els.advancedFilterToggle.setAttribute('aria-expanded', String(willOpen));
  });

  els.clearFilters.addEventListener('click', async () => {
    clearFilters();
    await loadQuestions();
    if (state.subjectsVisible) await loadSubjectsRanking();
    if (state.coverageVisible) await loadExamCoverage();
    if (state.normativeVisible) await loadNormativeReview();
  });

  els.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.q = els.searchInput.value.trim();
      state.page = 1;
      updateAdvancedFiltersSummary();
      loadQuestions();
      if (state.normativeVisible) loadNormativeReview();
    }, 250);
  });

  els.matterSelect.addEventListener('change', () => {
    state.filters.materia = els.matterSelect.value;
    state.filters.assunto = '';
    state.page = 1;
    renderSubjectOptions();
    updateAdvancedFiltersSummary();
    loadQuestions();
    if (state.normativeVisible) loadNormativeReview();
  });

  els.subjectSelect.addEventListener('change', () => {
    state.filters.assunto = els.subjectSelect.value;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
    if (state.normativeVisible) loadNormativeReview();
  });

  els.profileSelect.addEventListener('change', async () => {
    state.activeProfile = els.profileSelect.value;
    await api('/api/exam-profiles/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: state.activeProfile })
    });
    if (state.subjectsVisible) await loadSubjectsRanking();
    if (state.coverageVisible) await loadExamCoverage();
  });

  els.commentedOnly.addEventListener('change', () => {
    state.filters.commented = els.commentedOnly.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
    if (state.normativeVisible) loadNormativeReview();
  });

  els.unansweredOnly.addEventListener('change', () => {
    state.filters.unanswered = els.unansweredOnly.checked;
    if (state.filters.unanswered) {
      state.filters.lastWrong = false;
      els.wrongOnly.checked = false;
    }
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.wrongOnly.addEventListener('change', () => {
    state.filters.lastWrong = els.wrongOnly.checked;
    if (state.filters.lastWrong) {
      state.filters.unanswered = false;
      els.unansweredOnly.checked = false;
    }
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.hideOutdated.addEventListener('change', () => {
    state.filters.hideOutdated = els.hideOutdated.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
    if (state.subjectsVisible) {
      loadSubjectsRanking();
    }
  });

  els.hideStudyExcluded.addEventListener('change', () => {
    state.filters.hideStudyExcluded = els.hideStudyExcluded.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.hideDuplicates.addEventListener('change', () => {
    state.filters.hideDuplicates = els.hideDuplicates.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.representativeOnly.addEventListener('change', () => {
    state.filters.representative = els.representativeOnly.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.normativeFilter.addEventListener('change', () => {
    state.filters.normative = els.normativeFilter.value;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.resumeLast.addEventListener('change', async () => {
    state.resumeLast = els.resumeLast.checked;
    await saveStudyState({ resumeLast: state.resumeLast });
  });

  els.prevPage.addEventListener('click', () => goPrevious());
  els.nextPage.addEventListener('click', () => goNext());
  els.studyNow.addEventListener('click', () => {
    setStudyMode('adaptive');
    loadAdaptiveTarget('prf_otimizado');
  });
  els.viewAllQuestions.addEventListener('click', () => {
    setStudyMode('all');
    state.filters.hideDuplicates = false;
    state.filters.representative = false;
    state.filters.hideStudyExcluded = false;
    state.page = 1;
    els.hideDuplicates.checked = false;
    els.representativeOnly.checked = false;
    els.hideStudyExcluded.checked = false;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });
  els.nextSubject.addEventListener('click', () => {
    closeAllDropdowns();
    setStudyMode('subject');
    navigateSpecial('subject');
  });
  els.nextUnanswered.addEventListener('click', () => {
    closeAllDropdowns();
    setStudyMode('unanswered');
    navigateSpecial('unanswered');
  });
  els.smartQueue.addEventListener('click', () => {
    closeAllDropdowns();
    setStudyMode('adaptive');
    loadAdaptiveTarget('prf_otimizado');
  });
  els.repairQueue.addEventListener('click', () => {
    closeAllDropdowns();
    setStudyMode('repair');
    loadRepairQueueTarget();
  });
  els.dueReviews.addEventListener('click', () => {
    closeAllDropdowns();
    setStudyMode('review');
    loadAdaptiveTarget('revisar_hoje');
  });
  els.toggleCoverage.addEventListener('click', async () => {
    closeAllDropdowns();
    state.coverageVisible = !state.coverageVisible;
    renderCoverageVisibility();
    if (state.coverageVisible) {
      await loadExamCoverage();
    }
  });
  els.toggleSubjects.addEventListener('click', async () => {
    closeAllDropdowns();
    state.subjectsVisible = !state.subjectsVisible;
    renderSubjectsVisibility();
    if (state.subjectsVisible) {
      await loadSubjectsRanking();
    }
  });
  els.toggleNormative.addEventListener('click', async () => {
    closeAllDropdowns();
    state.normativeVisible = !state.normativeVisible;
    renderNormativeVisibility();
    if (state.normativeVisible) {
      await loadNormativeReview();
    }
  });

  els.subjectsList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-materia][data-assunto]');
    if (!button) {
      return;
    }

    state.filters.q = '';
    state.filters.materia = button.dataset.materia || '';
    state.filters.assunto = button.dataset.assunto || '';
    state.page = 1;
    els.searchInput.value = '';
    els.matterSelect.value = state.filters.materia;
    renderSubjectOptions();
    els.subjectSelect.value = state.filters.assunto;
    updateAdvancedFiltersSummary();
    await loadQuestions();
  });

  els.answerStatus.addEventListener('click', () => {
    if (!els.answerStatus.disabled) {
      els.answerDetails.hidden = !els.answerDetails.hidden;
    }
  });

  els.answerResult.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="show-comment"]');
    if (button) {
      showCommentPanel();
    }
  });

  els.toggleComment.addEventListener('click', () => {
    closeAllDropdowns();
    openSupportPanel('comment');
  });

  els.showSimilar.addEventListener('click', () => {
    closeAllDropdowns();
    showSimilarPanel();
  });

  els.openTeaching.addEventListener('click', () => {
    closeAllDropdowns();
    showTeachingPanel();
  });

  els.openTheory.addEventListener('click', () => {
    closeAllDropdowns();
    showTheoryPanel();
  });

  els.openHistory.addEventListener('click', () => {
    closeAllDropdowns();
    openSupportPanel('history');
  });
  els.toggleNormativeSupport.addEventListener('click', () => {
    closeAllDropdowns();
    showNormativePanel();
  });

  els.normativeAlert.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="show-teaching"]')) {
      openSupportPanel('teaching');
      return;
    }
    if (event.target.closest('[data-action="show-normative"]')) {
      showNormativePanel();
    }
  });

  [
    els.normativeRecommendationFilter,
    els.normativeSecurityFilter,
    els.normativeChangedFilter,
    els.normativeReviewStatusFilter,
    els.normativeTeachingStatusFilter
  ].forEach((control) => {
    control.addEventListener('change', () => loadNormativeReview());
  });

  els.normativeTable.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-question-id]');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const questionId = Number(trigger.dataset.questionId || 0);
    if (!questionId) return;
    state.normativeVisible = false;
    renderNormativeVisibility();
    await openQuestionDirect(questionId, { fallbackHref: trigger.href });
    if (state.selectedId === questionId) {
      openSupportPanel('normative');
    }
  });

  els.supportSimilarBody.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-question-id]');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const questionId = Number(trigger.dataset.questionId || 0);
    if (!questionId) return;
    await openQuestionDirect(questionId, { fallbackHref: trigger.href });
  });

  els.supportTeachingBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action || '';
    if (!action.startsWith('teaching-')) return;
    event.preventDefault();

    if (action === 'teaching-edit') {
      state.teachingEditMode = true;
      renderNormativeTeachingPanel(state.currentQuestion);
      return;
    }
    if (action === 'teaching-cancel-edit') {
      state.teachingEditMode = false;
      renderNormativeTeachingPanel(state.currentQuestion);
      return;
    }
    if (action === 'teaching-save-edit') {
      await saveNormativeTeachingEdit();
      return;
    }
    if (action === 'teaching-reset-edit') {
      await resetNormativeTeachingEdit();
    }
  });

  els.closeSupport.addEventListener('click', () => closeSupportPanel());
  els.supportOverlay.addEventListener('click', () => closeSupportPanel());
  els.supportTabs.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.supportTab || 'comment';
      openSupportPanel(tab, { keepFocus: true });
      if (tab === 'similar') loadSimilarQuestions();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.supportOpen) {
      closeSupportPanel();
    }
  });

  els.confidenceOptions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-confidence]');
    if (!button) return;
    els.confidenceSelect.value = button.dataset.confidence || 'sure';
    renderConfidenceOptions();
  });

  els.secondaryExplain.addEventListener('click', () => {
    runAnswerAction(els.secondaryExplain.dataset.action || 'explain');
  });

  els.similarQuestions.addEventListener('click', () => showSimilarPanel());

  els.excludeFromStudy.addEventListener('click', () => updateQuestionStudyStatus('excluded'));
  els.reviewLater.addEventListener('click', () => updateQuestionStudyStatus('review_later'));
  els.restoreToStudy.addEventListener('click', () => updateQuestionStudyStatus('active'));

  els.answerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const action = els.submitAnswer.dataset.action || 'respond';
    if (action !== 'respond') {
      await runAnswerAction(action);
      return;
    }

    const selected = new FormData(els.answerForm).get('answer');
    if (!state.selectedId || !selected) {
      return;
    }

    els.submitAnswer.disabled = true;
    try {
      const result = await api(`/api/questions/${state.selectedId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: selected,
          confidence: els.confidenceSelect.value,
          errorType: els.errorTypeSelect.value,
          elapsedMs: Date.now() - state.questionStartedAt,
          studyMode: state.studyMode,
          sessionId: state.sessionId,
          sawComment: state.sawComment,
          openedTheory: state.openedTheory
        })
      });
      renderAnswerResult(result);
      loadStats().catch(() => {});
    } catch (error) {
      showAnswerSubmitError(error);
    }
  });

  els.alternatives.addEventListener('click', (event) => {
    const label = event.target.closest('.alternative');
    if (!label) {
      return;
    }

    event.preventDefault();
    cycleAlternative(label);
  });

  els.answerForm.addEventListener('change', (event) => {
    if (event.target?.name === 'answer') {
      renderSelectedAlternative();
      updateAnswerActions();
    }
  });
}

function bindDropdowns() {
  document.querySelectorAll('[data-dropdown]').forEach((dropdown) => {
    const trigger = dropdown.querySelector('button[aria-expanded]');
    const menu = dropdown.querySelector('.dropdown-menu');
    if (!trigger || !menu) return;

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = menu.hidden;
      closeAllDropdowns();
      menu.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-dropdown]')) {
      closeAllDropdowns();
    }
  });
}

function closeAllDropdowns() {
  document.querySelectorAll('[data-dropdown]').forEach((dropdown) => {
    const trigger = dropdown.querySelector('button[aria-expanded]');
    const menu = dropdown.querySelector('.dropdown-menu');
    if (!trigger || !menu) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });
}

function clearFilters() {
  state.filters = {
    q: '',
    materia: '',
    assunto: '',
    commented: false,
    unanswered: false,
    lastWrong: false,
    hideOutdated: false,
    hideStudyExcluded: state.studyMode !== 'all',
    hideDuplicates: false,
    representative: false,
    normative: ''
  };
  state.page = 1;
  els.searchInput.value = '';
  els.matterSelect.value = '';
  renderSubjectOptions();
  els.subjectSelect.value = '';
  els.commentedOnly.checked = false;
  els.unansweredOnly.checked = false;
  els.wrongOnly.checked = false;
  els.hideOutdated.checked = false;
  els.hideStudyExcluded.checked = state.filters.hideStudyExcluded;
  els.hideDuplicates.checked = false;
  els.representativeOnly.checked = false;
  els.normativeFilter.value = '';
  updateAdvancedFiltersSummary();
}

function updateAdvancedFiltersSummary() {
  const active = [
    state.filters.q,
    state.filters.materia,
    state.filters.assunto,
    state.filters.commented,
    state.filters.unanswered,
    state.filters.lastWrong,
    state.filters.hideOutdated,
    state.filters.hideStudyExcluded,
    state.filters.hideDuplicates,
    state.filters.representative,
    state.filters.normative
  ].filter(Boolean).length;

  els.activeFiltersLabel.textContent = `(${active} ativo${active === 1 ? '' : 's'})`;
}

function setStudyMode(mode) {
  state.studyMode = mode;
  state.filters.hideStudyExcluded = mode !== 'all';
  if (els.hideStudyExcluded) {
    els.hideStudyExcluded.checked = state.filters.hideStudyExcluded;
  }
  const labels = {
    study: 'Modo: Estudo livre',
    smart: 'Modo: Estudar agora',
    adaptive: 'Plano: PRF Otimizado',
    all: 'Modo: Ver todas',
    review: 'Modo: Revisar hoje',
    repair: 'Modo: Corrigir erros',
    unanswered: 'Modo: Não resolvidas',
    subject: 'Modo: Trocar assunto'
  };
  els.modeMenuButton.textContent = labels[mode] || labels.study;
  updateAdvancedFiltersSummary();
}

async function runAnswerAction(action) {
  if (action === 'next') {
    await goNext();
    return;
  }
  if (action === 'history') {
    openSupportPanel('history');
    return;
  }
  if (action === 'theory') {
    showTheoryPanel();
    return;
  }
  showCommentPanel();
}

async function loadResumeTarget() {
  const params = buildQuestionParams();
  params.set('plan', 'prf_otimizado');
  if (state.activeProfile) params.set('profile', state.activeProfile);
  setStudyMode('adaptive');
  const target = await api(`/api/study-resume-target?${params}`);
  if (!target?.questionId) {
    await loadQuestions();
    return;
  }
  state.adaptiveTarget = target;
  state.page = 1;
  await loadQuestions({ targetId: target.questionId, adaptiveTarget: target });
}

function renderConfidenceOptions() {
  els.confidenceOptions.querySelectorAll('[data-confidence]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.confidence === els.confidenceSelect.value);
  });
}

async function loadStudyState() {
  const studyState = await api('/api/study-state');
  state.resumeLast = studyState.resumeLast;
  els.resumeLast.checked = studyState.resumeLast;
  return studyState;
}

function getInitialTargetId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get('targetId') || params.get('questionId') || params.get('q_id') || 0) || null;
}

function questionLink(questionId) {
  const resolvedId = resolveQuestionId(questionId);
  const url = new URL(window.location.href);
  if (resolvedId) {
    url.searchParams.set('targetId', String(resolvedId));
  } else {
    url.searchParams.delete('targetId');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function resolveQuestionId(value) {
  if (value && typeof value === 'object') {
    return Number(value.questionId || value.question_id || value.questionid || value.id || value.idQuestion || value.id_question || 0) || 0;
  }
  return Number(value || 0) || 0;
}

function updateQuestionUrl(questionId, options = {}) {
  if (!window.history?.pushState) return;
  const url = new URL(window.location.href);
  url.searchParams.set('targetId', String(questionId));
  const method = options.replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', `${url.pathname}${url.search}${url.hash}`);
}

async function saveStudyState(payload) {
  return api('/api/study-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function loadStats() {
  const stats = await api('/api/stats');
  els.stats.innerHTML = [
    statMarkup(stats.questions, 'questões'),
    statMarkup(stats.comments, 'comentários do professor'),
    statMarkup(stats.aiLocalComments ?? stats.aiComments, 'comentários IA locais'),
    statMarkup(stats.normativeUpdates, 'análises normativas'),
    statMarkup(stats.normativeTeachingComments, 'comentários atualizados'),
    statMarkup(stats.normativeTeachingPending, 'revisão normativa'),
    statMarkup(stats.normativeTeachingDiscard, 'descartar'),
    statMarkup(stats.outOfStudyQuestions, 'fora do estudo'),
    statMarkup(stats.dueReviews, 'revisões')
  ].join('');
}

async function loadFilters() {
  const filters = await api('/api/filters');
  state.subjects = filters.subjects || [];

  els.matterSelect.innerHTML = '<option value="">Todas</option>' + (filters.matters || [])
    .map((matter) => `<option value="${escapeAttr(matter.name)}">${escapeHtml(matter.name)} (${matter.count})</option>`)
    .join('');

  renderSubjectOptions();
}

async function loadExamProfiles() {
  const data = await api('/api/exam-profiles');
  state.activeProfile = data.active || '';
  els.profileSelect.innerHTML = (data.profiles || [])
    .map((profile) => `<option value="${escapeAttr(profile.id)}">${escapeHtml(profile.name)}</option>`)
    .join('');
  els.profileSelect.value = state.activeProfile;
}

function renderSubjectOptions() {
  const filtered = state.filters.materia
    ? state.subjects.filter((subject) => subject.materia === state.filters.materia)
    : state.subjects;

  els.subjectSelect.innerHTML = '<option value="">Todos</option>' + filtered
    .map((subject) => `<option value="${escapeAttr(subject.name)}">${escapeHtml(subject.name)} (${subject.count})</option>`)
    .join('');
  els.subjectSelect.value = state.filters.assunto;
}

function startTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
  }
  renderTimer();
  state.timerId = setInterval(renderTimer, 1000);
}

function renderTimer() {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.questionStartedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  els.timerLabel.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderMastery(mastery) {
  const score = Math.round(Number(mastery?.score || 0) * 100);
  els.masteryScore.textContent = `${score}%`;
  els.masteryLabel.textContent = masteryLabel(score);
  els.nextDue.textContent = mastery?.nextDueAt ? formatDate(mastery.nextDueAt) : 'sem data';
}

async function loadQuestions(options = {}) {
  const params = buildQuestionParams();
  if (options.targetId) {
    params.set('targetId', String(options.targetId));
  }

  const data = await api(`/api/questions?${params}`);
  state.page = data.page;
  state.totalPages = data.totalPages;
  state.total = data.total;
  state.rows = data.rows || [];

  if (data.targetIndex >= 0) {
    state.rowIndex = data.targetIndex;
  } else {
    state.rowIndex = options.selectLast ? Math.max(0, state.rows.length - 1) : 0;
  }

  if (!state.rows.length) {
    renderEmptyQuestion();
    return;
  }

  await selectQuestion(state.rows[state.rowIndex].id, { adaptiveTarget: options.adaptiveTarget });
  renderPager();
}

function buildQuestionParams() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(PAGE_SIZE)
  });
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.filters.materia) params.set('materia', state.filters.materia);
  if (state.filters.assunto) params.set('assunto', state.filters.assunto);
  if (state.filters.commented) params.set('commented', '1');
  if (state.filters.unanswered) params.set('unanswered', '1');
  if (state.filters.lastWrong) params.set('lastWrong', '1');
  if (state.filters.hideOutdated) params.set('hideOutdated', '1');
  if (state.filters.hideStudyExcluded) params.set('hideStudyExcluded', '1');
  if (state.filters.hideDuplicates) params.set('hideDuplicates', '1');
  if (state.filters.representative) params.set('representative', '1');
  if (state.filters.normative) params.set('normative', state.filters.normative);
  return params;
}

function renderEmptyQuestion() {
  state.selectedId = null;
  state.currentQuestion = null;
  state.answerResult = null;
  state.eliminatedAnswers = new Set();
  state.theoryUrl = '';
  state.supportOpen = false;
  state.supportTab = 'comment';
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  els.timerLabel.textContent = '00:00';
  els.masteryScore.textContent = '0%';
  els.masteryLabel.textContent = 'Novo';
  els.nextDue.textContent = 'sem data';
  els.questionTitle.textContent = 'Questão';
  els.questionMeta.textContent = 'Nenhuma questão encontrada';
  els.questionQuickStatus.textContent = 'Sem resultado para os filtros atuais';
  renderQuestionBadges(null);
  els.normativeAlert.hidden = true;
  els.normativeAlert.innerHTML = '';
  els.statement.innerHTML = '<p class="empty">Nenhuma questão encontrada para os filtros atuais. Tente limpar os filtros ou mudar de assunto.</p>';
  els.alternatives.innerHTML = '';
  els.answerStatus.textContent = '';
  els.answerStatus.disabled = true;
  els.answerDetails.hidden = true;
  els.answerDetails.innerHTML = '';
  els.answerResult.hidden = true;
  els.answerResult.innerHTML = '';
  els.answerHint.textContent = 'Sem questão selecionada';
  els.errorTypeWrapper.hidden = true;
  els.teachingInfo.textContent = '';
  els.supportTeachingBody.innerHTML = '<p class="empty">Nenhum comentário atualizado carregado.</p>';
  if (els.supportTabTeaching) els.supportTabTeaching.disabled = true;
  els.commentInfo.textContent = '';
  els.commentBody.innerHTML = '<p class="empty">Nenhuma explicação carregada.</p>';
  els.supportTheoryBody.innerHTML = '<p class="empty">Nenhuma teoria carregada.</p>';
  els.supportHistoryBody.innerHTML = '<p class="empty">Nenhum histórico carregado.</p>';
  els.similarInfo.textContent = '';
  els.supportSimilarBody.innerHTML = '<p class="empty">Nenhuma família carregada.</p>';
  renderStudyStatusControl(null);
  els.submitAnswer.disabled = true;
  els.submitAnswer.textContent = 'Responder';
  els.submitAnswer.dataset.action = 'respond';
  els.secondaryExplain.disabled = true;
  els.similarQuestions.disabled = true;
  els.showSimilar.disabled = true;
  els.openTeaching.disabled = true;
  els.openTheory.disabled = true;
  els.toggleComment.disabled = true;
  els.toggleNormativeSupport.disabled = true;
  renderSupportVisibility();
  renderPager();
}

async function goPrevious() {
  if (state.rowIndex > 0) {
    state.rowIndex -= 1;
    await selectQuestion(state.rows[state.rowIndex].id);
    renderPager();
    return;
  }

  if (state.page > 1) {
    state.page -= 1;
    await loadQuestions({ selectLast: true });
  }
}

async function goNext() {
  if (state.studyMode === 'adaptive' || state.studyMode === 'smart') {
    await loadAdaptiveTarget('prf_otimizado');
    return;
  }

  if (state.studyMode === 'review') {
    await loadAdaptiveTarget('revisar_hoje');
    return;
  }

  if (state.studyMode === 'repair') {
    await loadRepairQueueTarget();
    return;
  }

  if (state.rowIndex < state.rows.length - 1) {
    state.rowIndex += 1;
    await selectQuestion(state.rows[state.rowIndex].id);
    renderPager();
    return;
  }

  if (state.page < state.totalPages) {
    state.page += 1;
    await loadQuestions();
  }
}

async function navigateSpecial(mode) {
  if (!state.selectedId) {
    return;
  }

  const params = buildQuestionParams();
  params.set('mode', mode);
  params.set('currentId', String(state.selectedId));
  const target = await api(`/api/navigate?${params}`);
  if (!target.id) {
    els.answerStatus.textContent = target.reason || 'Nada encontrado';
    return;
  }

  if (target.mode === 'subject') {
    state.filters.q = '';
    state.filters.materia = target.materia || '';
    state.filters.assunto = target.assunto || '';
    els.searchInput.value = '';
    els.matterSelect.value = state.filters.materia;
    renderSubjectOptions();
    els.subjectSelect.value = state.filters.assunto;
    state.page = 1;
    updateAdvancedFiltersSummary();
  }

  if (target.mode === 'unanswered') {
    state.filters.q = '';
    state.filters.unanswered = true;
    state.filters.lastWrong = false;
    els.searchInput.value = '';
    els.unansweredOnly.checked = true;
    els.wrongOnly.checked = false;
    state.page = 1;
    updateAdvancedFiltersSummary();
  }

  if (target.mode === 'smart') {
    state.page = 1;
  }

  if (target.mode === 'due') {
    state.page = 1;
  }

  await loadQuestions({ targetId: target.id });
}

async function loadRepairQueueTarget() {
  setStudyMode('repair');
  const params = buildQuestionParams();
  params.set('limit', '1');
  const data = await api(`/api/repair-queue?${params}`);
  const target = data.rows?.[0];
  if (!target?.id) {
    els.answerStatus.textContent = 'Nada em reparo';
    return;
  }
  state.page = 1;
  await loadQuestions({ targetId: target.id });
}

async function loadSmartQueueV2Target() {
  return loadAdaptiveTarget('prf_otimizado');
}

async function loadAdaptiveTarget(plan = 'prf_otimizado') {
  const params = buildQuestionParams();
  params.set('plan', plan);
  if (state.activeProfile) params.set('profile', state.activeProfile);
  const target = await api(`/api/adaptive-study/next?${params}`);
  if (!target?.questionId) {
    els.answerStatus.textContent = target.error || 'Nada encontrado';
    return;
  }
  state.adaptiveTarget = target;
  state.page = 1;
  await loadQuestions({ targetId: target.questionId, adaptiveTarget: target });
}

async function recordQuestionEvent(eventType, eventValue = '') {
  if (!state.selectedId) {
    return;
  }
  await api(`/api/questions/${state.selectedId}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType, eventValue })
  }).catch(() => {});
}

async function loadSubjectsRanking() {
  els.subjectsInfo.textContent = 'carregando';
  els.subjectsList.innerHTML = '<p class="empty">Carregando assuntos...</p>';

  const params = new URLSearchParams({ limit: '80' });
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.filters.materia) params.set('materia', state.filters.materia);
  if (state.filters.hideOutdated) params.set('hideOutdated', '1');
  if (state.filters.hideStudyExcluded) params.set('hideStudyExcluded', '1');

  const [data, coverage] = await Promise.all([
    api(`/api/subjects-ranking?${params}`),
    api(`/api/exam-coverage?profile=${encodeURIComponent(state.activeProfile || '')}`)
  ]);
  const rows = data.rows || [];
  els.subjectsInfo.textContent = `${rows.length} assunto${rows.length === 1 ? '' : 's'}`;
  const strategic = [...(coverage.rows || [])].sort((left, right) => Number(right.strategic_priority || 0) - Number(left.strategic_priority || 0));
  els.subjectsList.innerHTML = `
    <div class="ranking-block">
      <h2>Mais presentes na minha base</h2>
      ${rows.length ? rows.map((row, index) => subjectRowMarkup(row, index)).join('') : '<p class="empty">Nenhum assunto encontrado para os filtros atuais.</p>'}
    </div>
    <div class="ranking-block">
      <h2>Mais importantes para a prova</h2>
      ${strategic.map((row, index) => strategicRowMarkup(row, index)).join('')}
    </div>
  `;
}

async function loadExamCoverage() {
  els.coverageInfo.textContent = 'carregando';
  els.coverageTable.innerHTML = '<p class="empty">Carregando cobertura...</p>';
  els.coverageAlerts.innerHTML = '';
  const data = await api(`/api/exam-coverage?profile=${encodeURIComponent(state.activeProfile || '')}`);
  const rows = data.rows || [];
  els.coverageInfo.textContent = data.profile?.name || state.activeProfile || '';
  els.coverageAlerts.innerHTML = (data.alerts || []).slice(0, 4)
    .map((alert) => `<p>${escapeHtml(alert)}</p>`)
    .join('');
  els.coverageTable.innerHTML = rows.length
    ? rows.map((row) => coverageRowMarkup(row)).join('')
    : '<p class="empty">Nenhum mapeamento encontrado para este perfil.</p>';
}

async function loadNormativeReview() {
  els.normativeInfo.textContent = 'carregando';
  els.normativeTable.innerHTML = '<p class="empty">Carregando revisão normativa...</p>';
  const [stats, list] = await Promise.all([
    api('/api/normative-updates/stats'),
    api(`/api/normative-updates?${buildNormativeReviewParams()}`)
  ]);

  if (!stats.exists) {
    els.normativeInfo.textContent = 'sem dados importados';
    els.normativeStats.innerHTML = '<p class="empty">Nenhuma análise normativa importada ainda.</p>';
    els.normativeTable.innerHTML = '';
    return;
  }

  els.normativeInfo.textContent = `${Number(list.total || 0).toLocaleString('pt-BR')} item(ns) filtrado(s)`;
  populateNormativeSelect(els.normativeRecommendationFilter, stats.byRecommendation, 'Todas');
  populateNormativeSelect(els.normativeSecurityFilter, stats.bySecurity, 'Todos');
  populateNormativeSelect(els.normativeChangedFilter, stats.byChangedAnswer, 'Todas');
  els.normativeStats.innerHTML = [
    statMarkup(stats.total, 'importadas'),
    statMarkup(stats.adaptable, 'adaptáveis'),
    statMarkup(stats.manualReview, 'revisão manual'),
    statMarkup(stats.discardable, 'descartáveis'),
    statMarkup(stats.changedAnswer, 'gabarito alterado'),
    statMarkup(stats.teachingComments, 'comentários atualizados'),
    statMarkup(stats.teachingMissing, 'sem comentário atualizado'),
    statMarkup(stats.reviewed, 'revisadas')
  ].join('');
  els.normativeTable.innerHTML = list.rows?.length
    ? list.rows.map((row) => normativeRowMarkup(row)).join('')
    : '<p class="empty">Nenhuma análise normativa encontrada para os filtros.</p>';
}

function buildNormativeReviewParams() {
  const params = new URLSearchParams({ limit: '120' });
  if (els.normativeRecommendationFilter.value) params.set('recomendacao', els.normativeRecommendationFilter.value);
  if (els.normativeSecurityFilter.value) params.set('nivelSeguranca', els.normativeSecurityFilter.value);
  if (els.normativeChangedFilter.value) params.set('mudancaGabarito', els.normativeChangedFilter.value);
  if (els.normativeReviewStatusFilter.value) params.set('reviewStatus', els.normativeReviewStatusFilter.value);
  if (els.normativeTeachingStatusFilter.value) params.set('teachingStatus', els.normativeTeachingStatusFilter.value);
  if (state.filters.materia) params.set('materia', state.filters.materia);
  if (state.filters.assunto) params.set('assunto', state.filters.assunto);
  if (state.filters.q) params.set('q', state.filters.q);
  return params;
}

function populateNormativeSelect(select, rows, emptyLabel) {
  const selected = select.value;
  select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>` + (rows || [])
    .map((row) => `<option value="${escapeAttr(row.value)}">${escapeHtml(row.value)} (${Number(row.total || 0).toLocaleString('pt-BR')})</option>`)
    .join('');
  select.value = [...select.options].some((option) => option.value === selected) ? selected : '';
}

async function selectQuestion(questionId, options = {}) {
  state.selectedId = questionId;
  state.answerResult = options.answerResult || null;
  state.adaptiveTarget = options.adaptiveTarget || null;
  state.eliminatedAnswers = new Set();
  state.supportOpen = false;
  state.supportTab = 'comment';
  state.sawComment = false;
  state.openedTheory = false;
  state.questionStartedAt = Date.now();
  startTimer();

  const question = await api(`/api/questions/${questionId}`);
  if (question.error) {
    state.theoryUrl = '';
    els.openTheory.disabled = true;
    els.statement.innerHTML = `<p class="empty">${escapeHtml(question.error)}</p>`;
    return;
  }

  renderQuestion(question, options);
  await saveStudyState({
    currentQuestionId: questionId,
    mode: state.studyMode,
    profile: state.activeProfile || '',
    materia: question.metadata?.materia || '',
    assunto: question.metadata?.assunto || ''
  }).catch((error) => {
    console.warn('Nao foi possivel salvar o estado de estudo.', error);
  });
  recordQuestionEvent('started_question');
}

async function openQuestionDirect(questionId, options = {}) {
  const targetId = Number(questionId || 0);
  if (!targetId) return;

  closeSupportPanel();
  closeAllDropdowns();
  try {
    await selectQuestion(targetId);
    const rowIndex = state.rows.findIndex((row) => Number(row.id) === targetId);
    if (rowIndex >= 0) {
      state.rowIndex = rowIndex;
    } else {
      state.rows = [{ id: targetId }];
      state.rowIndex = 0;
      state.page = 1;
      state.total = 1;
      state.totalPages = 1;
    }
    updateQuestionUrl(targetId, { replace: Boolean(options.replaceUrl) });
    renderPager();
  } catch (error) {
    console.error('Nao foi possivel abrir a questao.', error);
    if (options.fallbackHref) {
      window.location.assign(options.fallbackHref);
      return;
    }
    els.answerHint.textContent = 'Nao foi possivel abrir esta questao. Recarregue a pagina e tente novamente.';
  }
}

function renderQuestion(question, options = {}) {
  const previousQuestionId = state.currentQuestion?.id || state.currentQuestion?.questionId || null;
  const nextQuestionId = question.id || question.questionId || null;
  if (previousQuestionId !== nextQuestionId) {
    state.teachingEditMode = false;
  }
  state.currentQuestion = question;
  const adaptiveReason = options.adaptiveTarget?.reasonText || question.adaptive?.reasonText || '';
  const meta = question.metadata;
  els.questionTitle.textContent = 'Questão';
  els.questionMeta.textContent = [meta.banca, meta.ano, meta.materia, meta.assunto].filter(Boolean).join(' • ');
  els.questionQuickStatus.textContent = adaptiveReason || questionQuickStatus(question);
  renderQuestionBadges(question);
  renderMastery(question.mastery);
  els.statement.innerHTML = formatStatementHtml(question) || question.statementHtml || `<p>${escapeHtml(question.statementText || 'Sem enunciado')}</p>`;
  renderAnswerStatus(question);

  els.alternatives.innerHTML = question.alternatives.map((alternative) => `
    <label class="alternative" data-letter="${escapeAttr(alternative.letter)}">
      <input type="radio" name="answer" value="${escapeAttr(alternative.letter)}">
      ${renderAlternativeText(question, alternative)}
    </label>
  `).join('');

  if (options.selectedAnswer) {
    const selectedInput = els.alternatives.querySelector(`input[name="answer"][value="${cssEscape(options.selectedAnswer)}"]`);
    if (selectedInput) {
      selectedInput.checked = true;
    }
  }

  state.theoryUrl = question.theory?.available ? question.theory.url : '';
  els.openTheory.disabled = !state.theoryUrl;
  els.openTheory.title = question.theory?.available
    ? `Abrir teoria: ${question.theory.title}`
    : 'PDF de teoria não encontrado para este assunto';
  const hasSupportExplanation = Boolean(
    question.comment.html
      || question.comment.text
      || question.normativeUpdate?.exists
      || question.normativeTeachingComment?.exists
      || question.metadata?.desatualizada
  );
  const hasTeachingSupport = Boolean(
    question.normativeTeachingComment?.exists
      || question.normativeUpdate?.exists
      || question.metadata?.desatualizada
  );
  els.openTeaching.disabled = !hasTeachingSupport;
  els.openTeaching.textContent = 'Comentário atualizado';
  els.toggleComment.disabled = !hasSupportExplanation;
  els.toggleComment.textContent = 'Explicação histórica';
  if (els.supportTabTeaching) {
    els.supportTabTeaching.disabled = !hasTeachingSupport;
  }
  const hasSimilar = Boolean(question.adaptive?.exists && question.adaptive?.clusterId);
  els.showSimilar.disabled = !hasSimilar;
  els.showSimilar.textContent = 'Semelhantes';
  els.similarQuestions.disabled = !hasSimilar;
  els.toggleNormativeSupport.disabled = !question.normativeUpdate?.exists;
  els.toggleNormativeSupport.textContent = 'Atualização normativa';

  const info = [
    question.comment.sourceType === 'ai' ? 'gerado por IA' : '',
    question.comment.extractedAnswer ? `Gabarito: ${question.comment.extractedAnswer}` : '',
    question.comment.professor || '',
    question.comment.aiModel || ''
  ].filter(Boolean).join(' - ');
  els.commentInfo.textContent = info;
  els.commentBody.innerHTML = question.comment.html || `<p class="empty">${escapeHtml(question.comment.text || 'Comentário ainda não coletado.')}</p>`;
  renderNormativeAlert(question);
  renderNormativeTeachingPanel(question);
  renderNormativePanel(question);
  renderTheoryPanel(question);
  renderHistoryPanel(question);
  renderSimilarPanelIntro(question);
  renderStudyStatusControl(question);

  renderAnswerResultBox();
  renderSelectedAlternative();
  updateAnswerActions();
  renderSupportVisibility();
}

function renderNormativeAlert(question) {
  const update = question.normativeUpdate;
  if (!update?.exists && !question.metadata?.desatualizada) {
    els.normativeAlert.hidden = true;
    els.normativeAlert.innerHTML = '';
    return;
  }

  const tone = update?.isDiscardable ? 'is-danger' : update?.isManualReview ? 'is-warning' : 'is-info';
  const title = update?.exists ? 'Questão com análise normativa' : 'Questão desatualizada';
  const detail = update?.exists
    ? [
      update.recomendacao ? `Recomendação: ${update.recomendacao}` : '',
      update.nivelSeguranca ? `Segurança: ${update.nivelSeguranca}` : '',
      update.hasChangedAnswer ? 'gabarito provável mudou' : ''
    ].filter(Boolean).join(' - ')
    : 'Esta questão foi marcada como desatualizada no banco.';

  els.normativeAlert.className = `normative-alert ${tone}`;
  els.normativeAlert.innerHTML = `
    <div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
    ${question.normativeTeachingComment?.exists ? '<button class="button button-primary" type="button" data-action="show-teaching">Ver comentário atualizado</button>' : ''}
    ${update?.exists ? '<button class="button button-secondary" type="button" data-action="show-normative">Ver análise normativa</button>' : ''}
  `;
  els.normativeAlert.hidden = false;
}

function renderNormativeTeachingPanel(question) {
  const teaching = question.normativeTeachingComment;
  if (!teaching?.exists) {
    els.teachingInfo.textContent = question.metadata?.desatualizada ? 'ainda não gerado' : 'indisponível';
    els.supportTeachingBody.innerHTML = question.metadata?.desatualizada
      ? '<p class="empty">Ainda não há comentário atualizado para esta questão. Use a aba de atualização normativa como referência de auditoria.</p>'
      : '<p class="empty">Esta questão não possui comentário normativo atualizado.</p>';
    return;
  }

  const isDiscard = teaching.status === 'discard' || teaching.answerPolicy === 'discard_original';
  const needsManual = teaching.status === 'needs_manual_review'
    || teaching.answerPolicy === 'not_assertive_manual_review'
    || teaching.reviewStatus === 'needs_manual_review';
  const confidence = Number(teaching.currentAnswerConfidence || 0);
  els.teachingInfo.textContent = [
    teaching.status ? teachingStatusLabel(teaching.status) : '',
    teaching.currentAnswer ? `gabarito atual: ${teaching.currentAnswer}` : 'sem gabarito atual seguro',
    teaching.studentEdit?.exists ? 'editado pelo aluno' : '',
    teaching.displayVersion || teaching.sourceVersion || ''
  ].filter(Boolean).join(' - ');

  const policyMessage = isDiscard
    ? '<p class="normative-warning is-danger">Questão não recomendada para estudo sem reformulação.</p>'
    : needsManual
      ? '<p class="normative-warning is-warning">Esta questão precisa de revisão manual antes de ser usada para correção segura.</p>'
      : '';
  const answer = teaching.currentAnswer
    ? `${currentAnswerLabel(teaching.currentAnswer)}${confidence ? ` (${Math.round(confidence * 100)}% de confiança)` : ''}`
    : 'não definido com segurança';

  if (state.teachingEditMode) {
    els.supportTeachingBody.innerHTML = teachingEditFormMarkup(teaching, answer, policyMessage);
    return;
  }

  els.supportTeachingBody.innerHTML = `
    <div class="teaching-v3-card">
      <div class="teaching-edit-toolbar">
        <div>
          <strong>Texto do aluno</strong>
          <span>${teaching.studentEdit?.exists ? `editado em ${escapeHtml(formatFullDate(teaching.studentEdit.updatedAt))}` : 'sem edicao manual'}</span>
        </div>
        <div class="teaching-edit-actions">
          <button class="button button-secondary" type="button" data-action="teaching-edit">Editar texto</button>
          ${teaching.studentEdit?.exists ? '<button class="button button-ghost" type="button" data-action="teaching-reset-edit">Restaurar original</button>' : ''}
        </div>
      </div>
      ${policyMessage}
      ${teachingV3Section('Gabarito pela regra atual', answer, { highlight: true })}
      ${teachingLegalBasisMarkup(teaching)}
      ${teachingV3Section('Explicação', teaching.shortExplanationMd || teaching.shortExplanation)}
      ${teachingV3Section('Regra atual em resumo', teaching.currentRuleSummaryMd || teaching.currentRuleSummary)}
      ${teachingV3Section('Complementação de professor', teaching.professorComplementMd)}
      ${teachingV3Section('Conclusão para estudo', teaching.studyConclusionMd)}
      ${teachingTechnicalDetailsMarkup(teaching)}
    </div>
  `;
}

function teachingEditFormMarkup(teaching, answer, policyMessage) {
  return `
    <form class="teaching-edit-form" data-teaching-edit-form>
      <div class="teaching-edit-toolbar">
        <div>
          <strong>Editar comentario atualizado</strong>
          <span>Essas alteracoes ficam em camada propria do aluno.</span>
        </div>
        <div class="teaching-edit-actions">
          <button class="button button-primary" type="button" data-action="teaching-save-edit">Salvar</button>
          <button class="button button-secondary" type="button" data-action="teaching-cancel-edit">Cancelar</button>
        </div>
      </div>
      ${policyMessage}
      <section class="teaching-v3-section is-highlight">
        <strong>Gabarito pela regra atual</strong>
        <p>${escapeHtml(answer)}</p>
      </section>
      ${teachingEditTextarea('Fundamento aplicavel', 'legalBasisMd', teachingEditValue(teaching, 'legalBasisMd', teachingDisplayedLegalBasis(teaching)))}
      ${teachingEditTextarea('Explicacao', 'shortExplanationMd', teachingEditValue(teaching, 'shortExplanationMd', teaching.shortExplanationMd || teaching.shortExplanation))}
      ${teachingEditTextarea('Regra atual em resumo', 'currentRuleSummaryMd', teachingEditValue(teaching, 'currentRuleSummaryMd', teaching.currentRuleSummaryMd || teaching.currentRuleSummary))}
      ${teachingEditTextarea('Complementacao de professor', 'professorComplementMd', teachingEditValue(teaching, 'professorComplementMd', teaching.professorComplementMd))}
      ${teachingEditTextarea('Conclusao para estudo', 'studyConclusionMd', teachingEditValue(teaching, 'studyConclusionMd', teaching.studyConclusionMd))}
    </form>
  `;
}

function teachingEditTextarea(label, name, value) {
  return `
    <label class="teaching-edit-field">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeAttr(name)}" rows="7">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function teachingEditValue(teaching, key, fallback) {
  const edit = teaching.studentEdit || {};
  if (edit.exists && Object.prototype.hasOwnProperty.call(edit, key)) {
    return edit[key] ?? '';
  }
  return fallback || '';
}

function teachingDisplayedLegalBasis(teaching) {
  return teaching.legalBasis || teaching.legalArticleReference || teaching.mainLegalBasis || '';
}

async function saveNormativeTeachingEdit() {
  if (!state.selectedId) return;
  const form = els.supportTeachingBody.querySelector('[data-teaching-edit-form]');
  if (!form) return;

  const data = new FormData(form);
  setTeachingEditButtonsDisabled(true);
  try {
    const result = await api(`/api/questions/${state.selectedId}/normative-teaching-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalBasisMd: data.get('legalBasisMd') || '',
        shortExplanationMd: data.get('shortExplanationMd') || '',
        currentRuleSummaryMd: data.get('currentRuleSummaryMd') || '',
        professorComplementMd: data.get('professorComplementMd') || '',
        studyConclusionMd: data.get('studyConclusionMd') || ''
      })
    });
    if (result.error) throw new Error(result.error);
    state.currentQuestion.normativeTeachingComment = result.normativeTeachingComment;
    state.teachingEditMode = false;
    renderNormativeTeachingPanel(state.currentQuestion);
  } catch (error) {
    els.teachingInfo.textContent = `erro ao salvar: ${error.message}`;
    setTeachingEditButtonsDisabled(false);
  }
}

async function resetNormativeTeachingEdit() {
  if (!state.selectedId) return;
  if (!window.confirm('Restaurar o comentario atualizado original desta questao?')) return;

  setTeachingEditButtonsDisabled(true);
  try {
    const result = await api(`/api/questions/${state.selectedId}/normative-teaching-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true })
    });
    if (result.error) throw new Error(result.error);
    state.currentQuestion.normativeTeachingComment = result.normativeTeachingComment;
    state.teachingEditMode = false;
    renderNormativeTeachingPanel(state.currentQuestion);
  } catch (error) {
    els.teachingInfo.textContent = `erro ao restaurar: ${error.message}`;
    setTeachingEditButtonsDisabled(false);
  }
}

function setTeachingEditButtonsDisabled(disabled) {
  els.supportTeachingBody
    .querySelectorAll('[data-action="teaching-save-edit"], [data-action="teaching-reset-edit"]')
    .forEach((button) => {
      button.disabled = disabled;
    });
}

function teachingV3Section(title, markdown, options = {}) {
  const text = String(markdown || '').trim();
  if (!text) return '';
  return `
    <section class="teaching-v3-section ${options.highlight ? 'is-highlight' : ''}">
      <strong>${escapeHtml(title)}</strong>
      <div>${markdownLiteToHtml(text)}</div>
    </section>
  `;
}

function teachingLegalBasisMarkup(teaching) {
  const reference = teaching.legalArticleReference || teaching.mainLegalBasis || teaching.legalBasis;
  const excerpt = teaching.articleExcerptCanQuote ? teaching.legalArticleExcerpt : '';
  const note = teaching.legalArticleExcerpt && !teaching.articleExcerptCanQuote
    ? '<p class="teaching-v3-note">Trecho literal não exibido porque o seed não marcou a transcrição como exata ou segura por tema.</p>'
    : '';
  if (!reference && !excerpt && !note) return '';
  return `
    <section class="teaching-v3-section">
      <strong>Artigo/fundamento aplicável</strong>
      ${reference ? `<p>${escapeHtml(reference)}</p>` : ''}
      ${excerpt ? `<blockquote>${escapeHtml(excerpt)}</blockquote>` : ''}
      ${note}
    </section>
  `;
}

function teachingTechnicalDetailsMarkup(teaching) {
  const details = teaching.technicalDetailsJson && typeof teaching.technicalDetailsJson === 'object'
    ? teaching.technicalDetailsJson
    : {};
  const rows = [
    ['Versão', teaching.displayVersion || teaching.sourceVersion],
    ['Status', teachingStatusLabel(teaching.status)],
    ['Política de correção', answerPolicyLabel(teaching.answerPolicy)],
    ['Gabarito histórico', teaching.historicalAnswer],
    ['Resposta bruta', teaching.currentAnswerRaw],
    ['Exatidão do artigo', articleExactnessLabel(teaching.articleExactness)],
    ['Revisão', reviewStatusLabel(teaching.reviewStatus)]
  ].filter(([, value]) => value);
  const technicalJson = Object.keys(details).length
    ? `<pre>${escapeHtml(JSON.stringify(details, null, 2))}</pre>`
    : '';
  if (!rows.length && !technicalJson) return '';
  return `
    <details class="teaching-technical">
      <summary>Mostrar detalhes técnicos</summary>
      <div class="teaching-technical-grid">
        ${rows.map(([label, value]) => `
          <span>
            <small>${escapeHtml(label)}</small>
            <strong>${escapeHtml(value)}</strong>
          </span>
        `).join('')}
      </div>
      ${technicalJson}
    </details>
  `;
}

function teachingAlternativesMarkup(items) {
  if (!items) return '';
  if (!Array.isArray(items) && typeof items === 'object') {
    const correct = items.correct_alternative || '';
    const note = items.note || '';
    const text = items.correct_alternative_text || '';
    if (!correct && !note && !text) return '';
    return `
      <section class="teaching-alternatives">
        <strong>Análise das alternativas</strong>
        ${correct ? `<div class="teaching-alternative is-current-correct"><span>${escapeHtml(correct)}</span><p>${escapeHtml(text || 'Alternativa provável pela regra atual.')}</p></div>` : ''}
        ${note ? `<p class="normative-note">${escapeHtml(note)}</p>` : ''}
      </section>
    `;
  }
  if (!Array.isArray(items) || !items.length) return '';
  return `
    <section class="teaching-alternatives">
      <strong>Análise das alternativas</strong>
      ${items.map((item) => `
        <div class="teaching-alternative ${item.is_correct_current_rule ? 'is-current-correct' : ''}">
          <span>${escapeHtml(item.letter || '-')}</span>
          <p>${escapeHtml(item.analysis || '')}</p>
        </div>
      `).join('')}
    </section>
  `;
}

function renderNormativePanel(question) {
  const update = question.normativeUpdate;
  if (!update?.exists) {
    els.normativeSupportInfo.textContent = question.metadata?.desatualizada ? 'sem análise importada' : 'indisponível';
    els.supportNormativeBody.innerHTML = question.metadata?.desatualizada
      ? '<p class="empty">Esta questão está marcada como desatualizada, mas ainda não há análise normativa importada para ela.</p>'
      : '<p class="empty">Esta questão não possui análise normativa importada.</p>';
    return;
  }

  els.normativeSupportInfo.textContent = [
    update.recomendacao || '',
    update.nivelSeguranca ? `segurança ${update.nivelSeguranca}` : '',
    update.reviewStatus ? `status ${reviewStatusLabel(update.reviewStatus)}` : ''
  ].filter(Boolean).join(' - ');

  const warning = update.isDiscardable
    ? '<p class="normative-warning is-danger">Esta questão não é recomendada para estudo sem reformulação.</p>'
    : update.isManualReview
      ? '<p class="normative-warning is-warning">Não há segurança suficiente. Revisar manualmente.</p>'
      : update.hasChangedAnswer
        ? '<p class="normative-warning is-warning">Atenção: o gabarito provável mudou pela análise normativa.</p>'
        : '';

  els.supportNormativeBody.innerHTML = `
    <div class="normative-card">
      ${warning}
      <div class="normative-summary-grid">
        ${normativeField('Recomendação', update.recomendacao)}
        ${normativeField('Segurança', update.nivelSeguranca)}
        ${normativeField('Gabarito histórico', update.gabaritoBanco)}
        ${normativeField('Gabarito atualizado provável', update.gabaritoAtualizadoProvavel)}
        ${normativeField('Mudança de gabarito', update.mudancaGabarito)}
        ${normativeField('Fonte-base', update.fonteBase)}
      </div>
      ${normativeTextBlock('Por que está desatualizada', update.porQueDesatualizada)}
      ${normativeTextBlock('Nova regra atual', update.novaRegraEstadoAtual)}
      ${normativeTextBlock('Fundamento atual', update.fundamentoJuridicoAtual)}
      ${normativeTextBlock('Observação sobre o enunciado literal', update.observacaoEnunciadoLiteral)}
      <p class="normative-note">Análise normativa auxiliar. Conferir manualmente antes de usar como atualização definitiva da questão.</p>
    </div>
  `;
}

function normativeField(label, value) {
  return `
    <span class="normative-field">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value || 'não informado')}</strong>
    </span>
  `;
}

function normativeTextBlock(title, text) {
  if (!text) return '';
  return `
    <section class="normative-text-block">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </section>
  `;
}

function renderTheoryPanel(question) {
  if (question.theory?.available) {
    const pageLabel = question.theory.pageStart
      ? `página ${question.theory.pageStart}${question.theory.pageCount ? ` de ${question.theory.pageCount}` : ''}`
      : (question.theory.indexed ? 'sem página segura' : 'índice pendente');
    const openLabel = question.theory.pageStart ? 'Abrir PDF na página' : 'Abrir PDF da teoria';
    const baseUrl = question.theory.baseUrl || question.theory.url;
    els.theoryInfo.textContent = question.theory.pageStart
      ? pageLabel
      : (question.theory.title || 'PDF disponível');
    els.supportTheoryBody.innerHTML = `
      <div class="theory-card">
        <strong>${escapeHtml(question.theory.title || 'Teoria relacionada')}</strong>
        <span class="theory-meta">${escapeHtml(question.metadata?.materia || '')}${question.metadata?.assunto ? ` • ${escapeHtml(question.metadata.assunto)}` : ''}</span>
        <span class="theory-page">${escapeHtml(pageLabel)}</span>
        ${question.theory.excerpt ? `
          <div class="theory-excerpt">
            <small>Trecho mais provável</small>
            <p>${escapeHtml(question.theory.excerpt)}</p>
          </div>
        ` : `
          <p class="theory-index-note">${question.theory.indexed
            ? 'PDF indexado, mas sem trecho suficientemente seguro para esta questão.'
            : 'Índice de páginas ainda não gerado para este PDF.'}</p>
        `}
        <div class="theory-card-actions">
          <a class="button button-primary" href="${escapeAttr(question.theory.url)}" target="_blank" rel="noopener">${escapeHtml(openLabel)}</a>
          ${question.theory.pageStart ? `<a class="button button-secondary" href="${escapeAttr(baseUrl)}" target="_blank" rel="noopener">Abrir do início</a>` : ''}
        </div>
      </div>
    `;
    return;
  }

  els.theoryInfo.textContent = 'indisponível';
  els.supportTheoryBody.innerHTML = '<p class="empty">Não encontrei PDF de teoria para esta matéria/assunto.</p>';
}

function renderHistoryPanel(question) {
  const total = Number(question.answerStats?.total || 0);
  els.historyInfo.textContent = total ? `${total} tentativa${total === 1 ? '' : 's'}` : 'sem tentativas';
  els.supportHistoryBody.innerHTML = total
    ? `<div class="answer-details">${answerHistoryMarkup(question)}</div>`
    : '<p class="empty">Você ainda não respondeu esta questão.</p>';
}

function questionQuickStatus(question) {
  const pieces = [];
  if (question.lastAnswer?.is_correct === 1) pieces.push('última resposta correta');
  if (question.lastAnswer?.is_correct === 0) pieces.push('erro anterior');
  if (!question.answerStats?.total) pieces.push('não resolvida');
  if (isReviewDue(question.mastery?.nextDueAt)) pieces.push('revisão vencida');
  const mastery = Math.round(Number(question.mastery?.score || 0) * 100);
  pieces.push(`domínio ${mastery}%`);
  return pieces.join(' • ');
}

function updateAnswerActions() {
  const selected = new FormData(els.answerForm).get('answer');
  const question = state.currentQuestion;
  const result = state.answerResult;
  const hasAlternatives = Boolean(question?.alternatives?.length);
  const hasExplanation = Boolean(question?.comment?.html || question?.comment?.text);
  const hasPreviousAnswer = Boolean(question?.answerStats?.total);

  els.secondaryExplain.disabled = !question;
  els.errorTypeWrapper.hidden = true;

  if (result) {
    if (result.isCorrect === 1) {
      els.answerHint.textContent = result.nextDueAt ? `Próxima revisão: ${formatDate(result.nextDueAt)}` : 'Resposta registrada';
      els.submitAnswer.textContent = 'Próxima questão';
      els.submitAnswer.dataset.action = 'next';
      els.submitAnswer.disabled = false;
      els.secondaryExplain.textContent = 'Ver explicação';
      els.secondaryExplain.dataset.action = 'explain';
      els.secondaryExplain.disabled = !hasExplanation;
      return;
    }

    if (result.isCorrect === 0) {
      els.answerHint.textContent = 'Revise a explicação antes de avançar';
      els.errorTypeWrapper.hidden = false;
      els.submitAnswer.textContent = 'Ver explicação';
      els.submitAnswer.dataset.action = 'explain';
      els.submitAnswer.disabled = !hasExplanation;
      els.secondaryExplain.textContent = 'Próxima questão';
      els.secondaryExplain.dataset.action = 'next';
      els.secondaryExplain.disabled = false;
      return;
    }

    els.answerHint.textContent = 'Resposta registrada sem gabarito';
    els.submitAnswer.textContent = 'Próxima questão';
    els.submitAnswer.dataset.action = 'next';
    els.submitAnswer.disabled = false;
    els.secondaryExplain.textContent = 'Ver explicação';
    els.secondaryExplain.dataset.action = 'explain';
    els.secondaryExplain.disabled = !hasExplanation;
    return;
  }

  if (selected) {
    els.answerHint.textContent = 'Pronta para corrigir';
    els.submitAnswer.textContent = hasPreviousAnswer ? 'Responder novamente' : 'Responder';
    els.submitAnswer.dataset.action = 'respond';
    els.submitAnswer.disabled = !hasAlternatives;
    els.secondaryExplain.textContent = 'Ver explicação';
    els.secondaryExplain.dataset.action = 'explain';
    els.secondaryExplain.disabled = !hasExplanation;
    return;
  }

  if (hasPreviousAnswer) {
    els.answerHint.textContent = state.studyMode === 'adaptive'
      ? 'Esta questão já foi respondida. Você pode revisar ou seguir.'
      : 'Questão já respondida';
    els.submitAnswer.textContent = state.studyMode === 'adaptive' ? 'Próxima recomendada' : 'Próxima questão';
    els.submitAnswer.dataset.action = 'next';
    els.submitAnswer.disabled = false;
    els.secondaryExplain.textContent = 'Histórico';
    els.secondaryExplain.dataset.action = 'history';
    els.secondaryExplain.disabled = false;
    return;
  }

  els.answerHint.textContent = 'Escolha uma alternativa';
  els.submitAnswer.textContent = 'Responder';
  els.submitAnswer.dataset.action = 'respond';
  els.submitAnswer.disabled = true;
  els.secondaryExplain.textContent = 'Ver explicação';
  els.secondaryExplain.dataset.action = 'explain';
  els.secondaryExplain.disabled = !hasExplanation;
}

function renderAnswerResult(result) {
  if (result.error) {
    els.answerStatus.textContent = result.error;
    els.answerStatus.disabled = true;
    els.submitAnswer.disabled = false;
    return;
  }

  if (typeof result.masteryScore === 'number') {
    const score = Math.round(result.masteryScore * 100);
    els.masteryScore.textContent = `${score}%`;
    els.masteryLabel.textContent = masteryLabel(score);
  }
  if (result.nextDueAt) {
    els.nextDue.textContent = formatDate(result.nextDueAt);
  }

  applyAnswerResultToCurrentQuestion(result);
  state.answerResult = result;

  const selectedInput = els.alternatives.querySelector(`input[name="answer"][value="${cssEscape(result.answer)}"]`);
  if (selectedInput) {
    selectedInput.checked = true;
  }

  renderAnswerStatus(state.currentQuestion);
  renderAnswerResultBox();
  renderSelectedAlternative();
  updateAnswerActions();
}

function applyAnswerResultToCurrentQuestion(result) {
  if (!state.currentQuestion) {
    return;
  }

  const stats = state.currentQuestion.answerStats || { total: 0, correct: 0, wrong: 0, unknown: 0 };
  stats.total = Number(stats.total || 0) + 1;
  if (result.isCorrect === 1) {
    stats.correct = Number(stats.correct || 0) + 1;
  } else if (result.isCorrect === 0) {
    stats.wrong = Number(stats.wrong || 0) + 1;
  } else {
    stats.unknown = Number(stats.unknown || 0) + 1;
  }

  state.currentQuestion.answerStats = stats;
  state.currentQuestion.lastAnswer = {
    answer_letter: result.answer || '',
    answer_text: result.answerText || '',
    expected_answer: result.expectedAnswer || '',
    is_correct: result.isCorrect,
    answered_at: result.answeredAt || new Date().toISOString(),
    confidence: result.confidence || els.confidenceSelect.value || '',
    error_type: result.errorType || ''
  };
}

function showAnswerSubmitError(error) {
  console.error(error);
  els.answerResult.className = 'answer-result is-wrong';
  els.answerResult.innerHTML = `
    <span class="answer-result-icon" aria-hidden="true">!</span>
    <span><strong>Nao foi possivel registrar a resposta.</strong> Tente novamente. Se continuar, confira os logs da Vercel.</span>
  `;
  els.answerResult.hidden = false;
  els.answerHint.textContent = 'Falha ao registrar';
  els.submitAnswer.textContent = 'Responder';
  els.submitAnswer.dataset.action = 'respond';
  els.submitAnswer.disabled = false;
}

function renderAnswerStatus(question) {
  const stats = question.answerStats || { total: 0, correct: 0, wrong: 0, unknown: 0 };
  if (!stats.total) {
    els.answerStatus.textContent = '';
    els.answerStatus.disabled = true;
    els.answerDetails.hidden = true;
    els.answerDetails.innerHTML = '';
    return;
  }

  els.answerStatus.disabled = false;
  els.answerStatus.textContent = `Respondida ${stats.total} vez${stats.total === 1 ? '' : 'es'} - detalhar`;
  els.answerDetails.innerHTML = answerHistoryMarkup(question);
  els.answerDetails.hidden = true;
}

function answerHistoryMarkup(question) {
  const stats = question.answerStats || { total: 0, correct: 0, wrong: 0, unknown: 0 };
  const last = question.lastAnswer;
  const lastStatus = last?.is_correct === 1
    ? 'correta'
    : last?.is_correct === 0
      ? 'incorreta'
      : 'sem gabarito';

  return `
    <span>Respondida: <strong>${Number(stats.total || 0)}</strong> vez${Number(stats.total || 0) === 1 ? '' : 'es'}</span>
    <span>Acertos: <strong>${Number(stats.correct || 0)}</strong></span>
    <span>Erros: <strong>${Number(stats.wrong || 0)}</strong></span>
    <span>Sem correção: <strong>${Number(stats.unknown || 0)}</strong></span>
    ${last ? `<span>Última resposta: <strong>${escapeHtml(lastStatus)}</strong></span>` : ''}
    ${last?.confidence ? `<span>Confiança: <strong>${escapeHtml(confidenceLabel(last.confidence))}</strong></span>` : ''}
    ${last?.error_type ? `<span>Tipo de erro: <strong>${escapeHtml(errorTypeLabel(last.error_type))}</strong></span>` : ''}
  `;
}

function renderQuestionBadges(question) {
  const badges = [];
  const meta = question?.metadata;
  const studyStatus = question?.studyStatus;
  if (studyStatus?.isOutOfStudy) {
    const label = studyStatus.status === 'review_later' ? 'Revisar depois' : 'Fora do estudo';
    badges.push(`<span class="question-badge is-study-excluded">${escapeHtml(label)}</span>`);
  }
  if (meta?.desatualizada) {
    badges.push('<span class="question-badge is-outdated">Desatualizada</span>');
  }
  if (question?.normativeUpdate?.exists) {
    const update = question.normativeUpdate;
    const cls = update.isDiscardable ? 'is-canceled' : update.isManualReview ? 'is-outdated' : 'is-normative';
    badges.push(`<span class="question-badge ${cls}">Normativa: ${escapeHtml(update.recomendacao || 'analisada')}</span>`);
  }
  if (question?.normativeTeachingComment?.exists) {
    badges.push('<span class="question-badge is-normative">Comentário atualizado</span>');
  }
  if (question?.normativeUpdate?.hasChangedAnswer) {
    badges.push('<span class="question-badge is-last-wrong">Gabarito provável mudou</span>');
  }
  if (meta?.anulada) {
    badges.push('<span class="question-badge is-canceled">Anulada</span>');
  }
  if (question?.comment?.html || question?.comment?.text) {
    badges.push('<span class="question-badge is-commented">Comentada</span>');
  }
  if (!question?.comment?.extractedAnswer) {
    badges.push('<span class="question-badge is-no-answer">Sem gabarito</span>');
  }
  if (question?.lastAnswer?.is_correct === 0) {
    badges.push('<span class="question-badge is-last-wrong">Errei por último</span>');
  }
  if (isReviewDue(question?.mastery?.nextDueAt)) {
    badges.push('<span class="question-badge is-due">Revisão vencida</span>');
  }

  els.questionBadges.innerHTML = badges.join('');
  els.questionBadges.hidden = badges.length === 0;
}

function renderStudyStatusControl(question) {
  if (!els.studyStatusControl) {
    return;
  }

  const status = question?.studyStatus || { status: 'active', reason: '', isOutOfStudy: false };
  const active = Boolean(question);
  const outOfStudy = Boolean(status.isOutOfStudy);
  const reason = status.reason || (question?.metadata?.desatualizada ? 'outdated_no_value' : 'other');

  els.studyStatusControl.classList.toggle('is-out-of-study', outOfStudy);
  els.studyStatusText.textContent = !active
    ? 'Sem questao selecionada'
    : outOfStudy
      ? `${studyStatusLabel(status.status)} - ${studyStatusReasonLabel(reason)}`
      : 'Ativa na fila adaptativa';
  els.studyStatusReason.value = [...els.studyStatusReason.options].some((option) => option.value === reason)
    ? reason
    : 'other';

  els.studyStatusReason.disabled = !active || outOfStudy;
  els.excludeFromStudy.disabled = !active || outOfStudy;
  els.reviewLater.disabled = !active || outOfStudy;
  els.restoreToStudy.hidden = !active || !outOfStudy;
}

async function updateQuestionStudyStatus(status) {
  if (!state.selectedId) {
    return;
  }

  const reason = status === 'active' ? '' : els.studyStatusReason.value || 'other';
  const response = await api(`/api/questions/${state.selectedId}/study-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reason })
  });
  if (response.error) {
    els.studyStatusText.textContent = response.error;
    return;
  }

  state.currentQuestion.studyStatus = response.studyStatus;
  renderStudyStatusControl(state.currentQuestion);
  renderQuestionBadges(state.currentQuestion);
  loadStats().catch(() => {});

  if (status !== 'active' && state.studyMode !== 'all') {
    await goNext();
  }
}

function studyStatusLabel(status) {
  return {
    excluded: 'Fora do estudo',
    review_later: 'Revisar depois',
    active: 'Ativa'
  }[status] || 'Ativa';
}

function studyStatusReasonLabel(reason) {
  return {
    outdated_no_value: 'desatualizada sem aproveitamento',
    obsolete_norm: 'norma antiga',
    bad_statement: 'enunciado ruim',
    duplicate: 'duplicada',
    manual_review: 'revisar depois',
    other: 'outro'
  }[reason] || 'outro';
}

function formatStatementHtml(question) {
  const html = String(question.statementHtml || '');
  const text = String(question.statementText || '');
  if (!text || /<table\b/i.test(html)) {
    return '';
  }

  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''));
  const tableGroups = findAssociationTableGroups(lines);
  if (!tableGroups.length) {
    return '';
  }

  const chunks = [];
  let cursor = 0;
  for (const group of tableGroups) {
    chunks.push(paragraphsFromLines(lines.slice(cursor, group.start)));
    chunks.push(associationTableMarkup(group.rows));
    cursor = group.end + 1;
  }
  chunks.push(paragraphsFromLines(lines.slice(cursor)));

  return chunks.filter(Boolean).join('');
}

function findAssociationTableGroups(lines) {
  const groups = [];
  let start = -1;
  let rows = [];

  lines.forEach((line, index) => {
    const row = splitAssociationLine(line);
    if (row) {
      if (start < 0) {
        start = index;
        rows = [];
      }
      rows.push(row);
      return;
    }

    if (start >= 0) {
      if (rows.length >= 2) {
        groups.push({ start, end: index - 1, rows });
      }
      start = -1;
      rows = [];
    }
  });

  if (start >= 0 && rows.length >= 2) {
    groups.push({ start, end: lines.length - 1, rows });
  }

  return groups;
}

function splitAssociationLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(.+?)\s{6,}(.+)$/);
  if (!match) {
    return null;
  }

  const left = match[1].trim();
  const right = match[2].trim();
  if (!left || !right) {
    return null;
  }

  return { left, right };
}

function associationTableMarkup(rows) {
  const first = rows[0];
  const hasHeader = first && !looksLikeListItem(first.left) && !looksLikeListItem(first.right);
  const bodyRows = hasHeader ? rows.slice(1) : rows;
  const header = hasHeader
    ? `<thead><tr><th>${escapeHtml(first.left)}</th><th>${escapeHtml(first.right)}</th></tr></thead>`
    : '';

  return `
    <table class="statement-association-table">
      ${header}
      <tbody>
        ${bodyRows.map((row) => `
          <tr>
            <td>${escapeHtml(row.left)}</td>
            <td>${escapeHtml(row.right)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function paragraphsFromLines(lines) {
  const paragraphs = [];
  let current = [];

  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
      if (current.length) {
        paragraphs.push(current.join(' '));
        current = [];
      }
      continue;
    }
    current.push(trimmed);
  }

  if (current.length) {
    paragraphs.push(current.join(' '));
  }

  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
}

function looksLikeListItem(value) {
  return /^(\(?[A-E]\)|[A-E][.)]|[IVXLCDM]+[.)]|[0-9]+[.)]|[0-9]+\s*[–-])/i.test(String(value || '').trim());
}

function renderAlternativeText(question, alternative) {
  const text = alternative.text || '';
  if (String(question.metadata?.tipo || '').toUpperCase() === 'CERTO_ERRADO') {
    return `
      <span class="alternative-badge" aria-hidden="true"></span>
      <span class="alternative-text">${escapeHtml(text)}</span>
    `;
  }

  return `
    <span class="alternative-badge">${escapeHtml(alternative.letter)}</span>
    <span class="alternative-text">${escapeHtml(text)}</span>
  `;
}

function cycleAlternative(label) {
  const input = label.querySelector('input[name="answer"]');
  if (!input) {
    return;
  }

  const letter = input.value;
  if (state.eliminatedAnswers.has(letter)) {
    state.eliminatedAnswers.delete(letter);
    input.checked = true;
  } else if (input.checked) {
    input.checked = false;
    state.eliminatedAnswers.add(letter);
  } else {
    state.eliminatedAnswers.delete(letter);
    input.checked = true;
  }

  state.answerResult = null;
  renderAnswerResultBox();
  renderSelectedAlternative();
  updateAnswerActions();
}

function renderSelectedAlternative() {
  const selected = new FormData(els.answerForm).get('answer');
  const result = state.answerResult;
  const expectedLetter = expectedAlternativeLetter(result?.expectedAnswer);
  els.alternatives.querySelectorAll('.alternative').forEach((label) => {
    const input = label.querySelector('input[name="answer"]');
    const letter = input?.value || '';
    const isSelected = Boolean(selected && input?.value === selected);
    const isEliminated = state.eliminatedAnswers.has(letter) && !isSelected;
    const isCorrectAnswer = Boolean(result && expectedLetter && letter === expectedLetter);
    const isWrongAnswer = Boolean(result && result.isCorrect === 0 && letter === result.answer);
    label.classList.toggle('is-selected', isSelected);
    label.classList.toggle('is-eliminated', isEliminated);
    label.classList.toggle('is-answer-correct', isCorrectAnswer);
    label.classList.toggle('is-answer-wrong', isWrongAnswer);
  });
}

function renderAnswerResultBox() {
  const result = state.answerResult;
  if (!result) {
    els.answerResult.hidden = true;
    els.answerResult.innerHTML = '';
    return;
  }

  const resolution = '<button class="answer-result-link" type="button" data-action="show-comment">Ver resolução</button>';
  const normative = normativeAnswerWarning(result);
  if (result.isCorrect === 1) {
    els.answerResult.className = 'answer-result is-correct';
    els.answerResult.innerHTML = `
      <span class="answer-result-icon" aria-hidden="true">✓</span>
      <span><strong>Você acertou!</strong> Muito bem! ${resolution}${normative}</span>
    `;
  } else if (result.isCorrect === 0) {
    els.answerResult.className = 'answer-result is-wrong';
    els.answerResult.innerHTML = `
      <span class="answer-result-icon" aria-hidden="true">×</span>
      <span><strong>Você errou!</strong> Gabarito: <strong>${escapeHtml(result.expectedAnswer || '')}</strong>. ${resolution}${normative}</span>
    `;
  } else {
    els.answerResult.className = 'answer-result';
    els.answerResult.innerHTML = `
      <span class="answer-result-icon" aria-hidden="true">?</span>
      <span>Resposta registrada. ${resolution}${normative}</span>
    `;
  }
  els.answerResult.hidden = false;
}

function normativeAnswerWarning(result) {
  const teaching = result.normativeTeachingComment;
  if (teaching?.exists) {
    const current = teaching.currentAnswer || 'não definido';
    const policy = teaching.isSafeCurrentRule ? 'regra atual provável disponível no comentário atualizado' : answerPolicyLabel(teaching.answerPolicy);
    return `
      <span class="answer-result-note">
        Gabarito histórico do banco: ${escapeHtml(result.expectedAnswer || teaching.historicalAnswer || 'não informado')}.
        Gabarito provável pela regra atual: ${escapeHtml(current)}.
        Correção exibida: gabarito histórico do banco; política normativa: ${escapeHtml(policy)}.
      </span>
    `;
  }
  const update = result.normativeUpdate;
  if (!update?.exists || !update.hasChangedAnswer) {
    return '';
  }
  return `
    <span class="answer-result-note">
      Atenção: o gabarito histórico do banco é ${escapeHtml(result.expectedAnswer || update.gabaritoBanco || 'não informado')}, mas a análise normativa indica que, pela regra atual, o gabarito provável seria ${escapeHtml(update.gabaritoAtualizadoProvavel || 'não informado')}.
    </span>
  `;
}

function expectedAlternativeLetter(expectedAnswer) {
  const expected = normalizeAnswer(expectedAnswer);
  if (!expected || !state.currentQuestion?.alternatives) {
    return '';
  }
  if (/^[A-E]$/.test(expected)) {
    return expected;
  }

  const alternative = state.currentQuestion.alternatives.find((item) => normalizeAnswer(item.text) === expected);
  return alternative?.letter || '';
}

function showCommentPanel() {
  const preferredTab = state.currentQuestion?.normativeTeachingComment?.exists
    ? 'teaching'
    : state.currentQuestion?.normativeUpdate?.exists
      ? 'normative'
      : 'comment';
  openSupportPanel(preferredTab);
  state.sawComment = true;
  recordQuestionEvent('opened_comment');
}

function showTeachingPanel() {
  openSupportPanel('teaching');
  state.sawComment = true;
  recordQuestionEvent('opened_comment', 'teaching');
}

function showTheoryPanel() {
  if (!state.theoryUrl && !state.currentQuestion?.theory?.available) {
    openSupportPanel('theory');
    return;
  }
  state.openedTheory = true;
  openSupportPanel('theory');
  recordQuestionEvent('opened_theory', state.theoryUrl);
}

function showNormativePanel() {
  openSupportPanel('normative');
}

async function showSimilarPanel() {
  openSupportPanel('similar');
  await loadSimilarQuestions();
}

function renderSimilarPanelIntro(question) {
  const adaptive = question?.adaptive;
  if (!adaptive?.exists) {
    els.similarInfo.textContent = 'indisponível';
    els.supportSimilarBody.innerHTML = '<p class="empty">Esta questão ainda não está em uma família adaptativa.</p>';
    return;
  }
  els.similarInfo.textContent = adaptive.clusterType === 'same_skill'
    ? `${Number(adaptive.size || 0).toLocaleString('pt-BR')} no mesmo assunto`
    : `${Number(adaptive.size || 0).toLocaleString('pt-BR')} semelhantes`;
  els.supportSimilarBody.innerHTML = `
    <p>${escapeHtml(adaptive.reasonText || 'Família adaptativa da questão.')}</p>
    <p class="empty">Abra este painel para ver representante, variações e domínio.</p>
  `;
}

async function loadSimilarQuestions() {
  if (!state.selectedId) return;
  els.similarInfo.textContent = 'carregando';
  els.supportSimilarBody.innerHTML = '<p class="empty">Carregando questões relacionadas...</p>';
  const data = await api(`/api/questions/${state.selectedId}/similar`);
  if (!data.cluster?.id) {
    els.similarInfo.textContent = 'sem cluster';
    els.supportSimilarBody.innerHTML = '<p class="empty">Nenhuma questão semelhante cadastrada.</p>';
    return;
  }
  els.similarInfo.textContent = data.cluster.type === 'same_skill'
    ? `${Number(data.cluster.size || 0).toLocaleString('pt-BR')} no mesmo assunto`
    : `${Number(data.cluster.size || 0).toLocaleString('pt-BR')} semelhantes`;
  const members = data.members || [];
  els.supportSimilarBody.innerHTML = `
    <p>${escapeHtml(data.cluster.type === 'same_skill' ? 'Família de treino do mesmo assunto.' : 'Questões muito próximas identificadas pelo motor adaptativo.')}</p>
    ${members.length
      ? `<div class="similar-list">${members.map((member) => similarMemberMarkup(member)).join('')}</div>`
      : '<p class="empty">Nenhuma outra questao semelhante cadastrada nesta familia.</p>'}
  `;
}

function similarMemberMarkup(member) {
  const role = member.role === 'representative' ? 'representante' : 'variação';
  const mastery = Math.round(Number(member.mastery_score || 0) * 100);
  const last = member.last_result === 1 ? 'última correta' : member.last_result === 0 ? 'última errada' : 'não resolvida';
  const questionId = resolveQuestionId(member);
  const href = questionId ? questionLink(questionId) : '#';
  return `
    <div class="similar-item">
      <strong>${escapeHtml(role)} • ${escapeHtml(member.materia || '')}</strong>
      <span>${escapeHtml(member.assunto || '')}</span>
      <span>Domínio ${mastery}% • ${escapeHtml(last)}${member.similarity ? ` • similaridade ${Math.round(Number(member.similarity || 0) * 100)}%` : ''}</span>
      ${questionId
        ? `<a class="button button-secondary" href="${escapeAttr(href)}" data-question-id="${escapeAttr(questionId)}">Abrir</a>`
        : '<span class="empty">ID indisponivel</span>'}
    </div>
  `;
}

function hideCommentPanel() {
  closeSupportPanel();
}

function openSupportPanel(tab = 'comment', options = {}) {
  state.supportOpen = true;
  state.supportTab = tab;
  if (!options.keepFocus) {
    state.lastSupportTrigger = document.activeElement;
  }
  renderSupportVisibility();
  if (!options.keepFocus) {
    requestAnimationFrame(() => els.closeSupport.focus());
  }
}

function closeSupportPanel() {
  state.supportOpen = false;
  renderSupportVisibility();
  if (state.lastSupportTrigger && typeof state.lastSupportTrigger.focus === 'function') {
    state.lastSupportTrigger.focus();
  }
}

function renderSupportVisibility() {
  if (state.supportTab === 'teaching'
    && !state.currentQuestion?.normativeTeachingComment?.exists
    && !state.currentQuestion?.normativeUpdate?.exists
    && !state.currentQuestion?.metadata?.desatualizada) {
    state.supportTab = 'comment';
  }
  els.supportOverlay.hidden = !state.supportOpen;
  els.supportDrawer.hidden = !state.supportOpen;
  els.supportTabs.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.supportTab === state.supportTab);
  });
  els.supportTeachingPanel.hidden = state.supportTab !== 'teaching';
  els.commentPanel.hidden = state.supportTab !== 'comment';
  els.supportNormativePanel.hidden = state.supportTab !== 'normative';
  els.supportTheoryPanel.hidden = state.supportTab !== 'theory';
  els.supportHistoryPanel.hidden = state.supportTab !== 'history';
  els.supportSimilarPanel.hidden = state.supportTab !== 'similar';

  const titles = {
    teaching: ['Comentário atualizado', 'Regra atual provável e orientação de estudo'],
    comment: ['Explicação histórica', 'Comentário do professor e gabarito histórico'],
    normative: ['Atualização normativa', 'Análise auxiliar da desatualização'],
    theory: ['Teoria relacionada', 'Material em PDF da matéria/assunto'],
    history: ['Histórico da questão', 'Tentativas registradas no banco local'],
    similar: ['Questões semelhantes', 'Representantes e variações de reforço']
  };
  const [title, subtitle] = titles[state.supportTab] || titles.comment;
  els.supportTitle.textContent = title;
  els.supportSubtitle.textContent = subtitle;
}

function renderSubjectsVisibility() {
  els.subjectsPanel.hidden = !state.subjectsVisible;
  els.toggleSubjects.textContent = state.subjectsVisible ? 'Ocultar ranking' : 'Ranking de assuntos';
}

function renderCoverageVisibility() {
  els.coveragePanel.hidden = !state.coverageVisible;
  els.toggleCoverage.textContent = state.coverageVisible ? 'Ocultar base' : 'Base x Prova';
}

function renderNormativeVisibility() {
  els.normativePanel.hidden = !state.normativeVisible;
  els.toggleNormative.textContent = state.normativeVisible ? 'Ocultar revisão normativa' : 'Revisão normativa';
}

function renderPager() {
  const absoluteIndex = state.rows.length
    ? ((state.page - 1) * PAGE_SIZE) + state.rowIndex + 1
    : 0;
  els.pageLabel.textContent = `${absoluteIndex} / ${state.total}`;
  els.prevPage.disabled = absoluteIndex <= 1;
  els.nextPage.disabled = absoluteIndex >= state.total;
}

function statMarkup(value, label) {
  return `<div class="stat"><strong>${Number(value || 0).toLocaleString('pt-BR')}</strong><span>${label}</span></div>`;
}

function recommendationLabel(value) {
  return {
    review_soon: 'revisar em breve',
    repair_now: 'reparar agora',
    advance: 'avancar',
    mastered: 'dominada'
  }[value] || 'registrada';
}

function masteryLabel(score) {
  if (score >= 85) return 'Dominado';
  if (score >= 65) return 'Bom';
  if (score >= 40) return 'Em consolidação';
  if (score > 0) return 'Frágil';
  return 'Novo';
}

function isReviewDue(value) {
  if (!value) {
    return false;
  }
  const date = new Date(String(value).replace(' ', 'T'));
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function confidenceLabel(value) {
  return {
    sure: 'certeza',
    doubt: 'duvida',
    guess: 'chute'
  }[value] || value;
}

function errorTypeLabel(value) {
  return {
    content: 'conteudo',
    interpretation: 'interpretacao',
    confusion: 'confusao',
    memory: 'decoreba',
    outdated: 'desatualizada',
    misclick: 'clique errado',
    other: 'outro'
  }[value] || value;
}

function normalizeAnswer(value) {
  const text = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  if (text.includes('CERTO')) return 'CERTO';
  if (text.includes('ERRADO')) return 'ERRADO';
  const letter = text.match(/\b[A-E]\b/);
  return letter ? letter[0] : text;
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');
}

function formatDate(value) {
  const date = new Date(String(value || '').replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return 'sem data';
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatFullDate(value) {
  const date = new Date(String(value || '').replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return 'sem data';
  }
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildSessionId() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return `${stamp}-study`;
}

function subjectRowMarkup(row, index) {
  const answered = Number(row.answered || 0);
  const total = Number(row.total || 0);
  const answeredPct = total ? Math.round((answered / total) * 100) : 0;
  const details = [
    `${total.toLocaleString('pt-BR')} questoes`,
    `${Number(row.comments || 0).toLocaleString('pt-BR')} comentarios historicos`,
    Number(row.ai_comments || 0) ? `${Number(row.ai_comments).toLocaleString('pt-BR')} comentarios IA` : '',
    Number(row.outdated || 0) ? `${Number(row.outdated).toLocaleString('pt-BR')} desatualizadas` : '',
    Number(row.canceled || 0) ? `${Number(row.canceled).toLocaleString('pt-BR')} anuladas` : '',
    `${answeredPct}% resolvidas`
  ].filter(Boolean).join(' - ');

  return `
    <button
      class="subject-row"
      type="button"
      data-materia="${escapeAttr(row.materia || '')}"
      data-assunto="${escapeAttr(row.assunto || '')}"
    >
      <span class="subject-rank">${index + 1}</span>
      <span class="subject-main">
        <strong>${escapeHtml(row.assunto || 'Sem assunto')}</strong>
        <small>${escapeHtml(row.materia || '')}</small>
      </span>
      <span class="subject-details">${escapeHtml(details)}</span>
    </button>
  `;
}

function strategicRowMarkup(row, index) {
  const details = [
    `peso ${Number(row.expected_pct || 0).toLocaleString('pt-BR')}%`,
    `${Number(row.valid_questions || 0).toLocaleString('pt-BR')} validas`,
    `${Number(row.valid_with_answer || 0).toLocaleString('pt-BR')} com gabarito`,
    `dominio ${Math.round(Number(row.mastery_score || 0) * 100)}%`,
    row.status || ''
  ].filter(Boolean).join(' - ');

  return `
    <div class="subject-row is-static">
      <span class="subject-rank">${index + 1}</span>
      <span class="subject-main">
        <strong>${escapeHtml(row.subject_label || row.subject_key || '')}</strong>
        <small>${escapeHtml(row.subject_key || '')}</small>
      </span>
      <span class="subject-details">${escapeHtml(details)}</span>
    </div>
  `;
}

function coverageRowMarkup(row) {
  return `
    <div class="coverage-row status-${escapeAttr(row.status || 'ok')}">
      <span class="coverage-main">
        <strong>${escapeHtml(row.subject_label || row.subject_key || '')}</strong>
        <small>${escapeHtml(row.status || 'ok')}</small>
      </span>
      <span>${Number(row.expected_pct || 0).toLocaleString('pt-BR')}%</span>
      <span>${Number(row.expected_items || 0).toLocaleString('pt-BR')}</span>
      <span>${Number(row.local_questions || 0).toLocaleString('pt-BR')}</span>
      <span>${Number(row.valid_questions || 0).toLocaleString('pt-BR')}</span>
      <span>${Number(row.valid_with_answer || 0).toLocaleString('pt-BR')}</span>
      <span>${Math.round(Number(row.mastery_score || 0) * 100)}%</span>
      <span>${Number(row.due_reviews || 0).toLocaleString('pt-BR')}</span>
    </div>
  `;
}

function normativeRowMarkup(row) {
  const tone = normativeRowTone(row);
  const questionId = resolveQuestionId(row);
  const href = questionId ? questionLink(questionId) : '#';
  const details = [
    row.banca || '',
    row.ano || '',
    row.tipo || '',
    row.mudancaGabarito ? `mudança: ${row.mudancaGabarito}` : '',
    row.teachingExists ? `comentário: ${row.teachingReviewStatus || 'pendente'}` : 'sem comentário atualizado',
    row.reviewStatus ? `status: ${reviewStatusLabel(row.reviewStatus)}` : ''
  ].filter(Boolean).join(' - ');

  return `
    <div class="normative-row ${tone}">
      <span class="normative-row-main">
        <strong>#${Number(row.questionId || 0).toLocaleString('pt-BR')} - ${escapeHtml(row.assunto || 'Sem assunto')}</strong>
        <small>${escapeHtml(row.materia || '')}</small>
        <small>${escapeHtml(row.statementPreview || '')}</small>
      </span>
      <span>${escapeHtml(row.gabaritoBanco || '-')}</span>
      <span>${escapeHtml(row.teachingCurrentAnswer || row.gabaritoAtualizadoProvavel || '-')}</span>
      <span>${escapeHtml(row.teachingStudyRecommendation ? teachingRecommendationLabel(row.teachingStudyRecommendation) : row.recomendacao || '-')}</span>
      <span>${escapeHtml(row.teachingSafetyLevel ? safetyLabel(row.teachingSafetyLevel) : row.nivelSeguranca || '-')}</span>
      <span>${escapeHtml(details)}</span>
      ${questionId
        ? `<a class="button button-secondary" href="${escapeAttr(href)}" data-question-id="${escapeAttr(questionId)}">Abrir</a>`
        : '<span class="empty">ID indisponivel</span>'}
    </div>
  `;
}

function normativeRowTone(row) {
  const status = normalizeAnswerText(row.teachingStatus);
  const recommendation = normalizeAnswerText(row.teachingStudyRecommendation || row.recomendacao);
  const security = normalizeAnswerText(row.teachingSafetyLevel || row.nivelSeguranca);
  const changed = normalizeAnswerText(row.mudancaGabarito);
  if (status === 'discard' || recommendation.includes('discard') || recommendation.includes('descartar')) return 'is-danger';
  if (status === 'needs_manual_review' || recommendation.includes('manual') || security === 'baixo' || security === 'low') return 'is-warning';
  if (row.teachingAnswerChanged || changed.startsWith('sim')) return 'is-changed';
  return 'is-ok';
}

function reviewStatusLabel(value) {
  return {
    pending: 'pendente',
    approved: 'aprovada',
    rejected: 'rejeitada',
    manual_review: 'revisão manual',
    needs_research: 'pesquisar',
    adapted: 'adaptada',
    discarded: 'descartada'
  }[value] || value || 'pendente';
}

function answerPolicyLabel(value) {
  return {
    current_law_probable: 'regra atual provável',
    not_assertive_manual_review: 'revisão manual',
    discard_original: 'descartar',
    current_safe: 'regra atual segura',
    current_with_adaptation: 'regra atual com adaptação',
    historical_only: 'somente histórico',
    manual_review: 'revisão manual',
    discard: 'descartar',
    do_not_autocorrect: 'não autocorrigir'
  }[value] || value || 'não informado';
}

function adaptationStatusLabel(value) {
  return {
    manual_review_required: 'revisão manual',
    adapted_statement_needed: 'adaptar enunciado',
    outdated_but_materially_same: 'materialmente semelhante',
    no_adaptation_needed: 'sem adaptação',
    adapt_statement: 'adaptar enunciado',
    adapt_legal_reference: 'adaptar fundamento',
    adapt_alternatives: 'adaptar alternativas',
    manual_review: 'revisão manual',
    discard: 'descartar',
    needs_review: 'revisar'
  }[value] || value || 'não informado';
}

function teachingRecommendationLabel(value) {
  if (value && value.length > 40) return value;
  return {
    study_current_rule: 'estudar pela regra atual',
    study_with_warning: 'estudar com alerta',
    manual_review: 'revisão manual',
    discard: 'descartar'
  }[value] || value || 'não informado';
}

function teachingStatusLabel(value) {
  return {
    ready: 'pronto',
    needs_manual_review: 'revisão manual',
    discard: 'descartar'
  }[value] || value || 'não informado';
}

function articleExactnessLabel(value) {
  return {
    exact: 'artigo exato',
    topic_safe: 'tema seguro',
    topic_only: 'somente fundamento geral',
    manual: 'revisão manual'
  }[value] || value || 'não informado';
}

function currentAnswerLabel(value) {
  const answer = String(value || '').trim();
  if (!answer) return 'não definido com segurança';
  if (answer === 'CERTO' || answer === 'ERRADO') return answer;
  if (/^[A-E]$/.test(answer)) return `alternativa ${answer}`;
  return answer;
}

function safetyLabel(value) {
  return {
    high: 'alta',
    medium: 'média',
    low: 'baixa',
    manual: 'manual'
  }[value] || value || 'não informado';
}

function normalizeAnswerText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function markdownLiteToHtml(markdown) {
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
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(trimmed.replace(/^#{1,4}\s+/, ''));
  }

  flushParagraph();
  flushList();
  return chunks.join('');
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

async function api(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = '';
    try {
      const text = await response.text();
      detail = text ? `: ${text.slice(0, 300)}` : '';
    } catch {
      detail = '';
    }
    throw new Error(`HTTP ${response.status}${detail}`);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
