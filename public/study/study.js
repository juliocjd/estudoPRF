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
  inlineSupportTab: 'comment',
  inlineSupportRenderKey: '',
  lastSupportTrigger: null,
  questionStartedAt: Date.now(),
  questionActiveElapsedMs: 0,
  questionTimerStartedAt: null,
  questionTimerRunning: false,
  timerId: null,
  sawComment: false,
  openedTheory: false,
  filters: {
    q: '',
    materia: '',
    assunto: '',
    excludedMaterias: [],
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
  theoryCoverageVisible: false,
  normativeVisible: false,
  lawCompendiumVisible: false,
  lawCompendiumMode: 'beginner',
  activeLawSourceSlug: '',
  lawCompendiumOverview: null,
  teachingEditMode: false,
  currentLawEditMode: false,
  historicalCommentEditMode: false,
  historicalCommentSelection: null,
  studyTimeTab: 'today',
  studyTimeSummary: null
};

const els = {
  stats: document.querySelector('#stats'),
  studyTimeTodayTab: document.querySelector('#studyTimeTodayTab'),
  studyTimeTotalTab: document.querySelector('#studyTimeTotalTab'),
  studyTimeTodayPanel: document.querySelector('#studyTimeTodayPanel'),
  studyTimeTotalPanel: document.querySelector('#studyTimeTotalPanel'),
  studyTimeToday: document.querySelector('#studyTimeToday'),
  studyTimeTotal: document.querySelector('#studyTimeTotal'),
  studyTimeTodayMeta: document.querySelector('#studyTimeTodayMeta'),
  studyTimeTotalMeta: document.querySelector('#studyTimeTotalMeta'),
  mobileFilterToggle: document.querySelector('#mobileFilterToggle'),
  filterBar: document.querySelector('#filterBar'),
  studyLayout: document.querySelector('.study-layout'),
  advancedFilterToggle: document.querySelector('#advancedFilterToggle'),
  advancedFilters: document.querySelector('#advancedFilters'),
  activeFiltersLabel: document.querySelector('#activeFiltersLabel'),
  clearFilters: document.querySelector('#clearFilters'),
  searchInput: document.querySelector('#searchInput'),
  matterSelect: document.querySelector('#matterSelect'),
  subjectSelect: document.querySelector('#subjectSelect'),
  excludedMatterList: document.querySelector('#excludedMatterList'),
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
  toggleTheoryCoverage: document.querySelector('#toggleTheoryCoverage'),
  toggleSubjects: document.querySelector('#toggleSubjects'),
  toggleNormative: document.querySelector('#toggleNormative'),
  toggleLawCompendium: document.querySelector('#toggleLawCompendium'),
  closeSubjectsReport: document.querySelector('#closeSubjectsReport'),
  closeCoverageReport: document.querySelector('#closeCoverageReport'),
  closeTheoryCoverageReport: document.querySelector('#closeTheoryCoverageReport'),
  closeNormativeReport: document.querySelector('#closeNormativeReport'),
  lawCompendiumPanel: document.querySelector('#lawCompendiumPanel'),
  lawCompendiumInfo: document.querySelector('#lawCompendiumInfo'),
  lawCompendiumStats: document.querySelector('#lawCompendiumStats'),
  lawSourceList: document.querySelector('#lawSourceList'),
  lawSourceDetail: document.querySelector('#lawSourceDetail'),
  closeLawCompendium: document.querySelector('#closeLawCompendium'),
  pageLabel: document.querySelector('#pageLabel'),
  questionMeta: document.querySelector('#questionMeta'),
  questionQuickStatus: document.querySelector('#questionQuickStatus'),
  questionBadges: document.querySelector('#questionBadges'),
  questionTitle: document.querySelector('#questionTitle'),
  normativeAlert: document.querySelector('#normativeAlert'),
  openTeaching: document.querySelector('#openTeaching'),
  openQuickTheory: document.querySelector('#openQuickTheory'),
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
  inlineSupportCard: document.querySelector('#inlineSupportCard'),
  inlineSupportTitle: document.querySelector('#inlineSupportTitle'),
  inlineSupportSubtitle: document.querySelector('#inlineSupportSubtitle'),
  inlineSupportTabs: document.querySelector('#inlineSupportTabs'),
  inlineSupportBody: document.querySelector('#inlineSupportBody'),
  inlineOpenDrawer: document.querySelector('#inlineOpenDrawer'),
  supportTheoryPanel: document.querySelector('#supportTheoryPanel'),
  supportAppliedTheoryPanel: document.querySelector('#supportAppliedTheoryPanel'),
  supportTabAppliedTheory: document.querySelector('#supportTabAppliedTheory'),
  appliedTheoryInfo: document.querySelector('#appliedTheoryInfo'),
  supportAppliedTheoryBody: document.querySelector('#supportAppliedTheoryBody'),
  supportQuickTheoryPanel: document.querySelector('#supportQuickTheoryPanel'),
  supportTabQuickTheory: document.querySelector('#supportTabQuickTheory'),
  supportNormativePanel: document.querySelector('#supportNormativePanel'),
  supportTabNormative: document.querySelector('#supportTabNormative'),
  supportHistoryPanel: document.querySelector('#supportHistoryPanel'),
  supportSimilarPanel: document.querySelector('#supportSimilarPanel'),
  normativeSupportInfo: document.querySelector('#normativeSupportInfo'),
  supportNormativeBody: document.querySelector('#supportNormativeBody'),
  theoryInfo: document.querySelector('#theoryInfo'),
  supportTheoryBody: document.querySelector('#supportTheoryBody'),
  quickTheoryInfo: document.querySelector('#quickTheoryInfo'),
  supportQuickTheoryBody: document.querySelector('#supportQuickTheoryBody'),
  historyInfo: document.querySelector('#historyInfo'),
  supportHistoryBody: document.querySelector('#supportHistoryBody'),
  similarInfo: document.querySelector('#similarInfo'),
  supportSimilarBody: document.querySelector('#supportSimilarBody'),
  commentPanel: document.querySelector('#commentPanel'),
  commentInfo: document.querySelector('#commentInfo'),
  commentEditStatus: document.querySelector('#commentEditStatus'),
  commentBody: document.querySelector('#commentBody'),
  subjectsPanel: document.querySelector('#subjectsPanel'),
  subjectsInfo: document.querySelector('#subjectsInfo'),
  subjectsList: document.querySelector('#subjectsList'),
  coveragePanel: document.querySelector('#coveragePanel'),
  coverageInfo: document.querySelector('#coverageInfo'),
  coverageAlerts: document.querySelector('#coverageAlerts'),
  coverageTable: document.querySelector('#coverageTable'),
  theoryCoveragePanel: document.querySelector('#theoryCoveragePanel'),
  theoryCoverageInfo: document.querySelector('#theoryCoverageInfo'),
  theoryCoverageStats: document.querySelector('#theoryCoverageStats'),
  theoryCoverageTable: document.querySelector('#theoryCoverageTable'),
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
let excludedMatterTimer = null;
const mobileLayoutQuery = window.matchMedia('(max-width: 760px)');
let lockedBodyScrollY = 0;

boot().catch(handleBootError);

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

function handleBootError(error) {
  console.error(error);
  if (els.questionMeta) els.questionMeta.textContent = 'falha ao carregar dados';
  if (els.questionQuickStatus) els.questionQuickStatus.textContent = 'Erro na API';
  if (els.questionTitle) els.questionTitle.textContent = 'Erro ao carregar';
  if (els.statement) {
    els.statement.innerHTML = `
      <p class="empty">
        ${escapeHtml(error?.message || 'Nao foi possivel carregar os dados do servidor.')}
      </p>
    `;
  }
}

function bindEvents() {
  bindDropdowns();
  syncMobileStudyStatusDisclosure();
  mobileLayoutQuery.addEventListener?.('change', syncMobileStudyStatusDisclosure);
  document.addEventListener('visibilitychange', syncQuestionTimerTracking);
  window.addEventListener('blur', syncQuestionTimerTracking);
  window.addEventListener('focus', syncQuestionTimerTracking);
  window.addEventListener('pagehide', pauseQuestionTimer);
  els.studyTimeTodayTab?.addEventListener('click', () => setStudyTimeTab('today'));
  els.studyTimeTotalTab?.addEventListener('click', () => setStudyTimeTab('total'));
  updateAdvancedFiltersSummary();

  els.mobileFilterToggle?.addEventListener('click', () => {
    const willOpen = !els.filterBar.classList.contains('is-mobile-open');
    els.filterBar.classList.toggle('is-mobile-open', willOpen);
    els.mobileFilterToggle.setAttribute('aria-expanded', String(willOpen));
  });

  els.advancedFilterToggle.addEventListener('click', () => {
    const willOpen = els.advancedFilters.hidden;
    els.advancedFilters.hidden = !willOpen;
    els.advancedFilterToggle.setAttribute('aria-expanded', String(willOpen));
  });

  els.clearFilters.addEventListener('click', async () => {
    clearFilters();
    await loadCurrentModeTarget();
    if (state.subjectsVisible) await loadSubjectsRanking();
    if (state.coverageVisible) await loadExamCoverage();
    if (state.theoryCoverageVisible) await loadTheoryCoverage();
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

  els.matterSelect.addEventListener('change', async () => {
    state.filters.materia = els.matterSelect.value;
    state.filters.assunto = '';
    state.page = 1;
    renderSubjectOptions();
    updateAdvancedFiltersSummary();
    await loadCurrentModeTarget();
    if (state.normativeVisible) await loadNormativeReview();
  });

  els.subjectSelect.addEventListener('change', async () => {
    state.filters.assunto = els.subjectSelect.value;
    state.page = 1;
    updateAdvancedFiltersSummary();
    await loadCurrentModeTarget();
    if (state.normativeVisible) await loadNormativeReview();
  });

  els.excludedMatterList.addEventListener('change', () => {
    state.filters.excludedMaterias = selectedExcludedMatterValues();
    state.page = 1;
    updateAdvancedFiltersSummary();
    clearTimeout(excludedMatterTimer);
    excludedMatterTimer = setTimeout(async () => {
      await loadCurrentModeTarget();
      if (state.subjectsVisible) await loadSubjectsRanking();
      if (state.normativeVisible) await loadNormativeReview();
    }, 350);
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
    if (state.theoryCoverageVisible) await loadTheoryCoverage();
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
    loadAdaptiveTarget('revisar_erros');
  });
  els.dueReviews.addEventListener('click', () => {
    closeAllDropdowns();
    setStudyMode('review');
    loadAdaptiveTarget('revisar_hoje');
  });
  els.toggleCoverage.addEventListener('click', async () => {
    closeAllDropdowns();
    const shouldOpen = !state.coverageVisible;
    closeReportPanels();
    closeLawCompendiumView();
    state.coverageVisible = shouldOpen;
    renderCoverageVisibility();
    if (state.coverageVisible) {
      await loadExamCoverage();
    }
  });
  els.toggleTheoryCoverage?.addEventListener('click', async () => {
    closeAllDropdowns();
    const shouldOpen = !state.theoryCoverageVisible;
    closeReportPanels();
    closeLawCompendiumView();
    state.theoryCoverageVisible = shouldOpen;
    renderTheoryCoverageVisibility();
    if (state.theoryCoverageVisible) {
      await loadTheoryCoverage();
    }
  });
  els.toggleSubjects.addEventListener('click', async () => {
    closeAllDropdowns();
    const shouldOpen = !state.subjectsVisible;
    closeReportPanels();
    closeLawCompendiumView();
    state.subjectsVisible = shouldOpen;
    renderSubjectsVisibility();
    if (state.subjectsVisible) {
      await loadSubjectsRanking();
    }
  });
  els.toggleNormative.addEventListener('click', async () => {
    closeAllDropdowns();
    const shouldOpen = !state.normativeVisible;
    closeReportPanels();
    closeLawCompendiumView();
    state.normativeVisible = shouldOpen;
    renderNormativeVisibility();
    if (state.normativeVisible) {
      await loadNormativeReview();
    }
  });
  els.toggleLawCompendium?.addEventListener('click', async () => {
    closeAllDropdowns();
    state.lawCompendiumVisible = !state.lawCompendiumVisible;
    if (state.lawCompendiumVisible) closeReportPanels();
    renderLawCompendiumVisibility();
    if (state.lawCompendiumVisible) {
      await loadLawCompendiumOverview();
    }
  });

  els.closeLawCompendium?.addEventListener('click', () => {
    closeLawCompendiumView();
  });
  els.closeSubjectsReport?.addEventListener('click', () => {
    state.subjectsVisible = false;
    renderSubjectsVisibility();
  });
  els.closeCoverageReport?.addEventListener('click', () => {
    state.coverageVisible = false;
    renderCoverageVisibility();
  });
  els.closeTheoryCoverageReport?.addEventListener('click', () => {
    state.theoryCoverageVisible = false;
    renderTheoryCoverageVisibility();
  });
  els.closeNormativeReport?.addEventListener('click', () => {
    state.normativeVisible = false;
    renderNormativeVisibility();
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
    await loadCurrentModeTarget();
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

  els.openQuickTheory?.addEventListener('click', () => {
    closeAllDropdowns();
    showQuickTheoryPanel();
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

  els.lawSourceDetail?.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-question-id]');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const questionId = Number(trigger.dataset.questionId || 0);
    if (!questionId) return;
    state.lawCompendiumVisible = false;
    renderLawCompendiumVisibility();
    await openQuestionDirect(questionId, { fallbackHref: trigger.href });
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
    if (action.startsWith('current-law-')) {
      event.preventDefault();
      if (action === 'current-law-edit') {
        state.currentLawEditMode = true;
        renderNormativeTeachingPanel(state.currentQuestion);
        return;
      }
      if (action === 'current-law-cancel-edit') {
        state.currentLawEditMode = false;
        renderNormativeTeachingPanel(state.currentQuestion);
        return;
      }
      if (action === 'current-law-save-edit') {
        await saveCurrentLawAnswerEdit();
      }
      return;
    }
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
  els.supportTeachingBody.addEventListener('change', (event) => {
    syncCurrentLawAutoScoreControl(event.target);
  });

  els.commentBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    await handleHistoricalCommentAction(button, event);
  });

  els.commentBody.addEventListener('input', (event) => {
    if (event.target.closest('[data-historical-comment-editor]')) {
      saveHistoricalCommentSelection(event.target.closest('[data-historical-comment-editor]'));
      setHistoricalCommentStatus('');
    }
  });

  els.commentBody.addEventListener('keyup', (event) => {
    const editor = event.target.closest('[data-historical-comment-editor]');
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.commentBody.addEventListener('mouseup', (event) => {
    const editor = event.target.closest('[data-historical-comment-editor]');
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.commentBody.addEventListener('focusout', (event) => {
    const editor = event.target.closest('[data-historical-comment-editor]');
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.commentBody.addEventListener('change', async (event) => {
    const colorInput = event.target.closest('[data-historical-comment-color]');
    if (colorInput) {
      await handleHistoricalCommentColor(colorInput, event);
      return;
    }
    const fontSizeSelect = event.target.closest('[data-historical-comment-font-size]');
    if (fontSizeSelect) {
      handleHistoricalCommentStyleSelect(fontSizeSelect, event, 'fontSize');
      return;
    }
    const fontFamilySelect = event.target.closest('[data-historical-comment-font-family]');
    if (fontFamilySelect) {
      handleHistoricalCommentStyleSelect(fontFamilySelect, event, 'fontFamily');
      return;
    }
    const lineHeightSelect = event.target.closest('[data-historical-comment-line-height]');
    if (lineHeightSelect) {
      handleHistoricalCommentStyleSelect(lineHeightSelect, event, 'lineHeight');
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

  els.inlineSupportTabs?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-inline-support-tab]');
    if (!button || button.disabled) return;
    const tab = button.dataset.inlineSupportTab || 'comment';
    state.inlineSupportTab = tab;
    if (tab === 'similar') await loadSimilarQuestions();
    if (tab === 'quickTheory') state.openedTheory = true;
    renderInlineSupportCard();
  });

  els.inlineOpenDrawer?.addEventListener('click', () => {
    openSupportPanel(state.inlineSupportTab || 'comment');
  });

  els.inlineSupportBody?.addEventListener('click', async (event) => {
    const questionLinkTrigger = event.target.closest('[data-question-id]');
    if (questionLinkTrigger) {
      event.preventDefault();
      event.stopPropagation();
      const questionId = Number(questionLinkTrigger.dataset.questionId || 0);
      if (questionId) await openQuestionDirect(questionId, { fallbackHref: questionLinkTrigger.href });
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      if (String(actionButton.dataset.action || '').startsWith('historical-comment-')) {
        await handleHistoricalCommentAction(actionButton, event);
      } else {
        await handleInlineSupportAction(actionButton, event);
      }
    }
  });

  els.inlineSupportBody?.addEventListener('input', (event) => {
    const editor = event.target.closest('[data-historical-comment-editor]');
    if (editor) {
      saveHistoricalCommentSelection(editor);
      setHistoricalCommentStatus('');
    }
  });

  els.inlineSupportBody?.addEventListener('keyup', (event) => {
    const editor = event.target.closest('[data-historical-comment-editor]');
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.inlineSupportBody?.addEventListener('mouseup', (event) => {
    const editor = event.target.closest('[data-historical-comment-editor]');
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.inlineSupportBody?.addEventListener('focusout', (event) => {
    const editor = event.target.closest('[data-historical-comment-editor]');
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.inlineSupportBody?.addEventListener('change', async (event) => {
    if (syncCurrentLawAutoScoreControl(event.target)) {
      return;
    }
    const colorInput = event.target.closest('[data-historical-comment-color]');
    if (colorInput) {
      await handleHistoricalCommentColor(colorInput, event);
      return;
    }
    const fontSizeSelect = event.target.closest('[data-historical-comment-font-size]');
    if (fontSizeSelect) {
      handleHistoricalCommentStyleSelect(fontSizeSelect, event, 'fontSize');
      return;
    }
    const fontFamilySelect = event.target.closest('[data-historical-comment-font-family]');
    if (fontFamilySelect) {
      handleHistoricalCommentStyleSelect(fontFamilySelect, event, 'fontFamily');
      return;
    }
    const lineHeightSelect = event.target.closest('[data-historical-comment-line-height]');
    if (lineHeightSelect) {
      handleHistoricalCommentStyleSelect(lineHeightSelect, event, 'lineHeight');
    }
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
    const elapsedMs = getQuestionElapsedMs();
    pauseQuestionTimer();
    try {
      const result = await api(`/api/questions/${state.selectedId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: selected,
          confidence: els.confidenceSelect.value,
          errorType: els.errorTypeSelect.value,
          elapsedMs,
          studyMode: state.studyMode,
          sessionId: state.sessionId,
          sawComment: state.sawComment,
          openedTheory: state.openedTheory
        })
      });
      renderAnswerResult(result);
      loadStats().catch(() => {});
    } catch (error) {
      syncQuestionTimerTracking();
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

function syncMobileStudyStatusDisclosure() {
  if (!els.studyStatusControl) return;
  if (mobileLayoutQuery.matches) {
    els.studyStatusControl.removeAttribute('open');
  } else {
    els.studyStatusControl.setAttribute('open', '');
  }
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
    excludedMaterias: [],
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
  renderExcludedMatterOptions();
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
    state.filters.excludedMaterias.length,
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
    repair: 'Plano: Revisar erros',
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
    statMarkup(stats.readyToStudy ?? stats.knownAnswers ?? 0, 'prontas para estudar'),
    statMarkup(stats.dueReviews || 0, 'revisar hoje'),
    statMarkup(stats.repairQuestions || 0, 'revisar erros'),
    statMarkup(stats.answered || 0, 'resolvidas')
  ].join('');
  state.studyTimeSummary = stats.studyTime || {};
  renderStudyTimeSummary();
}

async function loadFilters() {
  const filters = await api('/api/filters');
  state.subjects = filters.subjects || [];

  els.matterSelect.innerHTML = '<option value="">Todas</option>' + (filters.matters || [])
    .map((matter) => `<option value="${escapeAttr(matter.name)}">${escapeHtml(matter.name)} (${matter.count})</option>`)
    .join('');
  renderExcludedMatterOptions(filters.matters || []);

  renderSubjectOptions();
}

function renderExcludedMatterOptions(matters) {
  const selected = new Set(state.filters.excludedMaterias || []);
  if (!Array.isArray(matters)) {
    els.excludedMatterList.querySelectorAll('input[name="excludeMateria"]').forEach((input) => {
      input.checked = selected.has(input.value);
    });
    return;
  }
  els.excludedMatterList.innerHTML = matters.map((matter) => {
    const value = matter.name || '';
    return `
      <label class="matter-exclusion-option">
        <input type="checkbox" name="excludeMateria" value="${escapeAttr(value)}" ${selected.has(value) ? 'checked' : ''}>
        <span>${escapeHtml(value)} (${Number(matter.count || 0).toLocaleString('pt-BR')})</span>
      </label>
    `;
  }).join('');
}

function selectedExcludedMatterValues() {
  return [...els.excludedMatterList.querySelectorAll('input[name="excludeMateria"]:checked')]
    .map((input) => input.value)
    .filter(Boolean);
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
  syncQuestionTimerTracking();
  renderTimer();
  state.timerId = setInterval(renderTimer, 1000);
}

function renderTimer() {
  const elapsedSeconds = Math.max(0, Math.floor(getQuestionElapsedMs() / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  els.timerLabel.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  renderStudyTimeSummary();
}

function resetQuestionTimer() {
  state.questionStartedAt = Date.now();
  state.questionActiveElapsedMs = 0;
  state.questionTimerStartedAt = null;
  state.questionTimerRunning = false;
}

function shouldTrackQuestionTime() {
  return Boolean(state.selectedId) && document.visibilityState === 'visible' && document.hasFocus();
}

function syncQuestionTimerTracking() {
  if (shouldTrackQuestionTime()) {
    resumeQuestionTimer();
    return;
  }
  pauseQuestionTimer();
}

function resumeQuestionTimer() {
  if (state.questionTimerRunning) return;
  state.questionTimerStartedAt = Date.now();
  state.questionTimerRunning = true;
}

function pauseQuestionTimer() {
  if (!state.questionTimerRunning) return;
  const startedAt = state.questionTimerStartedAt || Date.now();
  state.questionActiveElapsedMs += Math.max(0, Date.now() - startedAt);
  state.questionTimerStartedAt = null;
  state.questionTimerRunning = false;
  renderTimer();
}

function getQuestionElapsedMs() {
  const activeRunMs = state.questionTimerRunning && state.questionTimerStartedAt
    ? Date.now() - state.questionTimerStartedAt
    : 0;
  return Math.max(0, state.questionActiveElapsedMs + activeRunMs);
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

async function loadCurrentModeTarget() {
  if (state.studyMode === 'review') {
    await loadAdaptiveTarget('revisar_hoje');
    return;
  }

  if (state.studyMode === 'repair') {
    await loadAdaptiveTarget('revisar_erros');
    return;
  }

  if (['study', 'smart', 'adaptive'].includes(state.studyMode)) {
    setStudyMode('adaptive');
    await loadAdaptiveTarget('prf_otimizado');
    return;
  }

  await loadQuestions();
}

function buildQuestionParams() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(PAGE_SIZE)
  });
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.filters.materia) params.set('materia', state.filters.materia);
  for (const materia of state.filters.excludedMaterias) params.append('excludeMateria', materia);
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
  state.inlineSupportTab = 'comment';
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  resetQuestionTimer();
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
  if (els.inlineSupportCard) els.inlineSupportCard.hidden = true;
  if (els.inlineSupportBody) els.inlineSupportBody.innerHTML = '';
  els.answerHint.textContent = 'Sem questão selecionada';
  els.errorTypeWrapper.hidden = true;
  els.teachingInfo.textContent = '';
  els.supportTeachingBody.innerHTML = '<p class="empty">Nenhum comentário atualizado carregado.</p>';
  if (els.supportTabTeaching) els.supportTabTeaching.disabled = true;
  if (els.appliedTheoryInfo) els.appliedTheoryInfo.textContent = '';
  if (els.supportAppliedTheoryBody) els.supportAppliedTheoryBody.innerHTML = '<p class="empty">Nenhuma teoria aplicada carregada.</p>';
  if (els.supportTabAppliedTheory) els.supportTabAppliedTheory.disabled = true;
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
    await loadAdaptiveTarget('revisar_erros');
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
  for (const materia of state.filters.excludedMaterias) params.append('excludeMateria', materia);
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
    ? `${coverageLegendMarkup()}${coverageHeaderMarkup()}${rows.map((row) => coverageRowMarkup(row)).join('')}`
    : '<p class="empty">Nenhum mapeamento encontrado para este perfil.</p>';
}

async function loadTheoryCoverage() {
  if (!els.theoryCoverageInfo || !els.theoryCoverageTable) return;
  els.theoryCoverageInfo.textContent = 'carregando';
  els.theoryCoverageStats.innerHTML = '';
  els.theoryCoverageTable.innerHTML = '<p class="empty">Carregando cobertura de teoria...</p>';
  const data = await api('/api/legal-dashboard');
  if (!data.available) {
    els.theoryCoverageInfo.textContent = 'sem camada criada';
    els.theoryCoverageTable.innerHTML = `<p class="empty">${escapeHtml(data.reason || 'Camada de teoria rapida indisponivel.')}</p>`;
    return;
  }
  const stats = data.stats || {};
  els.theoryCoverageInfo.textContent = `${Number(stats.specificQuickTheory || 0).toLocaleString('pt-BR')} teorias especificas seguras`;
  els.theoryCoverageStats.innerHTML = [
    statMarkup(stats.sources, 'fontes'),
    statMarkup(stats.articles, 'artigos'),
    statMarkup(stats.cards, 'microcards'),
    statMarkup(stats.links, 'vinculos'),
    statMarkup(stats.specificQuickTheory, 'especificas'),
    statMarkup(stats.panoramaOnly, 'panoramas'),
    statMarkup(stats.needsTheoryReview, 'revisao'),
    statMarkup(stats.currentLawReferenceOnly, 'refs atuais'),
    statMarkup(stats.withoutQuickTheory, 'sem apoio'),
    statMarkup(stats.importErrors, 'erros fonte')
  ].join('');
  const rows = data.bySubject || [];
  els.theoryCoverageTable.innerHTML = rows.length
    ? `${theoryCoverageLegendMarkup()}${theoryCoverageHeaderMarkup()}${rows.slice(0, 40).map((row) => theoryCoverageRowMarkup(row)).join('')}`
    : '<p class="empty">Nenhuma lacuna de teoria encontrada.</p>';
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
    ? `${normativeLegendMarkup()}${normativeHeaderMarkup()}${list.rows.map((row) => normativeRowMarkup(row)).join('')}`
    : '<p class="empty">Nenhuma análise normativa encontrada para os filtros.</p>';
}

async function loadLawCompendiumOverview() {
  if (!els.lawCompendiumInfo || !els.lawSourceList || !els.lawSourceDetail) return;
  els.lawCompendiumInfo.textContent = 'carregando';
  els.lawSourceList.innerHTML = '<p class="empty">Carregando normas...</p>';
  els.lawSourceDetail.innerHTML = '<p class="empty">Selecione uma norma.</p>';
  const data = await api('/api/law-compendium/overview');
  state.lawCompendiumOverview = data;
  if (!data.available) {
    els.lawCompendiumInfo.textContent = 'sem dados';
    els.lawCompendiumStats.innerHTML = '';
    els.lawSourceList.innerHTML = '';
    els.lawSourceDetail.innerHTML = `<p class="empty">${escapeHtml(data.reason || 'Apostila da Lei indisponivel.')}</p>`;
    return;
  }
  els.lawCompendiumInfo.textContent = `${Number(data.stats?.current || 0).toLocaleString('pt-BR')} vigentes validadas`;
  els.lawCompendiumStats.innerHTML = [
    statMarkup(data.stats?.current || 0, 'vigentes'),
    statMarkup(data.stats?.historical || 0, 'historicas'),
    statMarkup(data.stats?.pending || 0, 'ocultas'),
    statMarkup(data.stats?.sections || 0, 'secoes')
  ].join('');
  renderLawSourceList(data);
  const first = data.current?.[0] || data.historical?.[0];
  if (first) await openLawSource(first.slug);
}

function renderLawSourceList(data) {
  const groups = [
    ['Apostila vigente', data.current || []],
    ['Histórico do edital (somente consulta)', data.historical || []]
  ];
  els.lawSourceList.innerHTML = groups.map(([title, rows]) => `
    <section class="law-source-group">
      <strong>${escapeHtml(title)}</strong>
      ${rows.length ? rows.map((row) => lawSourceButtonMarkup(row)).join('') : '<p class="empty">Nenhuma norma.</p>'}
    </section>
  `).join('');
  els.lawSourceList.querySelectorAll('[data-law-source]').forEach((button) => {
    button.addEventListener('click', () => openLawSource(button.dataset.lawSource || ''));
  });
}

function lawSourceButtonMarkup(row) {
  const active = row.slug === state.activeLawSourceSlug ? ' is-active' : '';
  const meta = [
    lawStatusLabel(row.status),
    row.sections ? `${Number(row.sections).toLocaleString('pt-BR')} secoes` : '',
    row.editalOrigin?.length ? `edital: ${row.editalOrigin.slice(0, 2).join('; ')}` : ''
  ].filter(Boolean).join(' - ');
  return `
    <button class="law-source-button${active}" type="button" data-law-source="${escapeAttr(row.slug)}">
      <span>${escapeHtml(row.title || row.slug)}</span>
      <small>${escapeHtml(meta)}</small>
    </button>
  `;
}

async function openLawSource(slug) {
  if (!slug) return;
  state.activeLawSourceSlug = slug;
  renderLawSourceList(state.lawCompendiumOverview || { current: [], historical: [], pending: [] });
  els.lawSourceDetail.innerHTML = '<p class="empty">Carregando norma...</p>';
  const row = findLawSourceInOverview(slug);
  const mode = row?.status === 'historical_revoked' ? 'history' : (state.lawCompendiumMode || 'beginner');
  const data = await api(`/api/law-compendium/sources/${encodeURIComponent(slug)}?mode=${encodeURIComponent(mode)}`);
  renderLawSourceDetail(data);
}

function findLawSourceInOverview(slug) {
  const overview = state.lawCompendiumOverview || {};
  return [...(overview.current || []), ...(overview.historical || []), ...(overview.pending || [])]
    .find((row) => row.slug === slug);
}

function renderLawSourceDetail(data) {
  if (!data.available) {
    els.lawSourceDetail.innerHTML = `<p class="empty">${escapeHtml(data.reason || 'Norma indisponivel.')}</p>`;
    return;
  }
  const source = data.source || {};
  if (data.blocked) {
    els.lawSourceDetail.innerHTML = `
      <div class="law-source-head">
        <div>
          <strong>${escapeHtml(source.title || source.slug || 'Norma')}</strong>
          <span>${escapeHtml(lawStatusLabel(source.status))}</span>
        </div>
      </div>
      <p class="normative-warning is-warning">${escapeHtml(data.reason || 'Fonte bloqueada para a apostila vigente.')}</p>
      <p class="empty">${escapeHtml(source.validationNotes || '')}</p>
    `;
    return;
  }
  const isDryLaw = state.lawCompendiumMode === 'dry';
  els.lawSourceDetail.innerHTML = `
    <div class="law-source-head">
      <div>
        <strong>${escapeHtml(source.title || source.slug || 'Norma')}</strong>
        <span>${escapeHtml(lawStatusLabel(source.status))}${source.officialCheckedAt ? ` - checada em ${escapeHtml(formatFullDate(source.officialCheckedAt))}` : ''}</span>
      </div>
      <div class="law-mode-toggle" role="group" aria-label="Modo da apostila">
        <button class="button ${isDryLaw ? 'button-secondary' : 'button-primary'}" type="button" data-law-mode="beginner">Iniciante</button>
        <button class="button ${isDryLaw ? 'button-primary' : 'button-secondary'}" type="button" data-law-mode="dry">Lei seca</button>
      </div>
    </div>
    ${source.officialUrl ? `<a class="law-official-link" href="${escapeAttr(source.officialUrl)}" target="_blank" rel="noreferrer">Fonte oficial</a>` : ''}
    ${!isDryLaw ? lawSummaryMarkup(data.summary, source) : ''}
    <div class="law-sections">
      ${(data.sections || []).map((section) => lawSectionMarkup(section, isDryLaw)).join('') || '<p class="empty">Nenhuma seção extraída.</p>'}
    </div>
  `;
  els.lawSourceDetail.querySelectorAll('[data-law-mode]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.lawCompendiumMode = button.dataset.lawMode || 'beginner';
      await openLawSource(state.activeLawSourceSlug);
    });
  });
}

function lawSummaryMarkup(summary, source) {
  if (!summary) return '<p class="empty">Resumo ainda não criado. Rode build-law-compendium-summaries.</p>';
  return `
    <section class="law-summary">
      <strong>Resumo de estudo</strong>
      <p>${escapeHtml(summary.topSummary || '')}</p>
      ${lawBulletBlock('O que cobre', summary.whatItCovers)}
      ${lawBulletBlock('Pontos cobrados', summary.highYieldPoints)}
      ${lawBulletBlock('Pegadinhas', summary.commonTraps)}
      ${source.editalOrigin?.length ? lawBulletBlock('Histórico do edital', source.editalOrigin) : ''}
    </section>
  `;
}

function lawBulletBlock(title, items = []) {
  const rows = (items || []).filter(Boolean);
  if (!rows.length) return '';
  return `
    <div class="law-bullet-block">
      <span>${escapeHtml(title)}</span>
      <ul>${rows.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
  `;
}

function lawSectionMarkup(section, isDryLaw) {
  const hierarchyLevel = section.hierarchyLevel || 'item';
  if (['titulo', 'capitulo', 'secao'].includes(hierarchyLevel)) {
    const title = section.title && section.title !== section.displayRef ? section.title : '';
    return `
      <div class="law-divider is-${escapeAttr(hierarchyLevel)}">
        <strong>${escapeHtml(section.displayRef || title || '')}</strong>
        ${title ? `<span>${escapeHtml(title)}</span>` : ''}
      </div>
    `;
  }
  const related = !isDryLaw ? lawRelatedMarkup(section) : '';
  return `
    <article class="law-section is-${escapeAttr(hierarchyLevel)}">
      <p>${escapeHtml(lawSectionBodyText(section))}</p>
      ${lawCrossRefsMarkup(section.crossReferences || [])}
      ${related}
    </article>
  `;
}

function lawSectionBodyText(section) {
  let text = String(section.text || '').replace(/\s+§\s*$/g, '').trim();
  const displayRef = String(section.displayRef || '').trim();
  if (!displayRef) return text;
  const escapedRef = displayRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  text = text.replace(new RegExp(`^${escapedRef}\\s*[-–—.]?\\s*`, 'i'), '').trim();
  if ((section.hierarchyLevel || '') === 'artigo') {
    return `${normalizeLawArticleRef(displayRef)} ${text}`.trim();
  }
  if ((section.hierarchyLevel || '') === 'paragrafo') {
    return `${normalizeLawParagraphRef(displayRef)} ${text}`.trim();
  }
  if ((section.hierarchyLevel || '') === 'inciso') {
    return `${displayRef} - ${text}`.trim();
  }
  if ((section.hierarchyLevel || '') === 'alinea') {
    return `${displayRef} ${text}`.trim();
  }
  return `${displayRef} ${text}`.trim();
}

function normalizeLawArticleRef(displayRef) {
  const ref = String(displayRef || '').replace(/\.$/, '').trim();
  return /\.$/.test(ref) ? ref : `${ref}.`;
}

function normalizeLawParagraphRef(displayRef) {
  const ref = String(displayRef || '').replace(/\.$/, '').trim();
  if (/^Parágrafo\s+único/i.test(ref)) return 'Parágrafo único.';
  return /\.$/.test(ref) ? ref : `${ref}.`;
}

function lawCrossRefsMarkup(refs) {
  const resolved = refs.filter((ref) => ref.status === 'resolved' && ref.quotedTargetText);
  if (!resolved.length) return '';
  return `
    <div class="law-cross-refs" aria-label="Remissões citadas">
      <strong>Remissões citadas</strong>
      ${resolved.map((ref) => `
        <p><span>${escapeHtml(ref.refText || ref.targetLocator || '')}</span> ${escapeHtml(ref.quotedTargetText || '')}</p>
      `).join('')}
    </div>
  `;
}

function lawRelatedMarkup(section) {
  const questions = section.questionLinks || [];
  const relatedQuestions = section.relatedQuestionLinks || [];
  const comments = section.commentLinks || [];
  if (!questions.length && !relatedQuestions.length && !comments.length) return '';
  return `
    <details class="law-related">
      <summary>Questões vinculadas a este dispositivo</summary>
      ${questions.length ? `
        <div class="law-related-block">
          <strong>Questões que citam o dispositivo</strong>
          ${questions.map((question) => `
            <a href="${escapeAttr(questionLink(question.questionId))}" data-question-id="${escapeAttr(question.questionId)}">
              #${Number(question.questionId || 0).toLocaleString('pt-BR')} - ${escapeHtml(question.evidence || question.assunto || '')}
            </a>
          `).join('')}
        </div>
      ` : ''}
      ${relatedQuestions.length ? `
        <div class="law-related-block">
          <strong>Questões relacionadas ao conteúdo</strong>
          ${relatedQuestions.map((question) => `
            <a href="${escapeAttr(questionLink(question.questionId))}" data-question-id="${escapeAttr(question.questionId)}">
              #${Number(question.questionId || 0).toLocaleString('pt-BR')} - ${escapeHtml(question.assunto || question.evidence || '')}
            </a>
          `).join('')}
        </div>
      ` : ''}
      ${comments.length ? `
        <div class="law-related-block">
          <strong>Comentários de professor ligados a citação exata</strong>
          ${comments.map((comment) => `<p>${escapeHtml(comment.excerpt || comment.evidence || '')}</p>`).join('')}
        </div>
      ` : ''}
    </details>
  `;
}

function lawStatusLabel(status) {
  return {
    validated_current: 'vigente validada',
    historical_revoked: 'histórico/revogada',
    needs_verification: 'pendente',
    import_error: 'erro de importação',
    draft: 'rascunho'
  }[status] || status || 'sem status';
}

function buildNormativeReviewParams() {
  const params = new URLSearchParams({ limit: '120' });
  if (els.normativeRecommendationFilter.value) params.set('recomendacao', els.normativeRecommendationFilter.value);
  if (els.normativeSecurityFilter.value) params.set('nivelSeguranca', els.normativeSecurityFilter.value);
  if (els.normativeChangedFilter.value) params.set('mudancaGabarito', els.normativeChangedFilter.value);
  if (els.normativeReviewStatusFilter.value) params.set('reviewStatus', els.normativeReviewStatusFilter.value);
  if (els.normativeTeachingStatusFilter.value) params.set('teachingStatus', els.normativeTeachingStatusFilter.value);
  if (state.filters.materia) params.set('materia', state.filters.materia);
  for (const materia of state.filters.excludedMaterias) params.append('excludeMateria', materia);
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
  state.inlineSupportTab = 'comment';
  state.sawComment = false;
  state.openedTheory = false;
  resetQuestionTimer();
  startTimer();

  const question = await api(`/api/questions/${questionId}`);
  if (question.error) {
    state.theoryUrl = '';
    els.openTheory.disabled = true;
    if (els.openQuickTheory) els.openQuickTheory.disabled = true;
    renderQuestionSituationTone(null);
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

function scrollToStatementStart() {
  const target = els.statement?.closest('.question-card') || els.statement;
  if (!target) return;
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
  });
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
    state.currentLawEditMode = false;
    state.historicalCommentEditMode = false;
  }
  state.currentQuestion = question;
  const adaptiveReason = options.adaptiveTarget?.reasonText || question.adaptive?.reasonText || '';
  const meta = question.metadata;
  els.questionTitle.textContent = 'Questão';
  els.questionMeta.textContent = [meta.banca, meta.ano, meta.materia, meta.assunto].filter(Boolean).join(' • ');
  els.questionQuickStatus.textContent = adaptiveReason || questionQuickStatus(question);
  renderQuestionBadges(question);
  renderMastery(question.mastery);
  renderQuestionSituationTone(question);
  els.statement.innerHTML = formatStatementHtml(question) || question.statementHtml || `<p>${escapeHtml(question.statementText || 'Sem enunciado')}</p>`;
  applyStatementLengthClass(question);
  renderAnswerStatus(question);

  const alternatives = getDisplayAlternatives(question);
  els.alternatives.innerHTML = alternatives.map((alternative) => `
    <label class="alternative" data-letter="${escapeAttr(alternative.letter)}" data-display-letter="${escapeAttr(alternative.displayLetter || alternative.letter)}">
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
  const hasQuickTheory = hasQuickTheorySupport(question);
  if (els.openQuickTheory) {
    els.openQuickTheory.disabled = !hasQuickTheory || !canRevealExplanation(question);
    els.openQuickTheory.textContent = hasQuickTheory ? 'Teoria rápida' : 'Teoria rápida indisponível';
  }
  els.openTheory.disabled = !state.theoryUrl;
  els.openTheory.textContent = 'PDF de teoria';
  els.openTheory.title = question.theory?.available
    ? `Abrir teoria: ${question.theory.title}`
    : 'PDF de teoria não encontrado para este assunto';
  const hasSupportExplanation = Boolean(
    canRevealExplanation(question) && (
      question.comment.html
      || question.comment.text
      || hasQuickTheory
      || question.normativeUpdate?.exists
      || (
        question.currentLawAnswer?.exists
        || question.normativeTeachingComment?.exists
        || question.metadata?.desatualizada
      )
    )
  );
  const hasTeachingSupport = Boolean(
    canRevealCurrentLawAnswer(question) && (
      question.currentLawAnswer?.exists
      || question.normativeTeachingComment?.exists
      || question.metadata?.desatualizada
    )
  );
  els.openTeaching.disabled = !hasTeachingSupport;
  els.toggleComment.disabled = !hasSupportExplanation;
  els.openTeaching.textContent = 'Resposta pela legislacao atual';
  els.toggleComment.textContent = 'Explicação histórica';
  if (els.supportTabTeaching) {
    els.supportTabTeaching.disabled = !hasTeachingSupport;
  }
  const hasCluster = Boolean(question.adaptive?.exists && question.adaptive?.clusterId);
  const isStatsOnlyCluster = question.adaptive?.clusterPolicy === 'stats_only';
  els.showSimilar.disabled = !hasCluster;
  els.showSimilar.textContent = isStatsOnlyCluster ? 'Outras do assunto' : 'Semelhantes';
  els.similarQuestions.disabled = !hasCluster || isStatsOnlyCluster;
  els.similarQuestions.textContent = isStatsOnlyCluster ? 'Outras do assunto' : 'Ver semelhantes';
  syncNormativeSupportAvailability(question);
  syncQuickTheoryAvailability(question);

  const answering = question.answering || {};
  const historicalAnswer = answering.historicalAnswer || question.comment.historicalAnswer || question.comment.extractedAnswer || '';
  const studyAnswer = answering.studyAnswer || question.comment.studyAnswer || '';
  const info = [
    question.comment.userEditedAt ? 'comentário atualizado por você' : '',
    question.comment.sourceType === 'ai' ? 'gerado por IA' : '',
    historicalAnswer ? `Gabarito histórico: ${historicalAnswer}` : '',
    question.comment.professor || '',
    question.comment.aiModel || ''
  ].filter(Boolean).join(' - ');
  els.commentInfo.textContent = [
    question.comment.userEditedAt ? 'comentário atualizado por você' : '',
    question.comment.sourceType === 'ai' ? 'gerado por IA' : '',
    historicalAnswer ? `Gabarito histórico: ${historicalAnswer}` : '',
    question.comment.professor || '',
    question.comment.aiModel || ''
  ].filter(Boolean).join(' - ') || info;
  renderHistoricalCommentPanel(question);
  renderNormativeAlert(question);
  renderNormativeTeachingPanel(question);
  renderNormativePanel(question);
  renderAppliedTheoryPanel(question);
  renderQuickTheoryPanel(question);
  renderTheoryPanel(question);
  renderHistoryPanel(question);
  renderSimilarPanelIntro(question);
  renderStudyStatusControl(question);

  renderAnswerResultBox();
  renderSelectedAlternative();
  updateAnswerActions();
  renderSupportVisibility();
  renderInlineSupportCard();

  if (previousQuestionId !== nextQuestionId && options.scrollToStatement !== false) {
    scrollToStatementStart();
  }
}

function renderHistoricalCommentPanel(question) {
  if (!els.commentBody) return;
  const answering = question.answering || {};
  const historicalAnswer = answering.historicalAnswer || question.comment?.historicalAnswer || question.comment?.extractedAnswer || '';
  const studyAnswer = answering.studyAnswer || question.comment?.studyAnswer || '';
  const historicalWarning = question.metadata?.desatualizada
    && historicalAnswer
    && studyAnswer
    && normalizeAnswerText(historicalAnswer) !== normalizeAnswerText(studyAnswer)
    ? `<p class="normative-warning is-warning">Atenção: este comentário explica o gabarito original. Pela legislação atual, o gabarito de estudo é ${escapeHtml(currentAnswerLabel(studyAnswer))}.</p>`
    : '';
  const userEditedNotice = question.comment?.userEditedAt
    ? `<p class="historical-user-edit-notice">Comentário atualizado por você${question.comment.userEditedAt ? ` em ${escapeHtml(formatFullDate(question.comment.userEditedAt))}` : ''}.</p>`
    : '';
  const html = question.comment?.html || (question.comment?.text ? `<p>${escapeHtml(question.comment.text)}</p>` : '');
  const canEdit = canEditHistoricalComment();
  setHistoricalCommentStatus('');
  if (!canEdit) {
    state.historicalCommentEditMode = false;
  }

  if (state.historicalCommentEditMode && canEdit) {
    els.commentBody.innerHTML = `
      ${userEditedNotice}
      ${historicalWarning}
      <section class="historical-comment-editor-card" data-historical-comment-card>
        ${historicalCommentToolbar({ editing: true })}
        <div
          class="historical-comment-editor"
          data-historical-comment-editor
          contenteditable="true"
          spellcheck="true"
          aria-label="Editor da explicação histórica"
        >${html || '<p></p>'}</div>
        ${question.metadata?.desatualizada ? `
          <label class="historical-comment-option">
            <input type="checkbox" data-historical-comment-clear-outdated>
            <span>Esta questão não está mais desatualizada</span>
          </label>
        ` : ''}
      </section>
    `;
    return;
  }

  els.commentBody.innerHTML = `
    ${userEditedNotice}
    ${historicalWarning}
    <section class="historical-comment-view" data-historical-comment-card>
      ${canEdit ? historicalCommentToolbar({ editing: false }) : ''}
      <div class="historical-comment-content">
        ${html || `<p class="empty">${escapeHtml('Comentário ainda não coletado.')}</p>`}
      </div>
    </section>
  `;
}

function historicalCommentToolbar({ editing }) {
  const fontFamilies = [
    ['Arial, Helvetica, sans-serif', 'Arial'],
    ['Georgia, serif', 'Georgia'],
    ['Times New Roman, Times, serif', 'Times'],
    ['Verdana, Geneva, sans-serif', 'Verdana'],
    ['Courier New, Courier, monospace', 'Mono']
  ];
  const fontSizes = [
    ['12px', '12'],
    ['14px', '14'],
    ['16px', '16'],
    ['18px', '18'],
    ['20px', '20'],
    ['24px', '24'],
    ['28px', '28']
  ];
  const lineHeights = [
    ['1.2', '1.2'],
    ['1.4', '1.4'],
    ['1.6', '1.6'],
    ['1.8', '1.8'],
    ['2', '2.0']
  ];
  const colorButtons = [
    ['#0f172a', 'Preto'],
    ['#1d4ed8', 'Azul'],
    ['#15803d', 'Verde'],
    ['#b45309', 'Âmbar'],
    ['#dc2626', 'Vermelho']
  ];
  if (!editing) {
    return `
      <div class="historical-comment-toolbar" data-historical-comment-toolbar>
        <button class="button button-secondary" type="button" data-action="historical-comment-edit">Editar</button>
      </div>
    `;
  }
  return `
    <div class="historical-comment-toolbar is-editing" data-historical-comment-toolbar>
      <div class="historical-format-tools" aria-label="Formatação da explicação histórica">
        <button class="format-button" type="button" title="Negrito" data-action="historical-comment-format" data-command="bold"><strong>B</strong></button>
        <button class="format-button" type="button" title="Itálico" data-action="historical-comment-format" data-command="italic"><em>I</em></button>
        <button class="format-button" type="button" title="Sublinhado" data-action="historical-comment-format" data-command="underline"><span class="format-underline">U</span></button>
        <button class="format-button" type="button" title="Tachado" data-action="historical-comment-format" data-command="strikeThrough"><s>S</s></button>
        <span class="format-divider"></span>
        <button class="format-button" type="button" title="Alinhar à esquerda" data-action="historical-comment-format" data-command="justifyLeft"><span class="format-align is-left"></span></button>
        <button class="format-button" type="button" title="Centralizar" data-action="historical-comment-format" data-command="justifyCenter"><span class="format-align is-center"></span></button>
        <button class="format-button" type="button" title="Alinhar à direita" data-action="historical-comment-format" data-command="justifyRight"><span class="format-align is-right"></span></button>
        <span class="format-divider"></span>
        <button class="format-button" type="button" title="Reduzir recuo" data-action="historical-comment-format" data-command="outdent"><span class="format-indent is-outdent"></span></button>
        <button class="format-button" type="button" title="Aumentar recuo" data-action="historical-comment-format" data-command="indent"><span class="format-indent is-indent"></span></button>
        <span class="format-divider"></span>
        <select class="historical-format-select is-font-family" aria-label="Fonte" title="Fonte" data-historical-comment-font-family>
          <option value="">Fonte</option>
          ${fontFamilies.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join('')}
        </select>
        <select class="historical-format-select is-font-size" aria-label="Tamanho da fonte" title="Tamanho da fonte" data-historical-comment-font-size>
          <option value="">Tamanho</option>
          ${fontSizes.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join('')}
        </select>
        <select class="historical-format-select is-line-height" aria-label="Espaçamento entre linhas" title="Espaçamento entre linhas" data-historical-comment-line-height>
          <option value="">Linhas</option>
          ${lineHeights.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join('')}
        </select>
        <span class="format-divider"></span>
        ${colorButtons.map(([color, label]) => `
          <button
            class="format-swatch"
            type="button"
            title="${escapeAttr(label)}"
            style="--swatch-color: ${escapeAttr(color)}"
            data-action="historical-comment-format"
            data-command="foreColor"
            data-value="${escapeAttr(color)}"
          ></button>
        `).join('')}
      </div>
      <div class="historical-edit-actions">
        <button class="button button-primary" type="button" data-action="historical-comment-save">Salvar</button>
        <button class="button button-secondary" type="button" data-action="historical-comment-cancel">Cancelar</button>
      </div>
    </div>
  `;
}

function canEditHistoricalComment() {
  return window.matchMedia?.('(min-width: 1181px)').matches;
}

async function handleHistoricalCommentAction(button, event) {
  const action = button.dataset.action || '';
  if (!action.startsWith('historical-comment-')) return;
  event.preventDefault();
  if (!canEditHistoricalComment()) return;

  if (action === 'historical-comment-edit') {
    state.historicalCommentEditMode = true;
    renderHistoricalCommentPanel(state.currentQuestion);
    renderInlineSupportCard();
    focusHistoricalCommentEditor();
    return;
  }

  if (action === 'historical-comment-cancel') {
    state.historicalCommentEditMode = false;
    renderHistoricalCommentPanel(state.currentQuestion);
    renderInlineSupportCard();
    return;
  }

  if (action === 'historical-comment-format') {
    applyHistoricalCommentFormat(button);
    return;
  }

  if (action === 'historical-comment-save') {
    await saveHistoricalCommentEdit(button);
  }
}

async function handleHistoricalCommentColor(input, event) {
  event.preventDefault();
  if (!canEditHistoricalComment()) return;
  applyHistoricalCommentFormat({ dataset: { command: 'foreColor', value: input.value || '#0f172a' } });
}

function handleHistoricalCommentStyleSelect(select, event, styleName) {
  event.preventDefault();
  if (!canEditHistoricalComment()) return;
  const value = select.value || '';
  if (!value) return;
  applyHistoricalCommentStyle(select, styleName, value);
  select.value = '';
}

function applyHistoricalCommentFormat(button) {
  const command = button.dataset.command || '';
  if (!command) return;
  const editor = findHistoricalCommentEditor(button);
  if (!editor) return;
  editor.focus();
  restoreHistoricalCommentSelection(editor);
  document.execCommand(command, false, button.dataset.value || null);
  saveHistoricalCommentSelection(editor);
  setHistoricalCommentStatus('');
}

function applyHistoricalCommentStyle(source, styleName, value) {
  const editor = findHistoricalCommentEditor(source);
  if (!editor) return;
  editor.focus();
  restoreHistoricalCommentSelection(editor);

  const selection = document.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!rangeIntersectsEditor(range, editor) || range.collapsed) {
    setHistoricalCommentStatus('Selecione um trecho do texto para aplicar a formatação.', true);
    return;
  }

  const span = document.createElement('span');
  if (styleName === 'fontSize') {
    span.style.fontSize = value;
  } else if (styleName === 'fontFamily') {
    span.style.fontFamily = value;
  } else if (styleName === 'lineHeight') {
    span.style.lineHeight = value;
  } else {
    return;
  }

  span.appendChild(range.extractContents());
  range.insertNode(span);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  selection.addRange(nextRange);
  saveHistoricalCommentSelection(editor);
  setHistoricalCommentStatus('');
}

function saveHistoricalCommentSelection(editor) {
  const selection = document.getSelection();
  if (!selection || !selection.rangeCount || !editor) return;
  const range = selection.getRangeAt(0);
  if (!rangeIntersectsEditor(range, editor)) return;
  state.historicalCommentSelection = range.cloneRange();
}

function restoreHistoricalCommentSelection(editor) {
  const range = state.historicalCommentSelection;
  if (!range || !editor || !rangeIntersectsEditor(range, editor)) return false;
  const selection = document.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function rangeIntersectsEditor(range, editor) {
  if (!range || !editor) return false;
  try {
    return editor.contains(range.commonAncestorContainer)
      || range.intersectsNode(editor);
  } catch {
    return false;
  }
}

function findHistoricalCommentEditor(source) {
  const root = source?.closest?.('[data-historical-comment-card]') || document;
  return root.querySelector?.('[data-historical-comment-editor]');
}

function focusHistoricalCommentEditor() {
  window.requestAnimationFrame(() => {
    const editor = (!els.inlineSupportCard?.hidden && els.inlineSupportBody?.querySelector('[data-historical-comment-editor]'))
      || els.commentBody?.querySelector('[data-historical-comment-editor]');
    editor?.focus();
  });
}

async function saveHistoricalCommentEdit(button) {
  if (!state.selectedId || !state.currentQuestion) return;
  const editor = findHistoricalCommentEditor(button);
  if (!editor) return;
  const html = editor.innerHTML.trim();
  const card = button.closest('[data-historical-comment-card]');
  const markNotOutdated = Boolean(card?.querySelector('[data-historical-comment-clear-outdated]')?.checked);
  setHistoricalCommentStatus('Salvando...');
  const result = await api(`/api/questions/${state.selectedId}/historical-comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, markNotOutdated })
  });
  if (result.error) {
    setHistoricalCommentStatus(result.error, true);
    return;
  }
  state.currentQuestion.comment = {
    ...state.currentQuestion.comment,
    ...(result.comment || {})
  };
  if (result.metadata) {
    state.currentQuestion.metadata = {
      ...state.currentQuestion.metadata,
      ...result.metadata
    };
  }
  state.historicalCommentEditMode = false;
  renderQuestionSituationTone(state.currentQuestion);
  renderQuestionBadges(state.currentQuestion);
  renderNormativeAlert(state.currentQuestion);
  renderNormativeTeachingPanel(state.currentQuestion);
  renderNormativePanel(state.currentQuestion);
  const hasTeachingSupport = Boolean(
    canRevealCurrentLawAnswer(state.currentQuestion) && (
      state.currentQuestion.currentLawAnswer?.exists
      || state.currentQuestion.normativeTeachingComment?.exists
      || state.currentQuestion.metadata?.desatualizada
    )
  );
  els.openTeaching.disabled = !hasTeachingSupport;
  if (els.supportTabTeaching) els.supportTabTeaching.disabled = !hasTeachingSupport;
  syncNormativeSupportAvailability(state.currentQuestion);
  renderSupportVisibility();
  renderHistoricalCommentPanel(state.currentQuestion);
  renderInlineSupportCard();
  setHistoricalCommentStatus('Explicação salva.');
}

function setHistoricalCommentStatus(message, isError = false) {
  if (!els.commentEditStatus) return;
  els.commentEditStatus.textContent = message || '';
  els.commentEditStatus.classList.toggle('is-error', Boolean(isError));
  els.commentEditStatus.hidden = !message;
}

function renderNormativeAlert(question) {
  const update = question.normativeUpdate;
  const currentLaw = question.currentLawAnswer;
  if (currentLaw?.exists && !question.metadata?.desatualizada) {
    if (!hasAnsweredCurrentPrompt(question)) {
      els.normativeAlert.hidden = true;
      els.normativeAlert.innerHTML = '';
      return;
    }
    renderCurrentLawAlert(currentLaw);
    return;
  }

  if (question.metadata?.desatualizada) {
    if (!canRevealCurrentLawAnswer(question)) {
      els.normativeAlert.className = 'normative-alert is-info';
      els.normativeAlert.innerHTML = `
        <div>
          <strong>Resposta pela legislacao atual</strong>
          <span>Disponivel apos registrar sua resposta.</span>
        </div>
      `;
      els.normativeAlert.hidden = false;
      return;
    }

    renderCurrentLawAlert(currentLaw);
    return;
  }
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

function renderCurrentLawAlert(currentLaw) {
  const status = currentLaw?.status || currentLaw?.currentLawStatus || 'needs_audit';
  const canAutoScore = currentLaw?.canAutoScore ?? currentLaw?.canAutoScoreCurrentLaw;
  const tone = status === 'discard'
    ? 'is-danger'
    : status === 'needs_audit' || status === 'no_valid_alternative'
      ? 'is-warning'
      : 'is-info';
  const detail = status === 'verified' && canAutoScore
    ? `Gabarito atual: ${currentAnswerLabel(currentLaw.currentAnswer)}`
    : status === 'no_valid_alternative'
      ? 'Sem alternativa compativel pela legislacao atual.'
      : status === 'discard'
        ? 'Fora da fila principal pela legislacao atual.'
        : 'Precisa auditoria; nao pontuar pela legislacao atual.';
  els.normativeAlert.className = `normative-alert ${tone}`;
  els.normativeAlert.innerHTML = `
    <div>
      <strong>Resposta pela legislacao atual</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
    <button class="button button-primary" type="button" data-action="show-teaching">Ver resposta atual</button>
  `;
  els.normativeAlert.hidden = false;
}

function renderNormativeTeachingPanel(question) {
  if (question.currentLawAnswer?.exists || question.metadata?.desatualizada) {
    if (!canRevealCurrentLawAnswer(question)) {
      els.teachingInfo.textContent = 'bloqueado ate a tentativa';
      els.supportTeachingBody.innerHTML = '<p class="empty">A resposta pela legislacao atual fica disponivel depois que voce registrar uma alternativa.</p>';
      return;
    }
    renderCurrentLawAnswerPanel(question);
    return;
  }

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
  els.teachingInfo.textContent = teaching.currentAnswer ? 'disponivel' : 'sem resposta segura';

  const policyMessage = isDiscard
    ? '<p class="normative-warning is-danger">Questão não recomendada para estudo sem reformulação.</p>'
    : needsManual
      ? '<p class="normative-warning is-warning">Esta questão precisa de revisão manual antes de ser usada para correção segura.</p>'
      : '';
  const answer = teaching.currentAnswer
    ? currentAnswerLabel(teaching.currentAnswer)
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
    </div>
  `;
}

function renderCurrentLawAnswerPanel(question) {
  const answer = question.currentLawAnswer || { exists: false, currentLawStatus: 'needs_audit' };
  if (state.currentLawEditMode) {
    els.teachingInfo.textContent = 'editando';
    els.supportTeachingBody.innerHTML = currentLawEditFormMarkup(question, answer);
    return;
  }
  const status = answer.status || answer.currentLawStatus || 'needs_audit';
  const canAutoScore = answer.canAutoScore ?? answer.canAutoScoreCurrentLaw;
  const canScore = Boolean(canAutoScore && answer.currentAnswer && status === 'verified');
  const currentAnswer = canScore
    ? currentAnswerLabel(answer.currentAnswer)
    : status === 'no_valid_alternative'
      ? 'sem alternativa compativel pela legislacao atual'
      : 'nao definido para pontuacao automatica';
  const why = answer.teacherExplanation
    || (status === 'no_valid_alternative'
      ? 'As alternativas disponiveis nao ficam compativeis com a regra vigente.'
      : status === 'discard'
        ? 'Esta questao foi retirada da fila principal de estudo pela legislacao atual.'
        : 'Esta questao ainda precisa de auditoria antes de ser corrigida pela legislacao atual.');
  const foundation = [answer.legalBasis, answer.articleReference, answer.articleExcerpt]
    .filter(Boolean)
    .join('\n\n');
  const conclusion = answer.studyConclusion
    || (canScore
      ? 'Use este gabarito apenas para estudo pela legislacao atual.'
      : 'Nao use o gabarito historico para corrigir esta questao no modo de legislacao atual.');

  els.teachingInfo.textContent = canScore ? 'disponivel' : 'sem pontuacao';
  els.supportTeachingBody.innerHTML = `
    <div class="teaching-v3-card">
      <div class="teaching-edit-toolbar">
        <div>
          <strong>Resposta atual</strong>
          <span>${answer.updatedAt ? `atualizada em ${escapeHtml(formatFullDate(answer.updatedAt))}` : 'registro da legislação atual'}</span>
        </div>
        <div class="teaching-edit-actions">
          <button class="button button-secondary" type="button" data-action="current-law-edit">Editar resposta atual</button>
        </div>
      </div>
      ${teachingV3Section('Gabarito pela legislacao atual', currentAnswer, { highlight: true })}
      ${teachingV3Section('Por que?', why)}
      ${teachingV3Section('Fundamento', foundation)}
      ${teachingV3Section('Regra em resumo', answer.ruleSummary || '')}
      ${teachingV3Section('Conclusao para estudo', conclusion)}
    </div>
  `;
}

function currentLawEditFormMarkup(question, answer) {
  const status = answer.status || answer.currentLawStatus || 'needs_audit';
  const historicalAnswer = answer.historicalAnswer || question.answering?.historicalAnswer || question.comment?.historicalAnswer || '';
  const expectedFormat = question.metadata?.tipo === 'CERTO_ERRADO'
    ? 'Use CERTO ou ERRADO.'
    : 'Use A, B, C, D ou E.';
  return `
    <form class="teaching-edit-form" data-current-law-edit-form>
      <div class="teaching-edit-toolbar">
        <div>
          <strong>Editar Resposta atual</strong>
          <span>Altera a fonte canonica de estudo pela legislação atual.</span>
        </div>
        <div class="teaching-edit-actions">
          <button class="button button-primary" type="button" data-action="current-law-save-edit">Salvar</button>
          <button class="button button-secondary" type="button" data-action="current-law-cancel-edit">Cancelar</button>
        </div>
      </div>
      <p class="normative-note">Gabarito historico: ${escapeHtml(currentAnswerLabel(historicalAnswer))}. ${escapeHtml(expectedFormat)}</p>
      <div class="normative-summary-grid">
        <label class="teaching-edit-field">
          <span>Status</span>
          <select name="currentLawStatus">
            ${currentLawStatusOption('verified', 'Verificada', status)}
            ${currentLawStatusOption('needs_audit', 'Precisa auditoria', status)}
            ${currentLawStatusOption('no_valid_alternative', 'Sem alternativa valida', status)}
            ${currentLawStatusOption('discard', 'Descartar do estudo atual', status)}
          </select>
        </label>
        <label class="teaching-edit-field">
          <span>Gabarito atual</span>
          <input name="currentAnswer" value="${escapeAttr(answer.currentAnswer || '')}" placeholder="${escapeAttr(question.metadata?.tipo === 'CERTO_ERRADO' ? 'CERTO ou ERRADO' : 'A, B, C, D ou E')}">
        </label>
      </div>
      <label class="checkline">
        <input name="canAutoScore" type="checkbox" ${answer.canAutoScore || answer.canAutoScoreCurrentLaw ? 'checked' : ''}>
        <span>Pontuar automaticamente quando status for verificada</span>
      </label>
      ${teachingEditTextarea('Por que?', 'teacherExplanation', answer.teacherExplanation || '')}
      ${teachingEditTextarea('Fundamento', 'legalBasis', answer.legalBasis || '')}
      ${teachingEditTextarea('Referência do artigo/dispositivo', 'articleReference', answer.articleReference || '')}
      ${teachingEditTextarea('Trecho oficial curto', 'articleExcerpt', answer.articleExcerpt || '')}
      ${teachingEditTextarea('Regra em resumo', 'ruleSummary', answer.ruleSummary || '')}
      ${teachingEditTextarea('Complementação de professor', 'professorComplement', answer.professorComplement || '')}
      ${teachingEditTextarea('Conclusão para estudo', 'studyConclusion', answer.studyConclusion || '')}
      <label class="teaching-edit-field">
        <span>URL da fonte</span>
        <input name="sourceUrl" value="${escapeAttr(answer.sourceUrl || '')}">
      </label>
    </form>
  `;
}

function currentLawStatusOption(value, label, current) {
  return `<option value="${escapeAttr(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function syncCurrentLawAutoScoreControl(target) {
  const select = target?.closest?.('select[name="currentLawStatus"]');
  if (!select) return false;
  const form = select.closest('[data-current-law-edit-form]');
  const checkbox = form?.querySelector('input[name="canAutoScore"]');
  if (checkbox) {
    checkbox.checked = select.value === 'verified';
  }
  return true;
}

async function saveCurrentLawAnswerEdit() {
  if (!state.selectedId) return;
  const form = els.supportTeachingBody.querySelector('[data-current-law-edit-form]');
  if (!form) return;
  const data = new FormData(form);
  setCurrentLawEditButtonsDisabled(true);
  try {
    const result = await api(`/api/questions/${state.selectedId}/current-law-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentLawStatus: data.get('currentLawStatus') || 'needs_audit',
        currentAnswer: data.get('currentAnswer') || '',
        canAutoScore: Boolean(data.get('canAutoScore')),
        teacherExplanation: data.get('teacherExplanation') || '',
        legalBasis: data.get('legalBasis') || '',
        articleReference: data.get('articleReference') || '',
        articleExcerpt: data.get('articleExcerpt') || '',
        ruleSummary: data.get('ruleSummary') || '',
        professorComplement: data.get('professorComplement') || '',
        studyConclusion: data.get('studyConclusion') || '',
        sourceUrl: data.get('sourceUrl') || ''
      })
    });
    if (result.error) throw new Error(result.error);
    state.currentQuestion.currentLawAnswer = result.currentLawAnswer;
    if (result.metadata) {
      state.currentQuestion.metadata = {
        ...state.currentQuestion.metadata,
        ...result.metadata
      };
    }
    if (result.answering) {
      state.currentQuestion.answering = {
        ...state.currentQuestion.answering,
        ...result.answering
      };
    }
    if (result.normativeTeachingComment) {
      state.currentQuestion.normativeTeachingComment = result.normativeTeachingComment;
    }
    state.currentLawEditMode = false;
    renderNormativeAlert(state.currentQuestion);
    renderNormativeTeachingPanel(state.currentQuestion);
    renderQuestionBadges(state.currentQuestion);
    updateAnswerActions();
  } catch (error) {
    els.teachingInfo.textContent = `erro ao salvar: ${error.message}`;
    setCurrentLawEditButtonsDisabled(false);
  }
}

function setCurrentLawEditButtonsDisabled(disabled) {
  els.supportTeachingBody
    .querySelectorAll('[data-action="current-law-save-edit"]')
    .forEach((button) => {
      button.disabled = disabled;
    });
}

function currentLawStatusLabel(status) {
  return {
    verified: 'verificada',
    needs_audit: 'precisa auditoria',
    no_valid_alternative: 'sem alternativa compativel',
    discard: 'fora da fila principal'
  }[status] || 'precisa auditoria';
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

  if (question.currentLawAnswer?.exists) {
    const currentLaw = question.currentLawAnswer;
    const status = currentLaw.status || currentLaw.currentLawStatus || 'needs_audit';
    const currentAnswer = currentLaw.currentAnswer
      ? currentAnswerLabel(currentLaw.currentAnswer)
      : status === 'no_valid_alternative'
        ? 'sem alternativa compatível'
        : 'não definido para pontuação';
    els.normativeSupportInfo.textContent = 'registro antigo de auditoria';
    els.supportNormativeBody.innerHTML = `
      <div class="normative-card">
        <p class="normative-warning is-info">Esta análise normativa é um registro antigo de auditoria. A resposta de estudo é definida pela tabela de resposta pela legislação atual.</p>
        <div class="normative-summary-grid">
          ${normativeField('Resposta atual de estudo', currentAnswer)}
          ${normativeField('Status atual', currentLawStatusLabel(status))}
        </div>
        <details class="normative-details">
          <summary>Dados antigos de auditoria</summary>
          <div class="normative-summary-grid">
            ${normativeField('Recomendação antiga', update.recomendacao)}
            ${normativeField('Segurança antiga', update.nivelSeguranca)}
            ${normativeField('Gabarito histórico', update.gabaritoBanco)}
            ${normativeField('Gabarito atualizado provável antigo', update.gabaritoAtualizadoProvavel)}
            ${normativeField('Mudança de gabarito antiga', update.mudancaGabarito)}
            ${normativeField('Fonte-base', update.fonteBase)}
          </div>
          ${normativeTextBlock('Por que estava desatualizada', update.porQueDesatualizada)}
          ${normativeTextBlock('Nova regra registrada na auditoria antiga', update.novaRegraEstadoAtual)}
          ${normativeTextBlock('Fundamento antigo', update.fundamentoJuridicoAtual)}
          ${normativeTextBlock('Observação antiga sobre o enunciado literal', update.observacaoEnunciadoLiteral)}
        </details>
      </div>
    `;
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

function renderAppliedTheoryPanel(question) {
  const card = question?.appliedTheoryCard;
  if (!els.supportAppliedTheoryBody) return;
  if (!card?.available) {
    if (els.appliedTheoryInfo) els.appliedTheoryInfo.textContent = 'indisponivel';
    els.supportAppliedTheoryBody.innerHTML = '<p class="empty">Teoria aplicada individual ainda nao disponivel para esta questao.</p>';
    return;
  }

  const canReveal = canRevealAppliedTheory(question);
  const statusLabel = appliedTheoryStatusLabel(card.cardStatus);
  if (els.appliedTheoryInfo) els.appliedTheoryInfo.textContent = statusLabel;

  if (!canReveal) {
    els.supportAppliedTheoryBody.innerHTML = `
      <div class="quick-theory-card">
        <strong class="quick-theory-title">Teoria aplicada a questao</strong>
        <p class="empty">Responda para liberar a regra aplicada, fundamento e conclusao desta questao.</p>
      </div>
    `;
    return;
  }

  if (card.cardStatus === 'needs_current_law_audit') {
    els.supportAppliedTheoryBody.innerHTML = `
      <div class="quick-theory-card">
        <strong class="quick-theory-title">Auditoria normativa pendente</strong>
        <p class="quick-theory-warning">${escapeHtml(card.showWarning || 'Esta questao precisa de auditoria normativa antes de receber teoria aplicada segura.')}</p>
        ${quickTheorySection('Ponto da questao', card.questionFocus)}
        ${quickTheorySection('Orientacao de estudo', card.studyConclusion)}
      </div>
    `;
    return;
  }

  const answerTitle = card.noValidAlternative
    ? 'Sem alternativa compativel pela legislacao vigente'
    : card.currentAnswer
      ? `Gabarito atual: ${currentAnswerLabel(card.currentAnswer)}`
      : card.historicalAnswer
        ? `Gabarito historico: ${currentAnswerLabel(card.historicalAnswer)}`
        : '';

  els.supportAppliedTheoryBody.innerHTML = `
    <div class="quick-theory-card applied-theory-card">
      <strong class="quick-theory-title">${escapeHtml(card.title || 'Teoria aplicada a questao')}</strong>
      ${card.showWarning ? `<p class="quick-theory-warning">${escapeHtml(card.showWarning)}</p>` : ''}
      ${quickTheorySection('O que a questao cobra', card.questionFocus)}
      ${answerTitle ? quickTheorySection('Gabarito pela regra de estudo', answerTitle) : ''}
      ${quickTheorySection('Dispositivo que resolve', card.primaryLegalLocator || card.legalBasis)}
      ${quickTheoryNormExcerpt(card.primaryExactExcerpt || card.articleExcerpt)}
      ${quickTheorySection('Aplicacao ao enunciado', card.appliedExplanation)}
      ${quickTheoryBullets(card.ruleSummaryBullets || [], 'Resumo para memorizar')}
      ${quickTheorySection('Pegadinha de prova', card.professorTip)}
      ${quickTheoryBullets(card.commonTraps || [], 'Armadilhas comuns')}
      ${quickTheorySection('Conclusao para estudo', card.studyConclusion)}
      ${(card.primaryExactExcerpt || card.articleExcerpt) ? quickTheoryOfficialText([{
        label: card.primaryLegalLocator || card.legalBasis,
        excerpt: card.primaryExactExcerpt || card.articleExcerpt,
        text: card.primaryExactExcerpt || card.articleExcerpt,
        sourceUrl: card.exactExcerptSourceUrl || card.sourceUrls?.[0] || ''
      }]) : ''}
    </div>
  `;
}

function canRevealAppliedTheory(question = state.currentQuestion) {
  const card = question?.appliedTheoryCard;
  if (!card?.available) return false;
  if (card.showBeforeAnswer) return true;
  return canRevealExplanation(question);
}

function appliedTheoryStatusLabel(status) {
  const labels = {
    published: 'aplicada',
    no_valid_alternative: 'sem alternativa',
    needs_current_law_audit: 'auditoria pendente',
    draft_needs_review: 'revisao',
    discarded: 'descartada',
    blocked: 'bloqueada'
  };
  return labels[status] || 'disponivel';
}

function renderQuickTheoryPanel(question) {
  const legalStudy = question?.legalStudy;
  if (!legalStudy?.available || !legalStudy.primaryCard) {
    if (els.quickTheoryInfo) els.quickTheoryInfo.textContent = 'indisponível';
    if (els.supportQuickTheoryBody) {
      els.supportQuickTheoryBody.innerHTML = '<p class="empty">Teoria rápida ainda não disponível para este ponto.</p>';
    }
    return;
  }

  const card = legalStudy.primaryCard;
  const articles = legalStudy.officialText?.articles || [];
  const isPanorama = legalStudy.mode === 'panorama'
    || card.displayKind === 'panorama'
    || card.displayMode === 'general_orientation_only';
  if (els.quickTheoryInfo) {
    els.quickTheoryInfo.textContent = isPanorama ? 'panorama do assunto' : (card.microtema || card.assunto || 'microteoria');
  }
  if (!els.supportQuickTheoryBody) return;

  if (isPanorama) {
    els.supportQuickTheoryBody.innerHTML = `
      <div class="quick-theory-card is-panorama">
        <strong class="quick-theory-title">Panorama do assunto</strong>
        <p class="quick-theory-warning">${escapeHtml(legalStudy.warning || 'Este e um panorama geral. Ainda nao ha microcard especifico validado para esta questao.')}</p>
        <details class="quick-theory-details">
          <summary>Ver panorama</summary>
          <div>
            <strong class="quick-theory-title">${escapeHtml(card.title || 'Panorama')}</strong>
            ${quickTheorySection('Orientacao geral', card.answerSummary || card.ruleSummary)}
            ${quickTheorySection('Fundamento', quickTheoryFoundation(card, articles))}
            ${quickTheoryBullets(card.bullets || [])}
            ${quickTheorySection('Pontos de atencao', card.professorNote || card.commonTraps)}
            ${quickTheoryOfficialText(articles)}
          </div>
        </details>
      </div>
    `;
    return;
  }

  els.supportQuickTheoryBody.innerHTML = `
    <div class="quick-theory-card">
      <strong class="quick-theory-title">${escapeHtml(card.title || 'Teoria rápida')}</strong>
      ${quickTheorySection('Regra que resolve esta questão', card.answerSummary || card.ruleSummary)}
      ${quickTheorySection('Fundamento', quickTheoryFoundation(card, articles))}
      ${quickTheoryBullets(card.bullets || [])}
      ${quickTheorySection('Pegadinha de prova', card.professorNote || card.commonTraps)}
      ${quickTheorySection('Como memorizar', card.memoryHook)}
      ${quickTheoryOfficialText(articles)}
      ${state.theoryUrl ? `
        <p class="quick-theory-secondary">
          <a class="button button-secondary" href="${escapeAttr(state.theoryUrl)}" target="_blank" rel="noopener">Abrir PDF completo</a>
        </p>
      ` : ''}
    </div>
  `;
}

function quickTheorySection(title, text) {
  if (!text) return '';
  return `
    <section class="quick-theory-section">
      <span>${escapeHtml(title)}</span>
      <p>${escapeHtml(text)}</p>
    </section>
  `;
}

function quickTheoryFoundation(card, articles) {
  const article = articles[0];
  if (article?.label) return article.label;
  const ref = card.sourceRefs?.[0];
  return ref?.label || '';
}

function quickTheoryBullets(bullets, title = 'Em resumo') {
  if (!Array.isArray(bullets) || !bullets.length) return '';
  return `
    <section class="quick-theory-section">
      <span>${escapeHtml(title)}</span>
      <ul>${bullets.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
  `;
}

function quickTheoryNormExcerpt(text) {
  if (!text) return '';
  return `
    <section class="quick-theory-section normative-text-block">
      <strong>Trecho da norma</strong>
      <p>${escapeHtml(text)}</p>
    </section>
  `;
}

function quickTheoryOfficialText(articles) {
  if (!Array.isArray(articles) || !articles.length) return '';
  return `
    <details class="quick-theory-official">
      <summary>Ver texto oficial</summary>
      ${articles.map((article) => `
        <article>
          <strong>${escapeHtml(article.label || article.articleRef || 'Texto oficial')}</strong>
          ${article.excerpt ? `<p>${escapeHtml(article.excerpt)}</p>` : ''}
          ${article.text && article.text !== article.excerpt ? `<blockquote>${escapeHtml(article.text)}</blockquote>` : ''}
          ${article.sourceUrl ? `<a href="${escapeAttr(article.sourceUrl)}" target="_blank" rel="noopener">Abrir fonte oficial</a>` : ''}
        </article>
      `).join('')}
    </details>
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

function canRevealCurrentLawAnswer(question = state.currentQuestion) {
  if (!question) return false;
  if (question.metadata?.desatualizada) return true;
  return canRevealExplanation(question);
}

function isAnswerFirstStudyMode() {
  return ['adaptive', 'smart', 'study'].includes(state.studyMode);
}

function hasAnsweredCurrentPrompt(question = state.currentQuestion) {
  return Boolean(
    question
    && state.answerResult
    && Number(state.answerResult.questionId) === Number(question.id)
  );
}

function canRevealExplanation(question = state.currentQuestion) {
  if (!question) return false;
  if (!isAnswerFirstStudyMode()) return true;
  return hasAnsweredCurrentPrompt(question);
}

function supportTabRequiresAnswer(tab) {
  return ['comment', 'normative', 'teaching', 'appliedTheory', 'quickTheory', 'history'].includes(tab);
}

function updateAnswerActions() {
  const selected = new FormData(els.answerForm).get('answer');
  const question = state.currentQuestion;
  const result = state.answerResult;
  const hasAlternatives = Boolean(question?.alternatives?.length);
  const hasExplanation = Boolean(
    question?.comment?.html
    || question?.comment?.text
    || question?.appliedTheoryCard?.available
    || question?.legalStudy?.available
    || question?.normativeUpdate?.exists
    || question?.currentLawAnswer?.exists
    || question?.normativeTeachingComment?.exists
    || question?.metadata?.desatualizada
  );
  const canRevealSupport = canRevealExplanation(question);
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
      els.secondaryExplain.disabled = !hasExplanation || !canRevealSupport;
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

    els.answerHint.textContent = nonScoringAnswerTitle(result);
    els.submitAnswer.textContent = 'Próxima questão';
    els.submitAnswer.dataset.action = 'next';
    els.submitAnswer.disabled = false;
    els.secondaryExplain.textContent = 'Ver explicação';
    els.secondaryExplain.dataset.action = 'explain';
    els.secondaryExplain.disabled = !hasExplanation || !canRevealSupport;
    return;
  }

  if (selected) {
    els.answerHint.textContent = 'Pronta para corrigir';
    els.submitAnswer.textContent = hasPreviousAnswer ? 'Responder novamente' : 'Responder';
    els.submitAnswer.dataset.action = 'respond';
    els.submitAnswer.disabled = !hasAlternatives;
    els.secondaryExplain.textContent = canRevealSupport ? 'Ver explicação' : 'Responda para liberar';
    els.secondaryExplain.dataset.action = 'explain';
    els.secondaryExplain.disabled = !hasExplanation || !canRevealSupport;
    return;
  }

  if (hasPreviousAnswer) {
    if (isAnswerFirstStudyMode() && !canRevealSupport) {
      els.answerHint.textContent = 'Responda para liberar a explicação';
      els.submitAnswer.textContent = 'Responder';
      els.submitAnswer.dataset.action = 'respond';
      els.submitAnswer.disabled = true;
      els.secondaryExplain.textContent = 'Responda para liberar';
      els.secondaryExplain.dataset.action = 'explain';
      els.secondaryExplain.disabled = true;
      return;
    }
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
  els.secondaryExplain.textContent = canRevealSupport ? 'Ver explicação' : 'Responda para liberar';
  els.secondaryExplain.dataset.action = 'explain';
  els.secondaryExplain.disabled = !hasExplanation || !canRevealSupport;
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
  renderNormativeAlert(state.currentQuestion);
  renderNormativeTeachingPanel(state.currentQuestion);
  els.toggleComment.disabled = !canRevealExplanation(state.currentQuestion);
  syncNormativeSupportAvailability(state.currentQuestion);
  syncQuickTheoryAvailability(state.currentQuestion);
  const hasTeachingSupportAfterAnswer = Boolean(
    canRevealCurrentLawAnswer(state.currentQuestion) && (
      state.currentQuestion?.currentLawAnswer?.exists
      || state.currentQuestion?.normativeTeachingComment?.exists
      || state.currentQuestion?.metadata?.desatualizada
    )
  );
  els.openTeaching.disabled = !hasTeachingSupportAfterAnswer;
  if (els.supportTabTeaching) {
    els.supportTabTeaching.disabled = !hasTeachingSupportAfterAnswer;
  }
  renderAnswerResultBox();
  renderSelectedAlternative();
  updateAnswerActions();
  renderSupportVisibility();
  renderInlineSupportCard();
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
  if (result.currentLawAnswer) {
    state.currentQuestion.currentLawAnswer = result.currentLawAnswer;
  }
  if (result.normativeTeachingComment) {
    state.currentQuestion.normativeTeachingComment = result.normativeTeachingComment;
  }
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
  if (question?.normativeTeachingComment?.exists) {
    badges.push('<span class="question-badge is-normative">Comentário atualizado</span>');
  }
  if (meta?.anulada) {
    badges.push('<span class="question-badge is-canceled">Anulada</span>');
  }
  if (question?.comment?.html || question?.comment?.text) {
    badges.push('<span class="question-badge is-commented">Comentada</span>');
  }
  if (!question?.comment?.studyAnswer) {
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

function renderQuestionSituationTone(question) {
  const isCanceled = Boolean(question?.metadata?.anulada);
  const isOutdated = Boolean(question?.metadata?.desatualizada);
  els.studyLayout?.classList.toggle('is-canceled-question', isCanceled);
  els.studyLayout?.classList.toggle('is-outdated-question', !isCanceled && isOutdated);
  document.body.classList.toggle('has-canceled-question', isCanceled);
  document.body.classList.toggle('has-outdated-question', !isCanceled && isOutdated);
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
    <span class="alternative-badge">${escapeHtml(alternative.displayLetter || alternative.letter)}</span>
    <span class="alternative-text">${escapeHtml(text)}</span>
  `;
}

function getDisplayAlternatives(question) {
  const alternatives = Array.isArray(question?.alternatives) ? question.alternatives : [];
  if (!shouldShuffleAlternatives(question)) {
    return alternatives.map((alternative) => ({
      ...alternative,
      displayLetter: alternative.letter
    }));
  }

  const sourceLetters = alternatives.map((alternative) => alternative.letter);
  const attemptNumber = Number(question.answerStats?.total || 0);
  const shuffled = seededShuffle(
    alternatives.map((alternative) => ({ ...alternative })),
    `${question.id || question.questionId || ''}:${attemptNumber}`
  );
  const sameOrder = shuffled.every((alternative, index) => alternative.letter === alternatives[index]?.letter);
  const ordered = sameOrder && shuffled.length > 1
    ? rotateArray(shuffled, (attemptNumber % (shuffled.length - 1)) + 1)
    : shuffled;

  return ordered.map((alternative, index) => ({
    ...alternative,
    displayLetter: sourceLetters[index] || alternative.letter
  }));
}

function shouldShuffleAlternatives(question) {
  const alternatives = Array.isArray(question?.alternatives) ? question.alternatives : [];
  if (String(question?.metadata?.tipo || '').toUpperCase() === 'CERTO_ERRADO') return false;
  if (Number(question?.answerStats?.total || 0) < 1) return false;
  if (alternatives.length < 3 || alternatives.length > 5) return false;

  const letters = alternatives.map((alternative) => normalizeAnswer(alternative.letter));
  const expectedLetters = ['A', 'B', 'C', 'D', 'E'].slice(0, alternatives.length);
  if (letters.some((letter, index) => letter !== expectedLetters[index])) return false;

  return !alternatives.some((alternative) => alternativeTextMentionsAlternativeLetter(alternative.text || ''))
    && !commentMentionsAlternativeLetters(question);
}

function alternativeTextMentionsAlternativeLetter(text) {
  const normalized = normalizeAnswerText(text);
  return /\b(?:alternativa|opcao|letra)\s+[a-e]\b/.test(normalized)
    || /\b[a-e]\s*\)/.test(normalized);
}

function commentMentionsAlternativeLetters(question) {
  const text = normalizeAnswerText(stripHtmlText([
    question?.comment?.text || '',
    question?.comment?.html || ''
  ].join(' ')));
  if (!text) return false;

  return /\b(?:gabarito|correta|incorreta)\s+(?:letra|alternativa)?\s*["']?[a-e]["']?\b/.test(text)
    || /\b(?:alternativa|opcao|letra)\s*["']?[a-e]["']?\s*(?:correta|incorreta|certa|errada)?\b/.test(text)
    || /\b[a-e]\s*[-–—]\s*(?:correta|incorreta|certa|errada)\b/.test(text);
}

function stripHtmlText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function seededShuffle(items, seedText) {
  const shuffled = [...items];
  let seed = hashSeed(seedText);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed);
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function rotateArray(items, offset) {
  if (!items.length) return items;
  const normalizedOffset = offset % items.length;
  return [...items.slice(normalizedOffset), ...items.slice(0, normalizedOffset)];
}

function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextSeed(seed) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
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
      <span><strong>Você errou!</strong> Gabarito: <strong>${escapeHtml(displayAnswerForCurrentQuestion(result.expectedAnswer || ''))}</strong>. ${resolution}${normative}</span>
    `;
  } else {
    els.answerResult.className = 'answer-result';
    const title = nonScoringAnswerTitle(result);
    els.answerResult.innerHTML = `
      <span class="answer-result-icon" aria-hidden="true">?</span>
      <span><strong>${escapeHtml(title)}</strong>. ${resolution}${normative}</span>
    `;
  }
  els.answerResult.hidden = false;
}

function nonScoringAnswerTitle(result) {
  if (result?.correctionMode === 'non_scoring') {
    const reason = result.nonScoringReason || '';
    if (reason === 'needs_audit') return 'Resposta registrada sem gabarito atual validado';
    if (reason === 'no_valid_alternative') return 'Resposta registrada sem alternativa atual compatível';
    if (reason === 'discard') return 'Resposta registrada sem pontuação';
  }
  return 'Resposta registrada sem gabarito';
}

function normativeAnswerWarning(result) {
  const currentLaw = result.currentLawAnswer;
  if (result.correctionMode === 'current_law' || currentLaw?.exists) {
    const reason = result.nonScoringReason || '';
    const text = reason === 'no_valid_alternative'
      ? 'Sem alternativa compativel pela legislacao atual. Tentativa registrada sem pontuacao.'
      : reason === 'discard'
        ? 'Questao fora da fila principal pela legislacao atual. Tentativa registrada sem pontuacao.'
        : reason === 'needs_audit'
          ? [
              'Questao pendente de auditoria pela legislacao atual.',
              currentLaw?.historicalAnswer ? `Gabarito historico cadastrado: ${displayCurrentAnswerLabel(currentLaw.historicalAnswer)}.` : '',
              'O gabarito historico nao foi usado para pontuar.'
            ].filter(Boolean).join(' ')
          : `Correcao feita pela legislacao atual. Gabarito atual: ${displayCurrentAnswerLabel(result.expectedAnswer || currentLaw?.currentAnswer || '')}.`;
    return `<span class="answer-result-note">${escapeHtml(text)}</span>`;
  }

  return '';
}

function expectedAlternativeLetter(expectedAnswer) {
  const expected = normalizeAnswer(expectedAnswer);
  if (!expected || !state.currentQuestion?.alternatives) {
    return '';
  }
  if (String(state.currentQuestion.metadata?.tipo || '').toUpperCase() === 'CERTO_ERRADO') {
    const certoErrado = state.currentQuestion.alternatives.find((item) => (
      normalizeAnswer(item.text) === expected
      || matchesCertoErradoAlias(expected, normalizeAnswer(item.text))
    ));
    if (certoErrado) {
      return certoErrado.letter || '';
    }
  }

  if (/^[A-E]$/.test(expected)) {
    return expected;
  }

  const alternative = state.currentQuestion.alternatives.find((item) => normalizeAnswer(item.text) === expected);
  return alternative?.letter || '';
}

function displayAnswerForCurrentQuestion(answer) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return '';
  if (normalized === 'CERTO' || normalized === 'ERRADO') return normalized;
  const originalLetter = expectedAlternativeLetter(normalized);
  if (originalLetter) {
    const label = els.alternatives.querySelector(`.alternative[data-letter="${cssEscape(originalLetter)}"]`);
    return label?.dataset.displayLetter || originalLetter;
  }
  return answer;
}

function displayCurrentAnswerLabel(answer) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return '';
  if (normalized === 'CERTO' || normalized === 'ERRADO') return normalized;
  const displayed = displayAnswerForCurrentQuestion(normalized);
  return displayed ? `Alternativa ${displayed}` : currentAnswerLabel(answer);
}

function matchesCertoErradoAlias(answer, text) {
  return (answer === 'C' && text === 'CERTO') || (answer === 'E' && text === 'ERRADO');
}

function applyStatementLengthClass(question) {
  const card = els.statement?.closest('.question-card');
  if (!card) return;
  const textLength = String(question?.statementText || els.statement?.textContent || '').replace(/\s+/g, ' ').trim().length;
  card.classList.remove('is-short-statement', 'is-medium-statement', 'is-long-statement', 'is-very-long-statement');
  if (textLength >= 1600) {
    card.classList.add('is-very-long-statement');
  } else if (textLength >= 900) {
    card.classList.add('is-long-statement');
  } else if (textLength >= 360) {
    card.classList.add('is-medium-statement');
  } else {
    card.classList.add('is-short-statement');
  }
}

function preferredSupportTab(question = state.currentQuestion) {
  const canRevealCurrentLaw = canRevealCurrentLawAnswer(question);
  const hasHistoricalComment = Boolean(question?.comment?.html || question?.comment?.text);
  if (question?.comment?.userEditedAt && hasHistoricalComment) return 'comment';
  if (hasAppliedTheorySupport(question) && canRevealAppliedTheory(question)) return 'appliedTheory';
  if (canRevealCurrentLaw && (question?.currentLawAnswer?.exists || question?.metadata?.desatualizada)) return 'teaching';
  if (canRevealCurrentLaw && question?.normativeTeachingComment?.exists) return 'teaching';
  if (hasHistoricalComment) return 'comment';
  if (question?.normativeUpdate?.exists) return 'normative';
  if (hasQuickTheorySupport(question)) return 'quickTheory';
  return 'comment';
}

function supportTabTitle(tab, question = state.currentQuestion) {
  const titles = {
    teaching: ['Resposta pela legislacao atual', 'Gabarito atual, fundamento e conclusao de estudo'],
    appliedTheory: ['Teoria aplicada', 'Regra que resolve esta questao'],
    quickTheory: ['Teoria rapida', 'Regra, artigo e pegadinha de prova'],
    comment: ['Explicacao historica', 'Comentario do professor e gabarito historico'],
    normative: ['Atualizacao normativa', 'Analise auxiliar da desatualizacao'],
    theory: ['Teoria relacionada', 'Material em PDF da materia/assunto'],
    history: ['Historico da questao', 'Tentativas registradas no banco local'],
    similar: question?.adaptive?.clusterPolicy === 'stats_only'
      ? ['Outras do assunto', 'Agrupamento amplo para consulta']
      : ['Questoes semelhantes', 'Representantes e variacoes de reforco']
  };
  return titles[tab] || titles.comment;
}

function inlineSupportTabs() {
  return [
    ['teaching', 'Resposta atual', els.supportTabTeaching],
    ['appliedTheory', 'Teoria aplicada', els.supportTabAppliedTheory],
    ['quickTheory', 'Teoria rápida', els.supportTabQuickTheory],
    ['normative', 'Atualização normativa', els.supportTabNormative],
    ['comment', 'Explicação histórica', null],
    ['theory', 'PDF', null],
    ['history', 'Histórico', null],
    ['similar', 'Semelhantes', null]
  ].filter(([, , sourceButton]) => !sourceButton || !sourceButton.hidden);
}

function inlineSupportBodyForTab(tab) {
  const sources = {
    teaching: els.supportTeachingBody,
    appliedTheory: els.supportAppliedTheoryBody,
    quickTheory: els.supportQuickTheoryBody,
    normative: els.supportNormativeBody,
    comment: els.commentBody,
    theory: els.supportTheoryBody,
    history: els.supportHistoryBody,
    similar: els.supportSimilarBody
  };
  return sources[tab]?.innerHTML || '<p class="empty">Conteúdo indisponível.</p>';
}

function canUseInlineSupportTab(tab, sourceButton, question = state.currentQuestion) {
  if (sourceButton?.disabled) return false;
  if (supportTabRequiresAnswer(tab) && !canRevealExplanation(question)) return false;
  if (tab === 'appliedTheory' && !canRevealAppliedTheory(question)) return false;
  if (tab === 'quickTheory' && !hasQuickTheorySupport(question)) return false;
  if (tab === 'normative' && !hasNormativeSupport(question)) return false;
  if (tab === 'teaching') {
    return Boolean(question?.currentLawAnswer?.exists || question?.normativeTeachingComment?.exists || question?.metadata?.desatualizada);
  }
  return true;
}

function renderInlineSupportCard() {
  if (!els.inlineSupportCard) return;
  const question = state.currentQuestion;
  const shouldShow = Boolean(question && hasAnsweredCurrentPrompt(question) && canRevealExplanation(question));
  const wasHidden = els.inlineSupportCard.hidden;
  els.inlineSupportCard.hidden = !shouldShow;
  if (!shouldShow) {
    if (els.inlineSupportBody) els.inlineSupportBody.innerHTML = '';
    state.inlineSupportRenderKey = '';
    return;
  }

  const tabs = inlineSupportTabs();
  const usableTabs = tabs.filter(([tab, , sourceButton]) => canUseInlineSupportTab(tab, sourceButton, question));
  if (!usableTabs.some(([tab]) => tab === state.inlineSupportTab)) {
    const preferred = preferredSupportTab(question);
    state.inlineSupportTab = usableTabs.some(([tab]) => tab === preferred) ? preferred : (usableTabs[0]?.[0] || 'comment');
  }

  els.inlineSupportTabs.innerHTML = tabs.map(([tab, label, sourceButton]) => {
    const disabled = !canUseInlineSupportTab(tab, sourceButton, question);
    return `<button class="support-tab${tab === state.inlineSupportTab ? ' is-active' : ''}" type="button" data-inline-support-tab="${escapeAttr(tab)}" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>`;
  }).join('');

  const [title, subtitle] = supportTabTitle(state.inlineSupportTab, question);
  els.inlineSupportTitle.textContent = title;
  els.inlineSupportSubtitle.textContent = subtitle;
  const bodyHtml = inlineSupportBodyForTab(state.inlineSupportTab);
  const renderKey = [
    question.id || question.questionId || '',
    state.inlineSupportTab,
    state.answerResult?.questionId || '',
    question.comment?.userEditedAt || '',
    bodyHtml.length
  ].join('|');
  const shouldResetScroll = wasHidden || renderKey !== state.inlineSupportRenderKey;
  els.inlineSupportBody.innerHTML = bodyHtml;
  state.inlineSupportRenderKey = renderKey;
  if (shouldResetScroll) {
    resetInlineSupportScroll();
  }
}

function resetInlineSupportScroll() {
  if (!els.inlineSupportBody) return;
  els.inlineSupportBody.scrollTop = 0;
  window.requestAnimationFrame(() => {
    els.inlineSupportBody.scrollTop = 0;
  });
}

async function handleInlineSupportAction(button, event) {
  const action = button.dataset.action || '';
  if (!action.startsWith('current-law-') && !action.startsWith('teaching-')) return;
  event.preventDefault();
  if (action === 'current-law-edit') {
    state.currentLawEditMode = true;
    renderNormativeTeachingPanel(state.currentQuestion);
  } else if (action === 'current-law-cancel-edit') {
    state.currentLawEditMode = false;
    renderNormativeTeachingPanel(state.currentQuestion);
  } else if (action === 'current-law-save-edit') {
    await saveCurrentLawAnswerEdit();
  } else if (action === 'teaching-edit') {
    state.teachingEditMode = true;
    renderNormativeTeachingPanel(state.currentQuestion);
  } else if (action === 'teaching-cancel-edit') {
    state.teachingEditMode = false;
    renderNormativeTeachingPanel(state.currentQuestion);
  } else if (action === 'teaching-save-edit') {
    await saveNormativeTeachingEdit();
  } else if (action === 'teaching-reset-edit') {
    await resetNormativeTeachingEdit();
  }
  renderInlineSupportCard();
}

function showCommentPanel() {
  openSupportPanel(preferredSupportTab(state.currentQuestion));
  state.sawComment = true;
  recordQuestionEvent('opened_comment');
}

function showTeachingPanel() {
  openSupportPanel('teaching');
  state.sawComment = true;
  recordQuestionEvent('opened_comment', 'teaching');
}

function showQuickTheoryPanel() {
  if (!hasQuickTheorySupport(state.currentQuestion)) {
    openSupportPanel('quickTheory');
    return;
  }
  state.openedTheory = true;
  openSupportPanel('quickTheory');
  recordQuestionEvent('opened_theory', 'quick_theory');
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
  if (!hasNormativeSupport(state.currentQuestion)) {
    return;
  }
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
  const isStatsOnly = adaptive.clusterPolicy === 'stats_only';
  els.similarInfo.textContent = isStatsOnly
    ? `${Number(adaptive.size || 0).toLocaleString('pt-BR')} no assunto`
    : adaptive.clusterType === 'same_skill'
    ? `${Number(adaptive.size || 0).toLocaleString('pt-BR')} no mesmo assunto`
    : `${Number(adaptive.size || 0).toLocaleString('pt-BR')} semelhantes`;
  els.supportSimilarBody.innerHTML = `
    <p>${escapeHtml(isStatsOnly ? 'Agrupamento amplo do mesmo assunto.' : (adaptive.reasonText || 'Questões relacionadas pelo motor adaptativo.'))}</p>
    <p class="empty">Abra este painel para ver outras questões relacionadas.</p>
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
  const isStatsOnly = data.cluster.policy === 'stats_only';
  els.similarInfo.textContent = isStatsOnly
    ? `${Number(data.cluster.size || 0).toLocaleString('pt-BR')} no assunto`
    : data.cluster.type === 'same_skill'
    ? `${Number(data.cluster.size || 0).toLocaleString('pt-BR')} no mesmo assunto`
    : `${Number(data.cluster.size || 0).toLocaleString('pt-BR')} semelhantes`;
  const members = data.members || [];
  els.supportSimilarBody.innerHTML = `
    <p>${escapeHtml(isStatsOnly ? 'Outras questões do mesmo assunto.' : data.cluster.type === 'same_skill' ? 'Reforços dentro do mesmo assunto.' : 'Questões muito próximas identificadas pelo motor adaptativo.')}</p>
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
  if (tab === 'normative' && !hasNormativeSupport(state.currentQuestion)) {
    tab = canRevealCurrentLawAnswer(state.currentQuestion) ? 'teaching' : 'comment';
  }
  if (tab === 'quickTheory' && !hasQuickTheorySupport(state.currentQuestion)) {
    tab = canRevealCurrentLawAnswer(state.currentQuestion) ? 'teaching' : 'comment';
  }
  if (tab === 'appliedTheory' && !hasAppliedTheorySupport(state.currentQuestion)) {
    tab = hasQuickTheorySupport(state.currentQuestion) ? 'quickTheory' : 'comment';
  }
  const tabCanReveal = tab === 'teaching'
    ? canRevealCurrentLawAnswer(state.currentQuestion)
    : tab === 'appliedTheory'
      ? canRevealAppliedTheory(state.currentQuestion)
      : canRevealExplanation(state.currentQuestion);
  if (supportTabRequiresAnswer(tab) && !tabCanReveal) {
    els.answerHint.textContent = 'Responda para liberar a explicação';
    return;
  }
  state.supportOpen = true;
  state.supportTab = tab;
  if (!options.keepFocus) {
    state.lastSupportTrigger = document.activeElement;
  }
  renderSupportVisibility();
  resetSupportPanelScroll();
  if (!options.keepFocus) {
    requestAnimationFrame(() => els.closeSupport.focus());
  }
}

function resetSupportPanelScroll() {
  requestAnimationFrame(() => {
    if (els.supportDrawer) els.supportDrawer.scrollTop = 0;
    const tabsNav = els.supportTabs?.[0]?.parentElement;
    if (tabsNav) tabsNav.scrollLeft = 0;
    [
      els.supportTeachingPanel,
      els.supportAppliedTheoryPanel,
      els.supportQuickTheoryPanel,
      els.commentPanel,
      els.supportNormativePanel,
      els.supportTheoryPanel,
      els.supportHistoryPanel,
      els.supportSimilarPanel
    ].forEach((panel) => {
      if (panel) panel.scrollTop = 0;
    });
  });
}

function closeSupportPanel() {
  state.supportOpen = false;
  renderSupportVisibility();
  if (state.lastSupportTrigger && typeof state.lastSupportTrigger.focus === 'function') {
    state.lastSupportTrigger.focus();
  }
}

function lockPageScroll() {
  if (document.body.classList.contains('is-support-scroll-locked')) return;
  lockedBodyScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.top = `-${lockedBodyScrollY}px`;
  document.body.classList.add('is-support-scroll-locked');
}

function unlockPageScroll() {
  if (!document.body.classList.contains('is-support-scroll-locked')) return;
  document.body.classList.remove('is-support-scroll-locked');
  document.body.style.top = '';
  window.scrollTo(0, lockedBodyScrollY);
  lockedBodyScrollY = 0;
}

function hasNormativeSupport(question = state.currentQuestion) {
  return Boolean(question?.normativeUpdate?.exists);
}

function hasQuickTheorySupport(question = state.currentQuestion) {
  return Boolean(question?.legalStudy?.available && question.legalStudy?.primaryCard);
}

function hasAppliedTheorySupport(question = state.currentQuestion) {
  return Boolean(question?.appliedTheoryCard?.available);
}

function syncAppliedTheoryAvailability(question = state.currentQuestion) {
  const available = hasAppliedTheorySupport(question);
  const canReveal = canRevealAppliedTheory(question);
  if (els.supportTabAppliedTheory) {
    els.supportTabAppliedTheory.hidden = !available;
    els.supportTabAppliedTheory.disabled = !available || !canReveal;
  }
  if (!available && state.supportTab === 'appliedTheory') {
    state.supportTab = hasQuickTheorySupport(question) ? 'quickTheory' : 'comment';
  }
}

function syncQuickTheoryAvailability(question = state.currentQuestion) {
  const available = hasQuickTheorySupport(question);
  const canReveal = canRevealExplanation(question);
  if (els.openQuickTheory) {
    els.openQuickTheory.hidden = !available;
    els.openQuickTheory.disabled = !available || !canReveal;
    els.openQuickTheory.textContent = available ? 'Teoria rápida' : 'Teoria rápida indisponível';
  }
  if (els.supportTabQuickTheory) {
    els.supportTabQuickTheory.hidden = !available;
    els.supportTabQuickTheory.disabled = !available || !canReveal;
  }
  if (!available && state.supportTab === 'quickTheory') {
    state.supportTab = canRevealCurrentLawAnswer(question) ? 'teaching' : 'comment';
  }
}

function syncNormativeSupportAvailability(question = state.currentQuestion) {
  const available = hasNormativeSupport(question);
  if (els.toggleNormativeSupport) {
    els.toggleNormativeSupport.hidden = !available;
    els.toggleNormativeSupport.disabled = !available || !canRevealExplanation(question);
    els.toggleNormativeSupport.textContent = 'Atualização normativa';
  }
  if (els.supportTabNormative) {
    els.supportTabNormative.hidden = !available;
    els.supportTabNormative.disabled = !available;
  }
  if (!available && state.supportTab === 'normative') {
    state.supportTab = canRevealCurrentLawAnswer(question) ? 'teaching' : 'comment';
  }
}

function renderSupportVisibility() {
  syncNormativeSupportAvailability(state.currentQuestion);
  syncAppliedTheoryAvailability(state.currentQuestion);
  syncQuickTheoryAvailability(state.currentQuestion);
  if (state.supportTab === 'teaching'
    && !state.currentQuestion?.currentLawAnswer?.exists
    && !state.currentQuestion?.normativeTeachingComment?.exists
    && !state.currentQuestion?.normativeUpdate?.exists
    && !state.currentQuestion?.metadata?.desatualizada) {
    state.supportTab = 'comment';
  }
  if (state.supportOpen) {
    lockPageScroll();
  } else {
    unlockPageScroll();
  }
  els.supportOverlay.hidden = !state.supportOpen;
  els.supportDrawer.hidden = !state.supportOpen;
  els.supportTabs.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.supportTab === state.supportTab);
  });
  els.supportTeachingPanel.hidden = state.supportTab !== 'teaching';
  if (els.supportAppliedTheoryPanel) els.supportAppliedTheoryPanel.hidden = state.supportTab !== 'appliedTheory';
  els.supportQuickTheoryPanel.hidden = state.supportTab !== 'quickTheory';
  els.commentPanel.hidden = state.supportTab !== 'comment';
  els.supportNormativePanel.hidden = state.supportTab !== 'normative';
  els.supportTheoryPanel.hidden = state.supportTab !== 'theory';
  els.supportHistoryPanel.hidden = state.supportTab !== 'history';
  els.supportSimilarPanel.hidden = state.supportTab !== 'similar';

  const titles = {
    teaching: ['Comentário atualizado', 'Regra atual provável e orientação de estudo'],
    quickTheory: ['Teoria rápida', 'Regra, artigo e pegadinha de prova'],
    comment: ['Explicação histórica', 'Comentário do professor e gabarito histórico'],
    normative: ['Atualização normativa', 'Análise auxiliar da desatualização'],
    theory: ['Teoria relacionada', 'Material em PDF da matéria/assunto'],
    history: ['Histórico da questão', 'Tentativas registradas no banco local'],
    similar: ['Questões semelhantes', 'Representantes e variações de reforço']
  };
  const [title, subtitle] = titles[state.supportTab] || titles.comment;
  els.supportTitle.textContent = title;
  els.supportSubtitle.textContent = subtitle;
  if (state.supportTab === 'teaching') {
    els.supportTitle.textContent = 'Resposta pela legislacao atual';
    els.supportSubtitle.textContent = 'Gabarito atual, fundamento e conclusao de estudo';
  } else if (state.supportTab === 'appliedTheory') {
    els.supportTitle.textContent = 'Teoria aplicada';
    els.supportSubtitle.textContent = 'Regra que resolve esta questao';
  } else if (state.supportTab === 'similar' && state.currentQuestion?.adaptive?.clusterPolicy === 'stats_only') {
    els.supportTitle.textContent = 'Outras do assunto';
    els.supportSubtitle.textContent = 'Agrupamento amplo para consulta, sem supressao de variacoes';
  }
}

function renderSubjectsVisibility() {
  els.subjectsPanel.hidden = !state.subjectsVisible;
  els.toggleSubjects.textContent = state.subjectsVisible ? 'Ocultar ranking' : 'Ranking de assuntos';
  updateReportViewState();
}

function renderCoverageVisibility() {
  els.coveragePanel.hidden = !state.coverageVisible;
  els.toggleCoverage.textContent = state.coverageVisible ? 'Ocultar base' : 'Base x Prova';
  updateReportViewState();
}

function renderTheoryCoverageVisibility() {
  if (!els.theoryCoveragePanel || !els.toggleTheoryCoverage) return;
  els.theoryCoveragePanel.hidden = !state.theoryCoverageVisible;
  els.toggleTheoryCoverage.textContent = state.theoryCoverageVisible ? 'Ocultar cobertura de teoria' : 'Cobertura de teoria';
  updateReportViewState();
}

function renderNormativeVisibility() {
  els.normativePanel.hidden = !state.normativeVisible;
  els.toggleNormative.textContent = state.normativeVisible ? 'Ocultar revisão normativa' : 'Revisão normativa';
  updateReportViewState();
}

function renderLawCompendiumVisibility() {
  if (!els.lawCompendiumPanel || !els.toggleLawCompendium) return;
  els.lawCompendiumPanel.hidden = !state.lawCompendiumVisible;
  document.body.classList.toggle('is-law-compendium-view', state.lawCompendiumVisible);
  els.toggleLawCompendium.textContent = state.lawCompendiumVisible ? 'Ocultar Legislação PRF' : 'Legislação PRF';
  updateReportViewState();
}

function updateReportViewState() {
  const hasOpenReport = Boolean(
    state.coverageVisible
    || state.theoryCoverageVisible
    || state.subjectsVisible
    || state.normativeVisible
    || state.lawCompendiumVisible
  );
  document.body.classList.toggle('is-report-view', hasOpenReport);
}

function closeReportPanels() {
  state.coverageVisible = false;
  state.theoryCoverageVisible = false;
  state.subjectsVisible = false;
  state.normativeVisible = false;
  renderCoverageVisibility();
  renderTheoryCoverageVisibility();
  renderSubjectsVisibility();
  renderNormativeVisibility();
}

function closeLawCompendiumView() {
  if (!state.lawCompendiumVisible) return;
  state.lawCompendiumVisible = false;
  renderLawCompendiumVisibility();
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
  const displayValue = typeof value === 'number'
    ? value.toLocaleString('pt-BR')
    : String(value || 0);
  return `<div class="stat"><strong>${escapeHtml(displayValue)}</strong><span>${label}</span></div>`;
}

function renderStudyTimeSummary(studyTime = state.studyTimeSummary || {}) {
  if (!els.studyTimeToday || !els.studyTimeTotal) return;
  const liveMs = getLiveStudyTimeMs();
  const todayMs = Number(studyTime?.todayMs || 0) + liveMs;
  const totalMs = Number(studyTime?.totalMs || 0) + liveMs;
  const todayAttempts = Number(studyTime?.todayAttempts || 0);
  const timedAttempts = Number(studyTime?.timedAttempts || 0);
  const cappedAttempts = Number(studyTime?.cappedAttempts || 0);
  const maxAttemptMinutes = Number(studyTime?.maxAttemptMinutes || 0);

  els.studyTimeToday.textContent = formatStudyDuration(todayMs);
  els.studyTimeTotal.textContent = formatStudyDuration(totalMs);
  els.studyTimeTodayMeta.textContent = `${todayAttempts.toLocaleString('pt-BR')} tentativa${todayAttempts === 1 ? '' : 's'} hoje`;
  els.studyTimeTotalMeta.textContent = [
    `${timedAttempts.toLocaleString('pt-BR')} tentativa${timedAttempts === 1 ? '' : 's'}`,
    cappedAttempts ? `${cappedAttempts.toLocaleString('pt-BR')} ajustada${cappedAttempts === 1 ? '' : 's'}` : '',
    maxAttemptMinutes ? `teto ${maxAttemptMinutes}min` : ''
  ].filter(Boolean).join(' - ');
  setStudyTimeTab(state.studyTimeTab);
}

function getLiveStudyTimeMs() {
  if (!state.selectedId || state.answerResult || !state.questionTimerRunning) return 0;
  const elapsedMs = getQuestionElapsedMs();
  return Math.max(0, elapsedMs);
}

function setStudyTimeTab(tab) {
  state.studyTimeTab = tab === 'total' ? 'total' : 'today';
  const isTotal = state.studyTimeTab === 'total';
  els.studyTimeTodayTab?.classList.toggle('is-active', !isTotal);
  els.studyTimeTotalTab?.classList.toggle('is-active', isTotal);
  els.studyTimeTodayTab?.setAttribute('aria-selected', String(!isTotal));
  els.studyTimeTotalTab?.setAttribute('aria-selected', String(isTotal));
  if (els.studyTimeTodayPanel) els.studyTimeTodayPanel.hidden = isTotal;
  if (els.studyTimeTotalPanel) els.studyTimeTotalPanel.hidden = !isTotal;
}

function formatStudyDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 600) {
    const shortMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds ? `${shortMinutes}min ${seconds}s` : `${shortMinutes}min`;
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}min`;
  if (hours) return `${hours}h`;
  return `${minutes}min`;
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

function coverageHeaderMarkup() {
  const columns = [
    ['Disciplina', 'Matéria ou bloco do perfil de prova. A linha também mostra o status estratégico.'],
    ['Peso', 'Percentual esperado dessa disciplina no perfil selecionado.'],
    ['Itens', 'Quantidade estimada de itens da disciplina na prova.'],
    ['Base', 'Total de questões mapeadas no banco para essa disciplina.'],
    ['Válidas', 'Questões aproveitáveis para estudo, sem anuladas nem desatualizadas.'],
    ['Com gabarito', 'Questões válidas que possuem gabarito utilizável pelo sistema.'],
    ['Domínio', 'Média de domínio calculada pelas suas tentativas nessa disciplina.'],
    ['Revisão', 'Quantidade de questões dessa disciplina vencidas para revisar hoje.']
  ];
  return `
    <div class="coverage-row coverage-header" role="row">
      ${columns.map(([label, description]) => `
        <span title="${escapeAttr(description)}">
          <strong>${escapeHtml(label)}</strong>
        </span>
      `).join('')}
    </div>
  `;
}

function coverageLegendMarkup() {
  const items = [
    ['Peso', 'percentual esperado no perfil.'],
    ['Itens', 'quantidade estimada na prova.'],
    ['Base', 'questões mapeadas no banco.'],
    ['Válidas', 'questões aproveitáveis para estudo.'],
    ['Com gabarito', 'questões válidas com resposta utilizável.'],
    ['Domínio', 'média do seu desempenho.'],
    ['Revisão', 'questões vencidas para revisar hoje.']
  ];
  return legendMarkup(items);
}

function theoryCoverageRowMarkup(row) {
  const total = Number(row.total || 0);
  const covered = Number(row.covered || 0);
  const pct = total ? Math.round((covered / total) * 100) : 0;
  const status = pct >= 70 ? 'ok' : pct >= 30 ? 'sub-representada' : 'sem_gabarito_suficiente';
  return `
    <div class="coverage-row theory-coverage-row status-${escapeAttr(status)}">
      <span class="coverage-main">
        <strong>${escapeHtml(row.assunto || 'Sem assunto')}</strong>
        <small>${escapeHtml(row.materia || '')}</small>
      </span>
      <span>${covered.toLocaleString('pt-BR')}</span>
      <span>${total.toLocaleString('pt-BR')}</span>
      <span>${Math.max(0, total - covered).toLocaleString('pt-BR')}</span>
      <span>${pct}%</span>
      <span>${Number(row.wrongAttempts || 0).toLocaleString('pt-BR')}</span>
      <span></span>
      <span></span>
    </div>
  `;
}

function theoryCoverageHeaderMarkup() {
  const columns = [
    ['Assunto', 'Matéria e assunto analisados na camada de teoria.'],
    ['Cobertas', 'Questões do assunto com teoria rápida específica ou apoio validado.'],
    ['Total', 'Total de questões consideradas nesse assunto.'],
    ['Lacunas', 'Questões ainda sem apoio teórico específico.'],
    ['Cobertura', 'Percentual de questões do assunto com apoio teórico.'],
    ['Erros', 'Tentativas erradas registradas nesse assunto.']
  ];
  return `
    <div class="coverage-row coverage-header theory-coverage-header" role="row">
      ${columns.map(([label, description]) => `
        <span title="${escapeAttr(description)}">
          <strong>${escapeHtml(label)}</strong>
        </span>
      `).join('')}
      <span></span>
      <span></span>
    </div>
  `;
}

function theoryCoverageLegendMarkup() {
  const items = [
    ['Cobertas', 'questões com apoio teórico específico.'],
    ['Total', 'questões analisadas no assunto.'],
    ['Lacunas', 'questões sem teoria específica.'],
    ['Cobertura', 'percentual coberto.'],
    ['Erros', 'erros já registrados no assunto.']
  ];
  return legendMarkup(items);
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

function normativeHeaderMarkup() {
  const columns = [
    ['Questão', 'ID, assunto, matéria e prévia do enunciado.'],
    ['Histórico', 'Gabarito original ou histórico do banco.'],
    ['Atual', 'Gabarito atualizado provável ou confirmado.'],
    ['Recomendação', 'Como a questão deve ser usada no estudo atual.'],
    ['Segurança', 'Nível de segurança da análise normativa.'],
    ['Detalhes', 'Banca, ano, tipo, mudança de gabarito, comentário e status de revisão.'],
    ['Ação', 'Abre a questão para conferência.']
  ];
  return `
    <div class="normative-row normative-header" role="row">
      ${columns.map(([label, description]) => `
        <span title="${escapeAttr(description)}">
          <strong>${escapeHtml(label)}</strong>
        </span>
      `).join('')}
    </div>
  `;
}

function normativeLegendMarkup() {
  const items = [
    ['Histórico', 'gabarito original do banco.'],
    ['Atual', 'gabarito pela legislação vigente quando houver segurança.'],
    ['Recomendação', 'orienta estudar, revisar manualmente ou descartar.'],
    ['Segurança', 'confiabilidade da análise.'],
    ['Detalhes', 'metadados e status de revisão.']
  ];
  return legendMarkup(items);
}

function legendMarkup(items) {
  return `
    <div class="coverage-legend">
      ${items.map(([label, description]) => `<span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(description)}</span>`).join('')}
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
