const PAGE_SIZE = 20;
const CONTRAN_NORMATIVE_DISPLAY_PREFERENCE_KEY =
  "contran_normative_full_text_display_preference";
const CONTRAN_NORMATIVE_LAST_OPEN_KEY = "contran_normative_full_text_last_open";

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
  activeProfile: "",
  examProfiles: [],
  theoryUrl: "",
  resumeLast: true,
  sessionId: buildSessionId(),
  studyMode: "study",
  supportOpen: false,
  supportTab: "comment",
  inlineSupportTab: "comment",
  inlineSupportRenderKey: "",
  lastSupportTrigger: null,
  questionStartedAt: Date.now(),
  questionActiveElapsedMs: 0,
  questionTimerStartedAt: null,
  questionTimerRunning: false,
  timerId: null,
  sawComment: false,
  openedTheory: false,
  filters: {
    q: "",
    materia: "",
    assunto: "",
    examKey: "",
    excludedMaterias: [],
    includedMaterias: [],
    commented: false,
    unanswered: false,
    lastWrong: false,
    hideOutdated: false,
    hideStudyExcluded: true,
    hideDuplicates: false,
    representative: false,
    normative: "",
    contranUnpublished: false,
    contranCurrentResolution: "",
    contranHistoricalResolution: "",
    contranAxis: "",
    contranTopic: "",
    contranSubtopic: "",
    contranQuestionType: "",
    contranDifficulty: "",
  },
  exams: [],
  examOptionByLabel: new Map(),
  subjects: [],
  subjectsVisible: false,
  coverageVisible: false,
  principaisPrfVisible: false,
  principaisPrfPlan: null,
  theoryCoverageVisible: false,
  normativeVisible: false,
  contranMapVisible: false,
  lawCompendiumVisible: false,
  lawCompendiumMode: "beginner",
  activeLawSourceSlug: "",
  lawCompendiumOverview: null,
  activeLawSourceData: null,
  lawMaterialEditId: null,
  lawMaterialSelection: null,
  teachingEditMode: false,
  currentLawEditMode: false,
  historicalCommentEditMode: false,
  questionEditMode: false,
  questionEditStatus: "",
  historicalCommentSelection: null,
  historicalTableResize: null,
  contranMapLastQuery: "",
  contranMapRows: [],
  studyTimeTab: "today",
  studyTimeSummary: null,
  granCursosPlanVisible: false,
  granCursosPlan: null,
  contranNormativeArticlesCache: new Map(),
  granCursosPlanFilters: {
    quick: "start",
    priority: "",
    status: "",
    axis: "",
    theme: "",
    lesson: "",
    reference: "",
    q: "",
  },
};

const GRAN_CORE_LESSON_NUMBERS = new Set([
  25, 105, 106, 107, 108, 109, 110, 111, 178, 183, 179, 180, 127, 172, 173, 97,
  19, 98, 99, 171, 118, 119, 120, 121, 144, 145, 146, 147, 148, 38, 39, 40, 41,
  42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 26, 149, 150, 151, 152, 153, 27, 130, 131, 28, 137, 138, 139, 140,
  141, 142, 143,
]);

const GRAN_TRAP_LESSON_NUMBERS = new Set([
  93, 94, 95, 174, 175, 176, 177, 18, 181, 182, 122, 156, 20, 127, 154, 155,
]);

const REPORT_ROUTES = {
  coverage: {
    path: "/relatorios/base-prova",
    title: "Base x Prova",
    load: () => loadExamCoverage(),
  },
  principaisPrf: {
    path: "/relatorios/principais-prf",
    title: "Principais PRF",
    load: () => loadPrincipaisPrf(),
  },
  granCursosPlan: {
    path: "/relatorios/plano-aulas-gran-cursos-transito-prf",
    title: "Plano de Aulas Gran Cursos - Trânsito PRF",
    load: () => loadGranCursosPlan(),
  },
  theoryCoverage: {
    path: "/relatorios/cobertura-teoria",
    title: "Cobertura de teoria",
    load: () => loadTheoryCoverage(),
  },
  subjects: {
    path: "/relatorios/ranking-assuntos",
    title: "Ranking de assuntos",
    load: () => loadSubjectsRanking(),
  },
  normative: {
    path: "/relatorios/revisao-normativa",
    title: "Revisão normativa",
    load: () => loadNormativeReview(),
  },
  contranMap: {
    path: "/relatorios/mapa-contran-prf-2021",
    title: "Mapa CONTRAN PRF 2021",
    load: () => loadContranMapList(),
  },
  lawCompendium: {
    path: "/relatorios/legislacao-prf",
    title: "Legislação PRF",
    load: () => loadLawCompendiumOverview(),
  },
};

const els = {
  stats: document.querySelector("#stats"),
  studyTimeTodayTab: document.querySelector("#studyTimeTodayTab"),
  studyTimeTotalTab: document.querySelector("#studyTimeTotalTab"),
  studyTimeTodayPanel: document.querySelector("#studyTimeTodayPanel"),
  studyTimeTotalPanel: document.querySelector("#studyTimeTotalPanel"),
  studyTimeToday: document.querySelector("#studyTimeToday"),
  studyTimeTotal: document.querySelector("#studyTimeTotal"),
  studyTimeTodayMeta: document.querySelector("#studyTimeTodayMeta"),
  studyTimeTotalMeta: document.querySelector("#studyTimeTotalMeta"),
  mobileFilterToggle: document.querySelector("#mobileFilterToggle"),
  filterBar: document.querySelector("#filterBar"),
  studyLayout: document.querySelector(".study-layout"),
  advancedFilterToggle: document.querySelector("#advancedFilterToggle"),
  advancedFilters: document.querySelector("#advancedFilters"),
  activeFiltersLabel: document.querySelector("#activeFiltersLabel"),
  clearFilters: document.querySelector("#clearFilters"),
  searchInput: document.querySelector("#searchInput"),
  matterSelect: document.querySelector("#matterSelect"),
  subjectSelect: document.querySelector("#subjectSelect"),
  examInput: document.querySelector("#examInput"),
  examOptions: document.querySelector("#examOptions"),
  excludedMatterList: document.querySelector("#excludedMatterList"),
  includedMatterList: document.querySelector("#includedMatterList"),
  multiMateriaCount: document.querySelector("#multiMateriaCount"),
  profileSelect: document.querySelector("#profileSelect"),
  commentedOnly: document.querySelector("#commentedOnly"),
  unansweredOnly: document.querySelector("#unansweredOnly"),
  wrongOnly: document.querySelector("#wrongOnly"),
  hideOutdated: document.querySelector("#hideOutdated"),
  hideStudyExcluded: document.querySelector("#hideStudyExcluded"),
  hideDuplicates: document.querySelector("#hideDuplicates"),
  representativeOnly: document.querySelector("#representativeOnly"),
  normativeFilter: document.querySelector("#normativeFilter"),
  contranUnpublishedOnly: document.querySelector("#contranUnpublishedOnly"),
  contranCurrentResolutionSelect: document.querySelector(
    "#contranCurrentResolutionSelect",
  ),
  contranHistoricalResolutionSelect: document.querySelector(
    "#contranHistoricalResolutionSelect",
  ),
  contranAxisSelect: document.querySelector("#contranAxisSelect"),
  contranTopicSelect: document.querySelector("#contranTopicSelect"),
  contranSubtopicSelect: document.querySelector("#contranSubtopicSelect"),
  contranQuestionTypeSelect: document.querySelector(
    "#contranQuestionTypeSelect",
  ),
  contranDifficultySelect: document.querySelector("#contranDifficultySelect"),
  resumeLast: document.querySelector("#resumeLast"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  studyPlanLabel: document.querySelector("#studyPlanLabel"),
  studyNow: document.querySelector("#studyNow"),
  viewAllQuestions: document.querySelector("#viewAllQuestions"),
  nextSubject: document.querySelector("#nextSubject"),
  nextUnanswered: document.querySelector("#nextUnanswered"),
  coverageQueue: document.querySelector("#coverageQueue"),
  smartQueue: document.querySelector("#smartQueue"),
  repairQueue: document.querySelector("#repairQueue"),
  dueReviews: document.querySelector("#dueReviews"),
  modeMenuButton: document.querySelector("#modeMenuButton"),
  reportsMenuButton: document.querySelector("#reportsMenuButton"),
  supportMenuButton: document.querySelector("#supportMenuButton"),
  toggleCoverage: document.querySelector("#toggleCoverage"),
  togglePrincipaisPrf: document.querySelector("#togglePrincipaisPrf"),
  toggleTheoryCoverage: document.querySelector("#toggleTheoryCoverage"),
  toggleSubjects: document.querySelector("#toggleSubjects"),
  toggleNormative: document.querySelector("#toggleNormative"),
  toggleContranMap: document.querySelector("#toggleContranMap"),
  toggleLawCompendium: document.querySelector("#toggleLawCompendium"),
  closeSubjectsReport: document.querySelector("#closeSubjectsReport"),
  closeCoverageReport: document.querySelector("#closeCoverageReport"),
  closePrincipaisPrf: document.querySelector("#closePrincipaisPrf"),
  closeTheoryCoverageReport: document.querySelector(
    "#closeTheoryCoverageReport",
  ),
  closeNormativeReport: document.querySelector("#closeNormativeReport"),
  lawCompendiumPanel: document.querySelector("#lawCompendiumPanel"),
  lawCompendiumInfo: document.querySelector("#lawCompendiumInfo"),
  lawCompendiumStats: document.querySelector("#lawCompendiumStats"),
  lawSourceList: document.querySelector("#lawSourceList"),
  lawSourceDetail: document.querySelector("#lawSourceDetail"),
  closeLawCompendium: document.querySelector("#closeLawCompendium"),
  pageLabel: document.querySelector("#pageLabel"),
  questionMeta: document.querySelector("#questionMeta"),
  questionQuickStatus: document.querySelector("#questionQuickStatus"),
  questionEditToggle: document.querySelector("#questionEditToggle"),
  questionEditStatus: document.querySelector("#questionEditStatus"),
  questionEditPanel: document.querySelector("#questionEditPanel"),
  questionBadges: document.querySelector("#questionBadges"),
  questionTitle: document.querySelector("#questionTitle"),
  normativeAlert: document.querySelector("#normativeAlert"),
  openTeaching: document.querySelector("#openTeaching"),
  openQuickTheory: document.querySelector("#openQuickTheory"),
  openTheory: document.querySelector("#openTheory"),
  openHistory: document.querySelector("#openHistory"),
  toggleNormativeSupport: document.querySelector("#toggleNormativeSupport"),
  statement: document.querySelector("#statement"),
  answerForm: document.querySelector("#answerForm"),
  answerHint: document.querySelector("#answerHint"),
  alternatives: document.querySelector("#alternatives"),
  answerStatus: document.querySelector("#answerStatus"),
  answerDetails: document.querySelector("#answerDetails"),
  answerResult: document.querySelector("#answerResult"),
  timerLabel: document.querySelector("#timerLabel"),
  masteryScore: document.querySelector("#masteryScore"),
  masteryLabel: document.querySelector("#masteryLabel"),
  nextDue: document.querySelector("#nextDue"),
  confidenceSelect: document.querySelector("#confidenceSelect"),
  confidenceOptions: document.querySelector("#confidenceOptions"),
  errorTypeWrapper: document.querySelector("#errorTypeWrapper"),
  errorTypeSelect: document.querySelector("#errorTypeSelect"),
  submitAnswer: document.querySelector("#submitAnswer"),
  secondaryExplain: document.querySelector("#secondaryExplain"),
  similarQuestions: document.querySelector("#similarQuestions"),
  toggleComment: document.querySelector("#toggleComment"),
  showSimilar: document.querySelector("#showSimilar"),
  supportOverlay: document.querySelector("#supportOverlay"),
  supportDrawer: document.querySelector("#supportDrawer"),
  supportTitle: document.querySelector("#supportTitle"),
  supportSubtitle: document.querySelector("#supportSubtitle"),
  supportResultFlag: document.querySelector("#supportResultFlag"),
  closeSupport: document.querySelector("#closeSupport"),
  supportNextQuestion: document.querySelector("#supportNextQuestion"),
  supportTabs: document.querySelectorAll("[data-support-tab]"),
  inlineSupportCard: document.querySelector("#inlineSupportCard"),
  inlineSupportTitle: document.querySelector("#inlineSupportTitle"),
  inlineSupportSubtitle: document.querySelector("#inlineSupportSubtitle"),
  inlineSupportTabs: document.querySelector("#inlineSupportTabs"),
  inlineSupportBody: document.querySelector("#inlineSupportBody"),
  inlineOpenDrawer: document.querySelector("#inlineOpenDrawer"),
  supportTheoryPanel: document.querySelector("#supportTheoryPanel"),
  supportAppliedTheoryPanel: document.querySelector(
    "#supportAppliedTheoryPanel",
  ),
  supportTabAppliedTheory: document.querySelector("#supportTabAppliedTheory"),
  appliedTheoryInfo: document.querySelector("#appliedTheoryInfo"),
  supportAppliedTheoryBody: document.querySelector("#supportAppliedTheoryBody"),
  supportQuickTheoryPanel: document.querySelector("#supportQuickTheoryPanel"),
  supportTabQuickTheory: document.querySelector("#supportTabQuickTheory"),
  supportTabComment: document.querySelector("#supportTabComment"),
  supportNormativePanel: document.querySelector("#supportNormativePanel"),
  supportTabNormative: document.querySelector("#supportTabNormative"),
  supportHistoryPanel: document.querySelector("#supportHistoryPanel"),
  supportSimilarPanel: document.querySelector("#supportSimilarPanel"),
  normativeSupportInfo: document.querySelector("#normativeSupportInfo"),
  supportNormativeBody: document.querySelector("#supportNormativeBody"),
  theoryInfo: document.querySelector("#theoryInfo"),
  supportTheoryBody: document.querySelector("#supportTheoryBody"),
  quickTheoryInfo: document.querySelector("#quickTheoryInfo"),
  supportQuickTheoryBody: document.querySelector("#supportQuickTheoryBody"),
  historyInfo: document.querySelector("#historyInfo"),
  supportHistoryBody: document.querySelector("#supportHistoryBody"),
  similarInfo: document.querySelector("#similarInfo"),
  supportSimilarBody: document.querySelector("#supportSimilarBody"),
  commentPanel: document.querySelector("#commentPanel"),
  commentInfo: document.querySelector("#commentInfo"),
  commentEditStatus: document.querySelector("#commentEditStatus"),
  commentBody: document.querySelector("#commentBody"),
  subjectsPanel: document.querySelector("#subjectsPanel"),
  subjectsInfo: document.querySelector("#subjectsInfo"),
  subjectsList: document.querySelector("#subjectsList"),
  coveragePanel: document.querySelector("#coveragePanel"),
  coverageInfo: document.querySelector("#coverageInfo"),
  coverageAlerts: document.querySelector("#coverageAlerts"),
  coverageTable: document.querySelector("#coverageTable"),
  principaisPrfPanel: document.querySelector("#principaisPrfPanel"),
  principaisPrfInfo: document.querySelector("#principaisPrfInfo"),
  principaisPrfBody: document.querySelector("#principaisPrfBody"),
  toggleGranCursosPlan: document.querySelector("#toggleGranCursosPlan"),
  closeGranCursosPlan: document.querySelector("#closeGranCursosPlan"),
  granCursosPlanPanel: document.querySelector("#granCursosPlanPanel"),
  granCursosPlanInfo: document.querySelector("#granCursosPlanInfo"),
  granCursosPlanBody: document.querySelector("#granCursosPlanBody"),
  theoryCoveragePanel: document.querySelector("#theoryCoveragePanel"),
  theoryCoverageInfo: document.querySelector("#theoryCoverageInfo"),
  theoryCoverageStats: document.querySelector("#theoryCoverageStats"),
  theoryCoverageTable: document.querySelector("#theoryCoverageTable"),
  normativePanel: document.querySelector("#normativePanel"),
  normativeInfo: document.querySelector("#normativeInfo"),
  normativeStats: document.querySelector("#normativeStats"),
  normativeRecommendationFilter: document.querySelector(
    "#normativeRecommendationFilter",
  ),
  normativeSecurityFilter: document.querySelector("#normativeSecurityFilter"),
  normativeChangedFilter: document.querySelector("#normativeChangedFilter"),
  normativeReviewStatusFilter: document.querySelector(
    "#normativeReviewStatusFilter",
  ),
  normativeTeachingStatusFilter: document.querySelector(
    "#normativeTeachingStatusFilter",
  ),
  normativeTable: document.querySelector("#normativeTable"),
  contranMapPanel: document.querySelector("#contranMapPanel"),
  contranMapInfo: document.querySelector("#contranMapInfo"),
  contranMapForm: document.querySelector("#contranMapForm"),
  contranMapInput: document.querySelector("#contranMapInput"),
  contranMapStatus: document.querySelector("#contranMapStatus"),
  contranMapResults: document.querySelector("#contranMapResults"),
  closeContranMap: document.querySelector("#closeContranMap"),
  contranNormAlert: document.querySelector("#contranNormAlert"),
  supportTabTeaching: document.querySelector("#supportTabTeaching"),
  supportTeachingPanel: document.querySelector("#supportTeachingPanel"),
  teachingInfo: document.querySelector("#teachingInfo"),
  supportTeachingBody: document.querySelector("#supportTeachingBody"),
  studyStatusControl: document.querySelector("#studyStatusControl"),
  studyStatusText: document.querySelector("#studyStatusText"),
  studyStatusReason: document.querySelector("#studyStatusReason"),
  excludeFromStudy: document.querySelector("#excludeFromStudy"),
  reviewLater: document.querySelector("#reviewLater"),
  restoreToStudy: document.querySelector("#restoreToStudy"),
};

let searchTimer = null;
let excludedMatterTimer = null;
let includedMatterTimer = null;
let examSearchTimer = null;
const mobileLayoutQuery = window.matchMedia("(max-width: 760px)");
let lockedBodyScrollY = 0;
let questionRequestToken = 0;

// /api/stats custa ~26 idas ao Postgres remoto (~8s). Responder uma questão
// dispara duas chamadas simultâneas: loadStats() e o painel "Hoje". Compartilha
// a requisição em voo — não é cache: uma chamada nova sempre vai ao servidor.
// Precisa ficar antes de boot(), que chama api() no carregamento.
const inflightStats = { promise: null };

boot().catch(handleBootError);

async function boot() {
  bindEvents();
  const [studyState] = await Promise.all([
    loadStudyState(),
    loadStats(),
    loadFilters(),
    loadExamProfiles(),
  ]);
  const initialReportKey = getCurrentReportRouteKey();
  if (initialReportKey) {
    await openReportPage(initialReportKey, {
      replace: true,
      preserveContranQuery: true,
    });
    return;
  }
  if (state.filters.examKey) {
    return;
  }
  const initialTargetId = getInitialTargetId();
  if (initialTargetId) {
    setStudyMode("all");
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
  if (els.questionMeta)
    els.questionMeta.textContent = "falha ao carregar dados";
  if (els.questionQuickStatus)
    els.questionQuickStatus.textContent = "Erro na API";
  if (els.questionTitle) els.questionTitle.textContent = "Erro ao carregar";
  if (els.statement) {
    els.statement.innerHTML = `
      <p class="empty">
        ${escapeHtml(error?.message || "Nao foi possivel carregar os dados do servidor.")}
      </p>
    `;
  }
}

function bindEvents() {
  bindDropdowns();
  syncMobileStudyStatusDisclosure();
  mobileLayoutQuery.addEventListener?.(
    "change",
    syncMobileStudyStatusDisclosure,
  );
  document.addEventListener("visibilitychange", syncQuestionTimerTracking);
  window.addEventListener("blur", syncQuestionTimerTracking);
  window.addEventListener("focus", syncQuestionTimerTracking);
  window.addEventListener("pagehide", pauseQuestionTimer);
  window.addEventListener("popstate", () => {
    handleReportRouteChange().catch(handleBootError);
  });
  els.studyTimeTodayTab?.addEventListener("click", () =>
    setStudyTimeTab("today"),
  );
  els.studyTimeTotalTab?.addEventListener("click", () =>
    setStudyTimeTab("total"),
  );
  updateAdvancedFiltersSummary();

  els.mobileFilterToggle?.addEventListener("click", () => {
    const willOpen = !els.filterBar.classList.contains("is-mobile-open");
    els.filterBar.classList.toggle("is-mobile-open", willOpen);
    els.mobileFilterToggle.setAttribute("aria-expanded", String(willOpen));
  });

  els.advancedFilterToggle.addEventListener("click", () => {
    const willOpen = els.advancedFilters.hidden;
    els.advancedFilters.hidden = !willOpen;
    els.advancedFilterToggle.setAttribute("aria-expanded", String(willOpen));
  });

  els.clearFilters.addEventListener("click", async () => {
    clearFilters();
    await loadCurrentModeTarget();
    if (state.subjectsVisible) await loadSubjectsRanking();
    if (state.coverageVisible) await loadExamCoverage();
    if (state.theoryCoverageVisible) await loadTheoryCoverage();
    if (state.normativeVisible) await loadNormativeReview();
  });

  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.q = els.searchInput.value.trim();
      state.page = 1;
      updateAdvancedFiltersSummary();
      loadQuestions();
      if (state.normativeVisible) loadNormativeReview();
    }, 250);
  });

  els.matterSelect.addEventListener("change", async () => {
    activateManualQuestionListMode();
    state.filters.materia = els.matterSelect.value;
    state.filters.assunto = "";
    // Matéria única e seleção múltipla são mutuamente exclusivas.
    if (els.matterSelect.value && state.filters.includedMaterias?.length) {
      state.filters.includedMaterias = [];
      renderIncludedMatterOptions();
    }
    state.page = 1;
    renderSubjectOptions();
    updateAdvancedFiltersSummary();
    await loadCurrentModeTarget();
    if (state.normativeVisible) await loadNormativeReview();
  });

  els.subjectSelect.addEventListener("change", async () => {
    activateManualQuestionListMode();
    state.filters.assunto = els.subjectSelect.value;
    state.page = 1;
    updateAdvancedFiltersSummary();
    await loadCurrentModeTarget();
    if (state.normativeVisible) await loadNormativeReview();
  });

  els.examInput?.addEventListener("focus", () => {
    if (!state.exams.length) loadExamOptions("").catch(() => {});
  });

  els.examInput?.addEventListener("input", () => {
    clearTimeout(examSearchTimer);
    const value = els.examInput.value.trim();
    const matched = state.examOptionByLabel.get(value);
    if (matched) {
      applyExamFilterOption(matched).catch((error) => {
        els.answerStatus.textContent =
          error?.message || "Falha ao carregar a prova selecionada";
      });
      return;
    }

    state.filters.examKey = "";
    state.page = 1;
    updateAdvancedFiltersSummary();
    if (!value) {
      loadCurrentModeTarget();
      if (state.subjectsVisible) loadSubjectsRanking();
      if (state.normativeVisible) loadNormativeReview();
      return;
    }
    if (value.length < 2) return;
    examSearchTimer = setTimeout(() => {
      loadExamOptions(value).catch(() => {});
    }, 250);
  });

  els.excludedMatterList.addEventListener("change", () => {
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

  // Fecha o dropdown de várias matérias ao clicar fora dele.
  document.addEventListener("click", (event) => {
    const field = document.getElementById("multiMateriaField");
    if (field?.open && !event.target.closest("#multiMateriaField")) {
      field.open = false;
    }
  });

  els.includedMatterList?.addEventListener("change", () => {
    state.filters.includedMaterias = selectedIncludedMatterValues();
    // Seleção múltipla tem precedência: zera o seletor único de matéria.
    if (state.filters.includedMaterias.length) {
      state.filters.materia = "";
      if (els.matterSelect) els.matterSelect.value = "";
    }
    updateMultiMateriaCount();
    state.page = 1;
    updateAdvancedFiltersSummary();
    clearTimeout(includedMatterTimer);
    includedMatterTimer = setTimeout(async () => {
      // Mantém o modo atual. No adaptativo (padrão), o backend faz o rodízio
      // entre as matérias selecionadas COM o scorer completo (serve a melhor
      // de cada matéria, girando). No modo lista, a ordenação SQL já intercala.
      await loadCurrentModeTarget();
      if (state.subjectsVisible) await loadSubjectsRanking();
      if (state.normativeVisible) await loadNormativeReview();
    }, 350);
  });

  els.profileSelect.addEventListener("change", async () => {
    state.activeProfile = els.profileSelect.value;
    renderStudyPlanLabel();
    await api("/api/exam-profiles/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: state.activeProfile }),
    });
    if (state.subjectsVisible) await loadSubjectsRanking();
    if (state.coverageVisible) await loadExamCoverage();
    if (state.theoryCoverageVisible) await loadTheoryCoverage();
  });

  els.commentedOnly.addEventListener("change", () => {
    state.filters.commented = els.commentedOnly.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
    if (state.normativeVisible) loadNormativeReview();
  });

  els.unansweredOnly.addEventListener("change", () => {
    state.filters.unanswered = els.unansweredOnly.checked;
    if (state.filters.unanswered) {
      state.filters.lastWrong = false;
      els.wrongOnly.checked = false;
    }
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.wrongOnly.addEventListener("change", () => {
    state.filters.lastWrong = els.wrongOnly.checked;
    if (state.filters.lastWrong) {
      state.filters.unanswered = false;
      els.unansweredOnly.checked = false;
    }
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.hideOutdated.addEventListener("change", () => {
    state.filters.hideOutdated = els.hideOutdated.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
    if (state.subjectsVisible) {
      loadSubjectsRanking();
    }
  });

  els.hideStudyExcluded.addEventListener("change", () => {
    state.filters.hideStudyExcluded = els.hideStudyExcluded.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.hideDuplicates.addEventListener("change", () => {
    state.filters.hideDuplicates = els.hideDuplicates.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.representativeOnly.addEventListener("change", () => {
    state.filters.representative = els.representativeOnly.checked;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  els.normativeFilter.addEventListener("change", () => {
    state.filters.normative = els.normativeFilter.value;
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });

  const contranFilterControls = [
    [els.contranCurrentResolutionSelect, "contranCurrentResolution"],
    [els.contranHistoricalResolutionSelect, "contranHistoricalResolution"],
    [els.contranAxisSelect, "contranAxis"],
    [els.contranTopicSelect, "contranTopic"],
    [els.contranSubtopicSelect, "contranSubtopic"],
    [els.contranQuestionTypeSelect, "contranQuestionType"],
    [els.contranDifficultySelect, "contranDifficulty"],
  ];
  els.contranUnpublishedOnly?.addEventListener("change", () => {
    state.filters.contranUnpublished = els.contranUnpublishedOnly.checked;
    if (state.filters.contranUnpublished) activateContranUnpublishedMode();
    state.page = 1;
    updateAdvancedFiltersSummary();
    loadQuestions();
  });
  contranFilterControls.forEach(([control, key]) => {
    control?.addEventListener("change", () => {
      state.filters[key] = control.value;
      if (control.value) {
        state.filters.contranUnpublished = true;
        activateContranUnpublishedMode();
      }
      if (els.contranUnpublishedOnly)
        els.contranUnpublishedOnly.checked = state.filters.contranUnpublished;
      state.page = 1;
      updateAdvancedFiltersSummary();
      loadQuestions();
    });
  });

  els.resumeLast.addEventListener("change", async () => {
    state.resumeLast = els.resumeLast.checked;
    await saveStudyState({ resumeLast: state.resumeLast });
  });

  els.prevPage.addEventListener("click", () => goPrevious());
  els.nextPage.addEventListener("click", () => goNext());
  els.studyNow.addEventListener("click", () => {
    setStudyMode("adaptive");
    loadAdaptiveTarget("prf_otimizado");
  });
  els.viewAllQuestions.addEventListener("click", () => {
    setStudyMode("all");
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
  els.nextSubject.addEventListener("click", () => {
    closeAllDropdowns();
    setStudyMode("subject");
    navigateSpecial("subject");
  });
  els.nextUnanswered.addEventListener("click", () => {
    closeAllDropdowns();
    setStudyMode("unanswered");
    navigateSpecial("unanswered");
  });
  els.smartQueue.addEventListener("click", () => {
    closeAllDropdowns();
    setStudyMode("adaptive");
    loadAdaptiveTarget("prf_otimizado");
  });
  els.repairQueue.addEventListener("click", () => {
    closeAllDropdowns();
    setStudyMode("repair");
    loadAdaptiveTarget("revisar_erros");
  });
  els.dueReviews.addEventListener("click", () => {
    closeAllDropdowns();
    setStudyMode("review");
    loadAdaptiveTarget("revisar_hoje");
  });
  els.coverageQueue?.addEventListener("click", () => {
    closeAllDropdowns();
    setStudyMode("coverage");
    loadAdaptiveTarget("prf_otimizado");
  });
  els.toggleCoverage.addEventListener("click", async () => {
    closeAllDropdowns();
    await openReportPage("coverage");
  });
  els.togglePrincipaisPrf?.addEventListener("click", async () => {
    closeAllDropdowns();
    await openReportPage("principaisPrf");
  });
  els.toggleGranCursosPlan?.addEventListener("click", async () => {
    closeAllDropdowns();
    await openReportPage("granCursosPlan");
  });
  els.toggleTheoryCoverage?.addEventListener("click", async () => {
    closeAllDropdowns();
    await openReportPage("theoryCoverage");
  });
  els.toggleSubjects.addEventListener("click", async () => {
    closeAllDropdowns();
    await openReportPage("subjects");
  });
  els.toggleNormative.addEventListener("click", async () => {
    closeAllDropdowns();
    await openReportPage("normative");
  });
  els.toggleContranMap?.addEventListener("click", async () => {
    closeAllDropdowns();
    await openReportPage("contranMap");
    els.contranMapInput?.focus();
  });
  els.toggleLawCompendium?.addEventListener("click", async () => {
    closeAllDropdowns();
    await openReportPage("lawCompendium");
  });

  els.closeLawCompendium?.addEventListener("click", () => {
    navigateStudyHome();
  });
  els.closeSubjectsReport?.addEventListener("click", () => {
    navigateStudyHome();
  });
  els.closeCoverageReport?.addEventListener("click", () => {
    navigateStudyHome();
  });
  els.closeGranCursosPlan?.addEventListener("click", () => {
    navigateStudyHome();
  });
  els.closePrincipaisPrf?.addEventListener("click", () => {
    navigateStudyHome();
  });
  els.closeTheoryCoverageReport?.addEventListener("click", () => {
    navigateStudyHome();
  });
  els.closeNormativeReport?.addEventListener("click", () => {
    navigateStudyHome();
  });
  els.closeContranMap?.addEventListener("click", () => {
    navigateStudyHome();
  });
  els.contranMapForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await searchContranMap(els.contranMapInput?.value || "");
  });
  els.contranMapPanel?.addEventListener("click", async (event) => {
    const example = event.target.closest("[data-contran-example]");
    if (example) {
      const value = example.dataset.contranExample || "";
      if (els.contranMapInput) els.contranMapInput.value = value;
      await searchContranMap(value);
      return;
    }
    const openMap = event.target.closest('[data-action="contran-map-search"]');
    if (openMap) {
      if (els.contranMapInput)
        els.contranMapInput.value = openMap.dataset.ref || "";
      await searchContranMap(openMap.dataset.ref || "");
      return;
    }
    const showAll = event.target.closest(
      '[data-action="contran-map-show-all"]',
    );
    if (showAll) {
      if (els.contranMapInput) els.contranMapInput.value = "";
      await loadContranMapList();
    }
  });
  els.contranNormAlert?.addEventListener("click", async (event) => {
    const button = event.target.closest('[data-action="open-contran-map"]');
    if (!button) return;
    event.preventDefault();
    closeAllDropdowns();
    closeReportPanels();
    closeLawCompendiumView();
    state.contranMapVisible = true;
    renderContranMapVisibility();
    const ref = button.dataset.ref || "";
    if (els.contranMapInput) els.contranMapInput.value = ref;
    await searchContranMap(ref);
  });

  els.subjectsList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-materia][data-assunto]");
    if (!button) {
      return;
    }

    state.filters.q = "";
    state.filters.materia = button.dataset.materia || "";
    state.filters.assunto = button.dataset.assunto || "";
    state.page = 1;
    els.searchInput.value = "";
    els.matterSelect.value = state.filters.materia;
    renderSubjectOptions();
    els.subjectSelect.value = state.filters.assunto;
    updateAdvancedFiltersSummary();
    await loadCurrentModeTarget();
  });

  els.answerStatus.addEventListener("click", () => {
    if (!els.answerStatus.disabled) {
      els.answerDetails.hidden = !els.answerDetails.hidden;
    }
  });

  els.answerResult.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="show-comment"]');
    if (button) {
      showCommentPanel();
    }
  });

  els.toggleComment.addEventListener("click", () => {
    closeAllDropdowns();
    openSupportPanel("comment");
  });

  els.showSimilar.addEventListener("click", () => {
    closeAllDropdowns();
    showSimilarPanel();
  });

  els.openTeaching.addEventListener("click", () => {
    closeAllDropdowns();
    showTeachingPanel();
  });

  els.openQuickTheory?.addEventListener("click", () => {
    closeAllDropdowns();
    showQuickTheoryPanel();
  });

  els.openTheory.addEventListener("click", () => {
    closeAllDropdowns();
    showTheoryPanel();
  });

  els.openHistory.addEventListener("click", () => {
    closeAllDropdowns();
    openSupportPanel("history");
  });
  els.toggleNormativeSupport.addEventListener("click", () => {
    closeAllDropdowns();
    showNormativePanel();
  });

  els.normativeAlert.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="show-teaching"]')) {
      openSupportPanel("teaching");
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
    els.normativeTeachingStatusFilter,
  ].forEach((control) => {
    control.addEventListener("change", () => loadNormativeReview());
  });

  els.normativeTable.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-question-id]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const questionId = Number(trigger.dataset.questionId || 0);
    if (!questionId) return;
    state.normativeVisible = false;
    renderNormativeVisibility();
    await openQuestionDirect(questionId, { fallbackHref: trigger.href });
    if (state.selectedId === questionId) {
      openSupportPanel("normative");
    }
  });

  els.lawSourceDetail?.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (
      actionButton &&
      String(actionButton.dataset.action || "").startsWith("law-material-")
    ) {
      await handleLawSectionMaterialAction(actionButton, event);
      return;
    }
    const deleteMaterial = event.target.closest("[data-law-material-delete]");
    if (deleteMaterial) {
      event.preventDefault();
      await deleteLawSectionMaterial(deleteMaterial);
      return;
    }
    const trigger = event.target.closest("[data-question-id]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const questionId = Number(trigger.dataset.questionId || 0);
    if (!questionId) return;
    state.lawCompendiumVisible = false;
    renderLawCompendiumVisibility();
    await openQuestionDirect(questionId, { fallbackHref: trigger.href });
  });

  els.lawSourceDetail?.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-law-material-form]");
    if (!form) return;
    event.preventDefault();
    await submitLawSectionMaterial(form);
  });

  els.lawSourceDetail?.addEventListener("change", (event) => {
    const colorInput = event.target.closest("[data-law-material-color]");
    if (colorInput) {
      handleLawMaterialColor(colorInput, event);
      return;
    }
    const fontSizeSelect = event.target.closest(
      "[data-law-material-font-size]",
    );
    if (fontSizeSelect) {
      handleLawMaterialStyleSelect(fontSizeSelect, event, "fontSize");
      return;
    }
    const fontFamilySelect = event.target.closest(
      "[data-law-material-font-family]",
    );
    if (fontFamilySelect) {
      handleLawMaterialStyleSelect(fontFamilySelect, event, "fontFamily");
      return;
    }
    const lineHeightSelect = event.target.closest(
      "[data-law-material-line-height]",
    );
    if (lineHeightSelect) {
      handleLawMaterialStyleSelect(lineHeightSelect, event, "lineHeight");
      return;
    }
    const select = event.target.closest("[data-law-material-type]");
    if (!select) return;
    const form = select.closest("[data-law-material-form]");
    updateLawMaterialFormMode(form);
  });

  els.lawSourceDetail?.addEventListener("input", (event) => {
    const editor = event.target.closest("[data-law-material-editor]");
    if (editor) saveLawMaterialSelection(editor);
  });

  els.lawSourceDetail?.addEventListener("keyup", (event) => {
    const editor = event.target.closest("[data-law-material-editor]");
    if (editor) saveLawMaterialSelection(editor);
  });

  els.lawSourceDetail?.addEventListener("mouseup", (event) => {
    const editor = event.target.closest("[data-law-material-editor]");
    if (editor) saveLawMaterialSelection(editor);
  });

  els.lawSourceDetail?.addEventListener("focusout", (event) => {
    const editor = event.target.closest("[data-law-material-editor]");
    if (editor) saveLawMaterialSelection(editor);
  });

  els.supportSimilarBody.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-question-id]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    const questionId = Number(trigger.dataset.questionId || 0);
    if (!questionId) return;
    await openQuestionDirect(questionId, { fallbackHref: trigger.href });
  });

  els.supportTeachingBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action || "";
    if (action.startsWith("current-law-")) {
      event.preventDefault();
      if (action === "current-law-edit") {
        state.currentLawEditMode = true;
        renderNormativeTeachingPanel(state.currentQuestion);
        return;
      }
      if (action === "current-law-cancel-edit") {
        state.currentLawEditMode = false;
        renderNormativeTeachingPanel(state.currentQuestion);
        return;
      }
      if (action === "current-law-save-edit") {
        await saveCurrentLawAnswerEdit();
      }
      return;
    }
    if (!action.startsWith("teaching-")) return;
    event.preventDefault();

    if (action === "teaching-edit") {
      state.teachingEditMode = true;
      renderNormativeTeachingPanel(state.currentQuestion);
      return;
    }
    if (action === "teaching-cancel-edit") {
      state.teachingEditMode = false;
      renderNormativeTeachingPanel(state.currentQuestion);
      return;
    }
    if (action === "teaching-save-edit") {
      await saveNormativeTeachingEdit();
      return;
    }
    if (action === "teaching-reset-edit") {
      await resetNormativeTeachingEdit();
    }
  });
  els.supportTeachingBody.addEventListener("change", (event) => {
    syncCurrentLawAutoScoreControl(event.target);
  });

  els.commentBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (await handleContranNormativeAction(button, event)) return;
    await handleHistoricalCommentAction(button, event);
  });

  els.commentBody.addEventListener("input", (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) {
      prepareHistoricalCommentTables(editor);
      saveHistoricalCommentSelection(editor);
      setHistoricalCommentStatus("");
    }
  });

  els.commentBody.addEventListener("paste", async (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) {
      if (await handleHistoricalCommentPaste(editor, event)) return;
      scheduleHistoricalTablePreparation(editor);
    }
  });

  els.commentBody.addEventListener("keyup", (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.commentBody.addEventListener("mouseup", (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.commentBody.addEventListener("focusout", (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.commentBody.addEventListener("change", async (event) => {
    if (handleContranNormativePreference(event.target)) return;
    const imageInput = event.target.closest(
      "[data-historical-comment-image-input]",
    );
    if (imageInput) {
      await handleHistoricalCommentImageInput(imageInput, event);
      return;
    }
    const colorInput = event.target.closest("[data-historical-comment-color]");
    if (colorInput) {
      await handleHistoricalCommentColor(colorInput, event);
      return;
    }
    const fontSizeSelect = event.target.closest(
      "[data-historical-comment-font-size]",
    );
    if (fontSizeSelect) {
      handleHistoricalCommentStyleSelect(fontSizeSelect, event, "fontSize");
      return;
    }
    const fontFamilySelect = event.target.closest(
      "[data-historical-comment-font-family]",
    );
    if (fontFamilySelect) {
      handleHistoricalCommentStyleSelect(fontFamilySelect, event, "fontFamily");
      return;
    }
    const lineHeightSelect = event.target.closest(
      "[data-historical-comment-line-height]",
    );
    if (lineHeightSelect) {
      handleHistoricalCommentStyleSelect(lineHeightSelect, event, "lineHeight");
    }
  });

  els.closeSupport.addEventListener("click", () => closeSupportPanel());
  els.supportOverlay.addEventListener("click", () => closeSupportPanel());
  // Avança para a próxima questão sem precisar fechar o painel antes (mobile).
  els.supportNextQuestion?.addEventListener("click", () => {
    closeSupportPanel();
    goNext();
  });
  els.supportTabs.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.supportTab || "comment";
      openSupportPanel(tab, { keepFocus: true });
      if (tab === "similar") loadSimilarQuestions();
    });
  });

  els.inlineSupportTabs?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-inline-support-tab]");
    if (!button || button.disabled) return;
    const tab = button.dataset.inlineSupportTab || "comment";
    state.inlineSupportTab = tab;
    if (tab === "similar") await loadSimilarQuestions();
    if (tab === "quickTheory") state.openedTheory = true;
    renderInlineSupportCard();
  });

  els.inlineOpenDrawer?.addEventListener("click", () => {
    openSupportPanel(state.inlineSupportTab || "comment");
  });

  els.inlineSupportBody?.addEventListener("click", async (event) => {
    const questionLinkTrigger = event.target.closest("[data-question-id]");
    if (questionLinkTrigger) {
      event.preventDefault();
      event.stopPropagation();
      const questionId = Number(questionLinkTrigger.dataset.questionId || 0);
      if (questionId)
        await openQuestionDirect(questionId, {
          fallbackHref: questionLinkTrigger.href,
        });
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      if (await handleContranNormativeAction(actionButton, event)) {
        return;
      } else if (
        String(actionButton.dataset.action || "").startsWith(
          "historical-comment-",
        )
      ) {
        await handleHistoricalCommentAction(actionButton, event);
      } else {
        await handleInlineSupportAction(actionButton, event);
      }
    }
  });

  els.inlineSupportBody?.addEventListener("input", (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) {
      prepareHistoricalCommentTables(editor);
      saveHistoricalCommentSelection(editor);
      setHistoricalCommentStatus("");
    }
  });

  els.inlineSupportBody?.addEventListener("paste", async (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) {
      if (await handleHistoricalCommentPaste(editor, event)) return;
      scheduleHistoricalTablePreparation(editor);
    }
  });

  els.inlineSupportBody?.addEventListener("keyup", (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.inlineSupportBody?.addEventListener("mouseup", (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.inlineSupportBody?.addEventListener("focusout", (event) => {
    const editor = event.target.closest("[data-historical-comment-editor]");
    if (editor) saveHistoricalCommentSelection(editor);
  });

  els.inlineSupportBody?.addEventListener("change", async (event) => {
    if (handleContranNormativePreference(event.target)) {
      return;
    }
    if (syncCurrentLawAutoScoreControl(event.target)) {
      return;
    }
    const imageInput = event.target.closest(
      "[data-historical-comment-image-input]",
    );
    if (imageInput) {
      await handleHistoricalCommentImageInput(imageInput, event);
      return;
    }
    const colorInput = event.target.closest("[data-historical-comment-color]");
    if (colorInput) {
      await handleHistoricalCommentColor(colorInput, event);
      return;
    }
    const fontSizeSelect = event.target.closest(
      "[data-historical-comment-font-size]",
    );
    if (fontSizeSelect) {
      handleHistoricalCommentStyleSelect(fontSizeSelect, event, "fontSize");
      return;
    }
    const fontFamilySelect = event.target.closest(
      "[data-historical-comment-font-family]",
    );
    if (fontFamilySelect) {
      handleHistoricalCommentStyleSelect(fontFamilySelect, event, "fontFamily");
      return;
    }
    const lineHeightSelect = event.target.closest(
      "[data-historical-comment-line-height]",
    );
    if (lineHeightSelect) {
      handleHistoricalCommentStyleSelect(lineHeightSelect, event, "lineHeight");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.supportOpen) {
      closeSupportPanel();
    }
  });

  document.addEventListener(
    "pointerdown",
    handleHistoricalTableResizePointerDown,
  );

  els.confidenceOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-confidence]");
    if (!button) return;
    els.confidenceSelect.value = button.dataset.confidence || "sure";
    renderConfidenceOptions();
  });

  els.secondaryExplain.addEventListener("click", () => {
    runAnswerAction(els.secondaryExplain.dataset.action || "explain");
  });

  els.similarQuestions.addEventListener("click", () => showSimilarPanel());

  els.excludeFromStudy.addEventListener("click", () =>
    updateQuestionStudyStatus("excluded"),
  );
  els.reviewLater.addEventListener("click", () =>
    updateQuestionStudyStatus("review_later"),
  );
  els.restoreToStudy.addEventListener("click", () =>
    updateQuestionStudyStatus("active"),
  );
  els.questionEditToggle?.addEventListener("click", () => {
    if (!state.currentQuestion) return;
    state.questionEditMode = !state.questionEditMode;
    state.questionEditStatus = "";
    renderQuestionEditPanel(state.currentQuestion);
  });
  els.questionEditPanel?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action !== "question-edit-cancel") return;
    state.questionEditMode = false;
    state.questionEditStatus = "";
    renderQuestionEditPanel(state.currentQuestion);
  });
  els.questionEditPanel?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveQuestionCoreEdit(event.currentTarget.querySelector("form"));
  });

  els.answerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = els.submitAnswer.dataset.action || "respond";
    if (action !== "respond") {
      await runAnswerAction(action);
      return;
    }

    const selected = new FormData(els.answerForm).get("answer");
    if (!state.selectedId || !selected) {
      return;
    }

    els.submitAnswer.disabled = true;
    const elapsedMs = getQuestionElapsedMs();
    pauseQuestionTimer();
    try {
      const result = await api(`/api/questions/${state.selectedId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer: selected,
          confidence: els.confidenceSelect.value,
          errorType: els.errorTypeSelect.value,
          elapsedMs,
          studyMode: state.studyMode,
          sessionId: state.sessionId,
          sawComment: state.sawComment,
          openedTheory: state.openedTheory,
        }),
      });
      // A resposta já está gravada aqui; avisa o painel antes de renderizar,
      // para que um erro de renderização não impeça a atualização dos contadores.
      document.dispatchEvent(new CustomEvent("study:progress"));
      renderAnswerResult(result);
      loadStats().catch(() => {});
    } catch (error) {
      syncQuestionTimerTracking();
      showAnswerSubmitError(error);
    }
  });

  els.alternatives.addEventListener("click", (event) => {
    const label = event.target.closest(".alternative");
    if (!label) {
      return;
    }

    event.preventDefault();
    cycleAlternative(label);
  });

  els.answerForm.addEventListener("change", (event) => {
    if (event.target?.name === "answer") {
      renderSelectedAlternative();
      updateAnswerActions();
    }
  });
}

function syncMobileStudyStatusDisclosure() {
  if (!els.studyStatusControl) return;
  if (mobileLayoutQuery.matches) {
    els.studyStatusControl.removeAttribute("open");
  } else {
    els.studyStatusControl.setAttribute("open", "");
  }
}

function bindDropdowns() {
  document.querySelectorAll("[data-dropdown]").forEach((dropdown) => {
    const trigger = dropdown.querySelector("button[aria-expanded]");
    const menu = dropdown.querySelector(".dropdown-menu");
    if (!trigger || !menu) return;

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = menu.hidden;
      closeAllDropdowns();
      menu.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", String(willOpen));
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-dropdown]")) {
      closeAllDropdowns();
    }
  });
}

function activateContranUnpublishedMode() {
  state.filters.materia = "";
  state.filters.assunto = "";
  state.filters.examKey = "";
  state.filters.excludedMaterias = [];
  state.filters.includedMaterias = [];
  state.filters.normative = "";
  if (els.matterSelect) els.matterSelect.value = "";
  renderSubjectOptions();
  if (els.subjectSelect) els.subjectSelect.value = "";
  if (els.examInput) els.examInput.value = "";
  renderExcludedMatterOptions();
  if (els.normativeFilter) els.normativeFilter.value = "";
}

function activateManualQuestionListMode() {
  state.filters.hideStudyExcluded = state.studyMode !== "all";
  if (els.hideStudyExcluded) {
    els.hideStudyExcluded.checked = state.filters.hideStudyExcluded;
  }
}

function closeAllDropdowns() {
  document.querySelectorAll("[data-dropdown]").forEach((dropdown) => {
    const trigger = dropdown.querySelector("button[aria-expanded]");
    const menu = dropdown.querySelector(".dropdown-menu");
    if (!trigger || !menu) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  });
}

function clearFilters() {
  state.filters = {
    q: "",
    materia: "",
    assunto: "",
    examKey: "",
    excludedMaterias: [],
    includedMaterias: [],
    commented: false,
    unanswered: false,
    lastWrong: false,
    hideOutdated: false,
    hideStudyExcluded: state.studyMode !== "all",
    hideDuplicates: false,
    representative: false,
    normative: "",
    contranUnpublished: false,
    contranCurrentResolution: "",
    contranHistoricalResolution: "",
    contranAxis: "",
    contranTopic: "",
    contranSubtopic: "",
    contranQuestionType: "",
    contranDifficulty: "",
  };
  state.page = 1;
  els.searchInput.value = "";
  els.matterSelect.value = "";
  renderSubjectOptions();
  els.subjectSelect.value = "";
  if (els.examInput) els.examInput.value = "";
  renderExcludedMatterOptions();
  els.commentedOnly.checked = false;
  els.unansweredOnly.checked = false;
  els.wrongOnly.checked = false;
  els.hideOutdated.checked = false;
  els.hideStudyExcluded.checked = state.filters.hideStudyExcluded;
  els.hideDuplicates.checked = false;
  els.representativeOnly.checked = false;
  els.normativeFilter.value = "";
  if (els.contranUnpublishedOnly) els.contranUnpublishedOnly.checked = false;
  if (els.contranCurrentResolutionSelect)
    els.contranCurrentResolutionSelect.value = "";
  if (els.contranHistoricalResolutionSelect)
    els.contranHistoricalResolutionSelect.value = "";
  if (els.contranAxisSelect) els.contranAxisSelect.value = "";
  if (els.contranTopicSelect) els.contranTopicSelect.value = "";
  if (els.contranSubtopicSelect) els.contranSubtopicSelect.value = "";
  if (els.contranQuestionTypeSelect) els.contranQuestionTypeSelect.value = "";
  if (els.contranDifficultySelect) els.contranDifficultySelect.value = "";
  updateAdvancedFiltersSummary();
}

function updateAdvancedFiltersSummary() {
  const active = [
    state.filters.q,
    state.filters.materia,
    state.filters.assunto,
    state.filters.examKey,
    state.filters.excludedMaterias.length,
    state.filters.commented,
    state.filters.unanswered,
    state.filters.lastWrong,
    state.filters.hideOutdated,
    state.filters.hideStudyExcluded,
    state.filters.hideDuplicates,
    state.filters.representative,
    state.filters.normative,
    state.filters.contranUnpublished,
    state.filters.contranCurrentResolution,
    state.filters.contranHistoricalResolution,
    state.filters.contranAxis,
    state.filters.contranTopic,
    state.filters.contranSubtopic,
    state.filters.contranQuestionType,
    state.filters.contranDifficulty,
  ].filter(Boolean).length;

  els.activeFiltersLabel.textContent = `(${active} ativo${active === 1 ? "" : "s"})`;
}

function setStudyMode(mode) {
  state.studyMode = mode;
  state.filters.hideStudyExcluded = mode !== "all";
  if (els.hideStudyExcluded) {
    els.hideStudyExcluded.checked = state.filters.hideStudyExcluded;
  }
  const labels = {
    study: "Modo: Estudo livre",
    smart: "Modo: Estudar agora",
    adaptive: "Plano: PRF Otimizado",
    all: "Modo: Ver todas",
    review: "Modo: Revisar hoje",
    repair: "Plano: Revisar erros",
    unanswered: "Modo: Não resolvidas",
    coverage: "Modo: Varrer o banco",
    subject: "Modo: Trocar assunto",
    examSource: "Modo: Prova selecionada",
  };
  els.modeMenuButton.textContent = labels[mode] || labels.study;
  updateAdvancedFiltersSummary();
}

async function runAnswerAction(action) {
  if (action === "next") {
    await goNext();
    return;
  }
  if (action === "history") {
    openSupportPanel("history");
    return;
  }
  if (action === "theory") {
    showTheoryPanel();
    return;
  }
  showCommentPanel();
}

async function loadResumeTarget() {
  const params = buildQuestionParams();
  params.set("plan", "prf_otimizado");
  if (state.activeProfile) params.set("profile", state.activeProfile);
  setStudyMode("adaptive");
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
  els.confidenceOptions
    .querySelectorAll("[data-confidence]")
    .forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.confidence === els.confidenceSelect.value,
      );
    });
}

async function loadStudyState() {
  const studyState = await api("/api/study-state");
  state.resumeLast = studyState.resumeLast;
  els.resumeLast.checked = studyState.resumeLast;
  return studyState;
}

function getInitialTargetId() {
  const params = new URLSearchParams(window.location.search);
  return (
    Number(
      params.get("targetId") ||
        params.get("questionId") ||
        params.get("q_id") ||
        0,
    ) || null
  );
}

function questionLink(questionId) {
  const resolvedId = resolveQuestionId(questionId);
  const url = new URL(window.location.href);
  if (resolvedId) {
    url.searchParams.set("targetId", String(resolvedId));
  } else {
    url.searchParams.delete("targetId");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function resolveQuestionId(value) {
  if (value && typeof value === "object") {
    return (
      Number(
        value.questionId ||
          value.question_id ||
          value.questionid ||
          value.id ||
          value.idQuestion ||
          value.id_question ||
          0,
      ) || 0
    );
  }
  return Number(value || 0) || 0;
}

function updateQuestionUrl(questionId, options = {}) {
  if (!window.history?.pushState) return;
  const url = new URL(window.location.href);
  url.searchParams.set("targetId", String(questionId));
  const method = options.replace ? "replaceState" : "pushState";
  window.history[method]({}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function saveStudyState(payload) {
  return api("/api/study-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function loadStats() {
  const stats = await api("/api/stats");
  els.stats.innerHTML = [
    statMarkup(
      stats.readyToStudy ?? stats.knownAnswers ?? 0,
      "prontas para estudar",
    ),
    statMarkup(stats.dueReviews || 0, "revisar hoje"),
    statMarkup(stats.repairQuestions || 0, "revisar erros"),
    statMarkup(stats.answered || 0, "resolvidas"),
    stats.contranPrfUnpublished
      ? statMarkup(stats.contranPrfUnpublished, "ineditas PRF/CONTRAN")
      : "",
  ].join("");
  state.studyTimeSummary = stats.studyTime || {};
  renderStudyTimeSummary();
}

async function loadFilters() {
  const filters = await api("/api/filters");
  state.subjects = filters.subjects || [];

  els.matterSelect.innerHTML =
    '<option value="">Todas</option>' +
    (filters.matters || [])
      .map(
        (matter) =>
          `<option value="${escapeAttr(matter.name)}">${escapeHtml(matter.name)} (${matter.count})</option>`,
      )
      .join("");
  renderExcludedMatterOptions(filters.matters || []);
  renderIncludedMatterOptions(filters.matters || []);

  renderSubjectOptions();
  renderContranUnpublishedFilterOptions(filters.contranUnpublished || {});
}

function renderContranUnpublishedFilterOptions(filters = {}) {
  const disabled = !filters.available;
  if (els.contranUnpublishedOnly) {
    const reason =
      filters.reason ||
      "Banco de questoes ineditas indisponivel no servidor ativo.";
    els.contranUnpublishedOnly.disabled = disabled;
    els.contranUnpublishedOnly.title = disabled ? reason : "";
    els.contranUnpublishedOnly
      .closest("label")
      ?.setAttribute("title", disabled ? reason : "");
  }
  const controls = [
    [
      els.contranCurrentResolutionSelect,
      filters.currentResolutions || [],
      "Todas",
    ],
    [
      els.contranHistoricalResolutionSelect,
      filters.historicalResolutions || [],
      "Todas",
    ],
    [els.contranAxisSelect, filters.axes || [], "Todos"],
    [els.contranTopicSelect, filters.topics || [], "Todos"],
    [els.contranSubtopicSelect, filters.subtopics || [], "Todos"],
    [els.contranQuestionTypeSelect, filters.types || [], "Todos"],
    [els.contranDifficultySelect, filters.difficulties || [], "Todas"],
  ];
  for (const [control, rows, emptyLabel] of controls) {
    if (!control) continue;
    const current = control.value;
    control.disabled = disabled;
    control.innerHTML =
      `<option value="">${escapeHtml(emptyLabel)}</option>` +
      rows
        .map((row) => {
          const value = row.value || "";
          return `<option value="${escapeAttr(value)}">${escapeHtml(formatContranFilterValue(value))} (${Number(row.count || 0).toLocaleString("pt-BR")})</option>`;
        })
        .join("");
    control.value = [...control.options].some(
      (option) => option.value === current,
    )
      ? current
      : "";
  }
}

function formatContranFilterValue(value) {
  const text = String(value || "");
  const labels = {
    CERTO_ERRADO: "Certo/Errado",
    MULTIPLA_ESCOLHA: "Múltipla escolha",
    facil: "Fácil",
    medio: "Médio",
    dificil: "Difícil",
  };
  return labels[text] || text;
}

function renderExcludedMatterOptions(matters) {
  const selected = new Set(state.filters.excludedMaterias || []);
  if (!Array.isArray(matters)) {
    els.excludedMatterList
      .querySelectorAll('input[name="excludeMateria"]')
      .forEach((input) => {
        input.checked = selected.has(input.value);
      });
    return;
  }
  els.excludedMatterList.innerHTML = matters
    .map((matter) => {
      const value = matter.name || "";
      return `
      <label class="matter-exclusion-option">
        <input type="checkbox" name="excludeMateria" value="${escapeAttr(value)}" ${selected.has(value) ? "checked" : ""}>
        <span>${escapeHtml(value)} (${Number(matter.count || 0).toLocaleString("pt-BR")})</span>
      </label>
    `;
    })
    .join("");
}

function selectedExcludedMatterValues() {
  return [
    ...els.excludedMatterList.querySelectorAll(
      'input[name="excludeMateria"]:checked',
    ),
  ]
    .map((input) => input.value)
    .filter(Boolean);
}

function renderIncludedMatterOptions(matters) {
  if (!els.includedMatterList) return;
  const selected = new Set(state.filters.includedMaterias || []);
  if (!Array.isArray(matters)) {
    els.includedMatterList
      .querySelectorAll('input[name="includeMateria"]')
      .forEach((input) => {
        input.checked = selected.has(input.value);
      });
    return;
  }
  els.includedMatterList.innerHTML = matters
    .map((matter) => {
      const value = matter.name || "";
      return `
      <label class="matter-exclusion-option">
        <input type="checkbox" name="includeMateria" value="${escapeAttr(value)}" ${selected.has(value) ? "checked" : ""}>
        <span>${escapeHtml(value)} (${Number(matter.count || 0).toLocaleString("pt-BR")})</span>
      </label>
    `;
    })
    .join("");
  updateMultiMateriaCount();
}

function selectedIncludedMatterValues() {
  if (!els.includedMatterList) return [];
  return [
    ...els.includedMatterList.querySelectorAll(
      'input[name="includeMateria"]:checked',
    ),
  ]
    .map((input) => input.value)
    .filter(Boolean);
}

function updateMultiMateriaCount() {
  if (!els.multiMateriaCount) return;
  const n = (state.filters.includedMaterias || []).length;
  els.multiMateriaCount.textContent = n ? `(${n})` : "";
}

async function loadExamProfiles() {
  const data = await api("/api/exam-profiles");
  state.activeProfile = data.active || "";
  state.examProfiles = data.profiles || [];
  els.profileSelect.innerHTML = (data.profiles || [])
    .map(
      (profile) =>
        `<option value="${escapeAttr(profile.id)}">${escapeHtml(profile.name)}</option>`,
    )
    .join("");
  els.profileSelect.value = state.activeProfile;
  renderStudyPlanLabel();
}

function renderStudyPlanLabel() {
  if (!els.studyPlanLabel) return;
  const profile = state.examProfiles.find(
    (item) => item.id === state.activeProfile,
  );
  const label = profile?.name || "Plano PRF";
  els.studyPlanLabel.textContent = label;
  els.studyPlanLabel.title = label;
}

function renderSubjectOptions() {
  const filtered = state.filters.materia
    ? state.subjects.filter(
        (subject) => subject.materia === state.filters.materia,
      )
    : state.subjects;

  els.subjectSelect.innerHTML =
    '<option value="">Todos</option>' +
    filtered
      .map(
        (subject) =>
          `<option value="${escapeAttr(subject.name)}">${escapeHtml(subject.name)} (${subject.count})</option>`,
      )
      .join("");
  els.subjectSelect.value = state.filters.assunto;
}

async function loadExamOptions(query = "") {
  if (!els.examOptions) return;
  const params = new URLSearchParams({ limit: query ? "120" : "80" });
  if (query) params.set("q", query);
  const data = await api(`/api/exams?${params}`);
  state.exams = data.exams || [];
  state.examOptionByLabel = new Map();
  els.examOptions.innerHTML = state.exams
    .map((exam) => {
      const details = exam.details ? ` - ${exam.details}` : "";
      const count = Number(exam.count || 0).toLocaleString("pt-BR");
      const label = `${exam.label}${details} (${count})`;
      state.examOptionByLabel.set(label, exam);
      return `<option value="${escapeAttr(label)}"></option>`;
    })
    .join("");
}

async function applyExamFilterOption(exam) {
  state.filters.examKey = exam?.key || "";
  state.page = 1;
  updateAdvancedFiltersSummary();
  setStudyMode("examSource");
  await loadQuestions();
  if (state.subjectsVisible) await loadSubjectsRanking();
  if (state.normativeVisible) await loadNormativeReview();
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
  els.timerLabel.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  renderStudyTimeSummary();
}

function resetQuestionTimer() {
  state.questionStartedAt = Date.now();
  state.questionActiveElapsedMs = 0;
  state.questionTimerStartedAt = null;
  state.questionTimerRunning = false;
}

function shouldTrackQuestionTime() {
  return (
    Boolean(state.selectedId) &&
    document.visibilityState === "visible" &&
    document.hasFocus()
  );
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
  const activeRunMs =
    state.questionTimerRunning && state.questionTimerStartedAt
      ? Date.now() - state.questionTimerStartedAt
      : 0;
  return Math.max(0, state.questionActiveElapsedMs + activeRunMs);
}

function renderMastery(mastery) {
  const score = Math.round(Number(mastery?.score || 0) * 100);
  els.masteryScore.textContent = `${score}%`;
  els.masteryLabel.textContent = masteryLabel(score);
  els.nextDue.textContent = mastery?.nextDueAt
    ? formatDate(mastery.nextDueAt)
    : "sem data";
}

async function loadQuestions(options = {}) {
  const requestToken = options.requestToken || beginQuestionRequest();
  renderQuestionLoading("Carregando questoes dos filtros atuais...");
  const params = buildQuestionParams();
  if (options.targetId) {
    params.set("targetId", String(options.targetId));
  }

  const data = await api(`/api/questions?${params}`);
  if (!isCurrentQuestionRequest(requestToken)) return false;
  state.page = data.page;
  state.totalPages = data.totalPages;
  state.total = data.total;
  state.rows = data.rows || [];

  if (data.targetIndex >= 0) {
    state.rowIndex = data.targetIndex;
  } else {
    state.rowIndex = options.selectLast
      ? Math.max(0, state.rows.length - 1)
      : 0;
  }

  if (!state.rows.length) {
    renderEmptyQuestion(data.emptyMessage || "");
    return;
  }

  const selected = await selectQuestion(state.rows[state.rowIndex].id, {
    adaptiveTarget: options.adaptiveTarget,
    requestToken,
  });
  if (selected === false) return false;
  renderPager();
  return true;
}

function beginQuestionRequest() {
  questionRequestToken += 1;
  return questionRequestToken;
}

function isCurrentQuestionRequest(requestToken) {
  return !requestToken || requestToken === questionRequestToken;
}

function renderQuestionLoading(message = "Carregando questao...") {
  state.selectedId = null;
  state.currentQuestion = null;
  state.answerResult = null;
  state.eliminatedAnswers = new Set();
  state.theoryUrl = "";
  state.questionEditMode = false;
  state.questionEditStatus = "";
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  resetQuestionTimer();
  if (els.pageLabel) els.pageLabel.textContent = "...";
  if (els.questionMeta) els.questionMeta.textContent = "Carregando";
  if (els.questionQuickStatus)
    els.questionQuickStatus.textContent = "Buscando questoes";
  if (els.questionTitle) els.questionTitle.textContent = "Questao";
  if (els.statement)
    els.statement.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
  renderQuestionEditPanel(null);
  if (els.alternatives) els.alternatives.innerHTML = "";
  if (els.answerStatus) els.answerStatus.textContent = "";
  if (els.answerHint) els.answerHint.textContent = "Aguarde o carregamento";
  if (els.submitAnswer) els.submitAnswer.disabled = true;
}

async function loadCurrentModeTarget() {
  if (state.studyMode === "review") {
    await loadAdaptiveTarget("revisar_hoje");
    return;
  }

  if (state.studyMode === "repair") {
    await loadAdaptiveTarget("revisar_erros");
    return;
  }

  if (state.studyMode === "coverage") {
    await loadAdaptiveTarget("prf_otimizado");
    return;
  }

  if (["study", "smart", "adaptive"].includes(state.studyMode)) {
    setStudyMode("adaptive");
    await loadAdaptiveTarget("prf_otimizado");
    return;
  }

  await loadQuestions();
}

function buildQuestionParams() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(PAGE_SIZE),
  });
  if (state.filters.q) params.set("q", state.filters.q);
  // Modo "varrer o banco": só questões nunca respondidas (cobertura).
  if (state.studyMode === "coverage") params.set("unanswered", "1");
  if (state.filters.materia) params.set("materia", state.filters.materia);
  for (const materia of state.filters.includedMaterias || [])
    params.append("includeMateria", materia);
  for (const materia of state.filters.excludedMaterias)
    params.append("excludeMateria", materia);
  if (state.filters.assunto) params.set("assunto", state.filters.assunto);
  if (state.filters.examKey) params.set("examKey", state.filters.examKey);
  if (state.filters.commented) params.set("commented", "1");
  if (state.filters.unanswered) params.set("unanswered", "1");
  if (state.filters.lastWrong) params.set("lastWrong", "1");
  if (state.filters.hideOutdated) params.set("hideOutdated", "1");
  if (state.filters.hideStudyExcluded) params.set("hideStudyExcluded", "1");
  if (state.filters.hideDuplicates) params.set("hideDuplicates", "1");
  if (state.filters.representative) params.set("representative", "1");
  if (state.filters.normative) params.set("normative", state.filters.normative);
  if (state.filters.contranUnpublished)
    params.set("unpublished", "contran-prf");
  if (state.filters.contranCurrentResolution)
    params.set("currentResolution", state.filters.contranCurrentResolution);
  if (state.filters.contranHistoricalResolution)
    params.set(
      "historicalResolution",
      state.filters.contranHistoricalResolution,
    );
  if (state.filters.contranAxis) params.set("axis", state.filters.contranAxis);
  if (state.filters.contranTopic)
    params.set("topic", state.filters.contranTopic);
  if (state.filters.contranSubtopic)
    params.set("subtopic", state.filters.contranSubtopic);
  if (state.filters.contranQuestionType)
    params.set("questionType", state.filters.contranQuestionType);
  if (state.filters.contranDifficulty)
    params.set("difficulty", state.filters.contranDifficulty);
  return params;
}

function renderEmptyQuestion(message = "") {
  state.selectedId = null;
  state.currentQuestion = null;
  state.answerResult = null;
  state.eliminatedAnswers = new Set();
  state.theoryUrl = "";
  state.questionEditMode = false;
  state.questionEditStatus = "";
  state.supportOpen = false;
  state.supportTab = "comment";
  state.inlineSupportTab = "comment";
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  resetQuestionTimer();
  els.timerLabel.textContent = "00:00";
  els.masteryScore.textContent = "0%";
  els.masteryLabel.textContent = "Novo";
  els.nextDue.textContent = "sem data";
  els.questionTitle.textContent = "Questão";
  els.questionMeta.textContent = "Nenhuma questão encontrada";
  els.questionQuickStatus.textContent = "Sem resultado para os filtros atuais";
  renderQuestionBadges(null);
  renderContranPrf2021QuestionAlert(null);
  els.normativeAlert.hidden = true;
  els.normativeAlert.innerHTML = "";
  renderQuestionEditPanel(null);
  els.statement.innerHTML = `<p class="empty">${escapeHtml(message || "Nenhuma questão encontrada para os filtros atuais. Tente limpar os filtros ou mudar de assunto.")}</p>`;
  els.alternatives.innerHTML = "";
  els.answerStatus.textContent = "";
  els.answerStatus.disabled = true;
  els.answerDetails.hidden = true;
  els.answerDetails.innerHTML = "";
  els.answerResult.hidden = true;
  els.answerResult.innerHTML = "";
  if (els.inlineSupportCard) els.inlineSupportCard.hidden = true;
  if (els.inlineSupportBody) els.inlineSupportBody.innerHTML = "";
  els.answerHint.textContent = "Sem questão selecionada";
  els.errorTypeWrapper.hidden = true;
  els.teachingInfo.textContent = "";
  els.supportTeachingBody.innerHTML =
    '<p class="empty">Nenhum comentário atualizado carregado.</p>';
  if (els.supportTabTeaching) els.supportTabTeaching.disabled = true;
  if (els.appliedTheoryInfo) els.appliedTheoryInfo.textContent = "";
  if (els.supportAppliedTheoryBody)
    els.supportAppliedTheoryBody.innerHTML =
      '<p class="empty">Nenhuma teoria aplicada carregada.</p>';
  if (els.supportTabAppliedTheory) els.supportTabAppliedTheory.disabled = true;
  els.commentInfo.textContent = "";
  els.commentBody.innerHTML =
    '<p class="empty">Nenhuma explicação carregada.</p>';
  els.supportTheoryBody.innerHTML =
    '<p class="empty">Nenhuma teoria carregada.</p>';
  els.supportHistoryBody.innerHTML =
    '<p class="empty">Nenhum histórico carregado.</p>';
  els.similarInfo.textContent = "";
  els.supportSimilarBody.innerHTML =
    '<p class="empty">Nenhuma família carregada.</p>';
  renderStudyStatusControl(null);
  els.submitAnswer.disabled = true;
  els.submitAnswer.textContent = "Responder";
  els.submitAnswer.dataset.action = "respond";
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
  if (
    state.studyMode === "adaptive" ||
    state.studyMode === "smart" ||
    state.studyMode === "coverage"
  ) {
    await loadAdaptiveTarget("prf_otimizado");
    return;
  }

  if (state.studyMode === "review") {
    await loadAdaptiveTarget("revisar_hoje");
    return;
  }

  if (state.studyMode === "repair") {
    await loadAdaptiveTarget("revisar_erros");
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
  params.set("mode", mode);
  params.set("currentId", String(state.selectedId));
  const target = await api(`/api/navigate?${params}`);
  if (!target.id) {
    els.answerStatus.textContent = target.reason || "Nada encontrado";
    return;
  }

  if (target.mode === "subject") {
    state.filters.q = "";
    state.filters.materia = target.materia || "";
    state.filters.assunto = target.assunto || "";
    els.searchInput.value = "";
    els.matterSelect.value = state.filters.materia;
    renderSubjectOptions();
    els.subjectSelect.value = state.filters.assunto;
    state.page = 1;
    updateAdvancedFiltersSummary();
  }

  if (target.mode === "unanswered") {
    state.filters.q = "";
    state.filters.unanswered = true;
    state.filters.lastWrong = false;
    els.searchInput.value = "";
    els.unansweredOnly.checked = true;
    els.wrongOnly.checked = false;
    state.page = 1;
    updateAdvancedFiltersSummary();
  }

  if (target.mode === "smart") {
    state.page = 1;
  }

  if (target.mode === "due") {
    state.page = 1;
  }

  await loadQuestions({ targetId: target.id });
}

async function loadSmartQueueV2Target() {
  return loadAdaptiveTarget("prf_otimizado");
}

async function loadAdaptiveTarget(plan = "prf_otimizado") {
  const requestToken = beginQuestionRequest();
  const params = buildQuestionParams();
  params.set("plan", plan);
  if (state.activeProfile) params.set("profile", state.activeProfile);
  const target = await api(`/api/adaptive-study/next?${params}`);
  if (!isCurrentQuestionRequest(requestToken)) return false;
  if (!target?.questionId) {
    els.answerStatus.textContent = target.error || "Nada encontrado";
    return loadQuestions({ requestToken });
  }
  state.adaptiveTarget = target;
  state.page = 1;
  return loadQuestions({
    targetId: target.questionId,
    adaptiveTarget: target,
    requestToken,
  });
}

async function recordQuestionEvent(eventType, eventValue = "") {
  if (!state.selectedId) {
    return;
  }
  await api(`/api/questions/${state.selectedId}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, eventValue }),
  }).catch(() => {});
}

async function loadSubjectsRanking() {
  els.subjectsInfo.textContent = "carregando";
  els.subjectsList.innerHTML = '<p class="empty">Carregando assuntos...</p>';

  const params = new URLSearchParams({ limit: "80" });
  if (state.filters.q) params.set("q", state.filters.q);
  if (state.filters.materia) params.set("materia", state.filters.materia);
  for (const materia of state.filters.includedMaterias || [])
    params.append("includeMateria", materia);
  for (const materia of state.filters.excludedMaterias)
    params.append("excludeMateria", materia);
  if (state.filters.examKey) params.set("examKey", state.filters.examKey);
  if (state.filters.hideOutdated) params.set("hideOutdated", "1");
  if (state.filters.hideStudyExcluded) params.set("hideStudyExcluded", "1");

  const [data, coverage] = await Promise.all([
    api(`/api/subjects-ranking?${params}`),
    api(
      `/api/exam-coverage?profile=${encodeURIComponent(state.activeProfile || "")}`,
    ),
  ]);
  const rows = data.rows || [];
  els.subjectsInfo.textContent = `${rows.length} assunto${rows.length === 1 ? "" : "s"}`;
  const strategic = [...(coverage.rows || [])].sort(
    (left, right) =>
      Number(right.strategic_priority || 0) -
      Number(left.strategic_priority || 0),
  );
  els.subjectsList.innerHTML = `
    <div class="ranking-block">
      <h2>Mais presentes na minha base</h2>
      ${rows.length ? rows.map((row, index) => subjectRowMarkup(row, index)).join("") : '<p class="empty">Nenhum assunto encontrado para os filtros atuais.</p>'}
    </div>
    <div class="ranking-block">
      <h2>Mais importantes para a prova</h2>
      ${strategic.map((row, index) => strategicRowMarkup(row, index)).join("")}
    </div>
  `;
}

async function loadExamCoverage() {
  els.coverageInfo.textContent = "carregando";
  els.coverageTable.innerHTML = '<p class="empty">Carregando cobertura...</p>';
  els.coverageAlerts.innerHTML = "";
  const data = await api(
    `/api/exam-coverage?profile=${encodeURIComponent(state.activeProfile || "")}`,
  );
  const rows = data.rows || [];
  els.coverageInfo.textContent =
    data.profile?.name || state.activeProfile || "";
  els.coverageAlerts.innerHTML = (data.alerts || [])
    .slice(0, 4)
    .map((alert) => `<p>${escapeHtml(alert)}</p>`)
    .join("");
  els.coverageTable.innerHTML = rows.length
    ? `${coverageLegendMarkup()}${coverageHeaderMarkup()}${rows.map((row) => coverageRowMarkup(row)).join("")}`
    : '<p class="empty">Nenhum mapeamento encontrado para este perfil.</p>';
}

async function loadTheoryCoverage() {
  if (!els.theoryCoverageInfo || !els.theoryCoverageTable) return;
  els.theoryCoverageInfo.textContent = "carregando";
  els.theoryCoverageStats.innerHTML = "";
  els.theoryCoverageTable.innerHTML =
    '<p class="empty">Carregando cobertura de teoria...</p>';
  const data = await api("/api/legal-dashboard");
  if (!data.available) {
    els.theoryCoverageInfo.textContent = "sem camada criada";
    els.theoryCoverageTable.innerHTML = `<p class="empty">${escapeHtml(data.reason || "Camada de teoria rapida indisponivel.")}</p>`;
    return;
  }
  const stats = data.stats || {};
  els.theoryCoverageInfo.textContent = `${Number(stats.specificQuickTheory || 0).toLocaleString("pt-BR")} teorias especificas seguras`;
  els.theoryCoverageStats.innerHTML = [
    statMarkup(stats.sources, "fontes"),
    statMarkup(stats.articles, "artigos"),
    statMarkup(stats.cards, "microcards"),
    statMarkup(stats.links, "vinculos"),
    statMarkup(stats.specificQuickTheory, "especificas"),
    statMarkup(stats.panoramaOnly, "panoramas"),
    statMarkup(stats.needsTheoryReview, "revisao"),
    statMarkup(stats.currentLawReferenceOnly, "refs atuais"),
    statMarkup(stats.withoutQuickTheory, "sem apoio"),
    statMarkup(stats.importErrors, "erros fonte"),
  ].join("");
  const rows = data.bySubject || [];
  els.theoryCoverageTable.innerHTML = rows.length
    ? `${theoryCoverageLegendMarkup()}${theoryCoverageHeaderMarkup()}${rows
        .slice(0, 40)
        .map((row) => theoryCoverageRowMarkup(row))
        .join("")}`
    : '<p class="empty">Nenhuma lacuna de teoria encontrada.</p>';
}

async function loadNormativeReview() {
  els.normativeInfo.textContent = "carregando";
  els.normativeTable.innerHTML =
    '<p class="empty">Carregando revisão normativa...</p>';
  const [stats, list] = await Promise.all([
    api("/api/normative-updates/stats"),
    api(`/api/normative-updates?${buildNormativeReviewParams()}`),
  ]);

  if (!stats.exists) {
    els.normativeInfo.textContent = "sem dados importados";
    els.normativeStats.innerHTML =
      '<p class="empty">Nenhuma análise normativa importada ainda.</p>';
    els.normativeTable.innerHTML = "";
    return;
  }

  els.normativeInfo.textContent = `${Number(list.total || 0).toLocaleString("pt-BR")} item(ns) filtrado(s)`;
  populateNormativeSelect(
    els.normativeRecommendationFilter,
    stats.byRecommendation,
    "Todas",
  );
  populateNormativeSelect(
    els.normativeSecurityFilter,
    stats.bySecurity,
    "Todos",
  );
  populateNormativeSelect(
    els.normativeChangedFilter,
    stats.byChangedAnswer,
    "Todas",
  );
  els.normativeStats.innerHTML = [
    statMarkup(stats.total, "pendentes"),
    statMarkup(stats.adaptable, "adaptáveis"),
    statMarkup(stats.manualReview, "revisão manual"),
    statMarkup(stats.discardable, "descartáveis"),
    statMarkup(stats.changedAnswer, "gabarito alterado"),
    statMarkup(stats.teachingComments, "comentários atualizados"),
    statMarkup(stats.teachingMissing, "sem comentário atualizado"),
    statMarkup(stats.reviewed, "revisadas"),
  ].join("");
  els.normativeTable.innerHTML = list.rows?.length
    ? `${normativeLegendMarkup()}${normativeHeaderMarkup()}${list.rows.map((row) => normativeRowMarkup(row)).join("")}`
    : '<p class="empty">Nenhuma análise normativa encontrada para os filtros.</p>';
}

async function loadLawCompendiumOverview() {
  if (!els.lawCompendiumInfo || !els.lawSourceList || !els.lawSourceDetail)
    return;
  els.lawCompendiumInfo.textContent = "carregando";
  els.lawSourceList.innerHTML = '<p class="empty">Carregando normas...</p>';
  els.lawSourceDetail.innerHTML = '<p class="empty">Selecione uma norma.</p>';
  const data = await api("/api/law-compendium/overview");
  state.lawCompendiumOverview = data;
  if (!data.available) {
    els.lawCompendiumInfo.textContent = "sem dados";
    els.lawCompendiumStats.innerHTML = "";
    els.lawSourceList.innerHTML = "";
    els.lawSourceDetail.innerHTML = `<p class="empty">${escapeHtml(data.reason || "Apostila da Lei indisponivel.")}</p>`;
    return;
  }
  els.lawCompendiumInfo.textContent = `${Number(data.stats?.current || 0).toLocaleString("pt-BR")} vigentes validadas`;
  els.lawCompendiumStats.innerHTML = [
    statMarkup(data.stats?.current || 0, "vigentes"),
    statMarkup(data.stats?.historical || 0, "historicas"),
    statMarkup(data.stats?.pending || 0, "ocultas"),
    statMarkup(data.stats?.sections || 0, "secoes"),
  ].join("");
  renderLawSourceList(data);
  const first = data.current?.[0] || data.historical?.[0];
  if (first) await openLawSource(first.slug);
}

function renderLawSourceList(data) {
  const groups = [
    ["Apostila vigente", data.current || []],
    ["Histórico do edital (somente consulta)", data.historical || []],
  ];
  els.lawSourceList.innerHTML = groups
    .map(
      ([title, rows]) => `
    <section class="law-source-group">
      <strong>${escapeHtml(title)}</strong>
      ${rows.length ? rows.map((row) => lawSourceButtonMarkup(row)).join("") : '<p class="empty">Nenhuma norma.</p>'}
    </section>
  `,
    )
    .join("");
  els.lawSourceList.querySelectorAll("[data-law-source]").forEach((button) => {
    button.addEventListener("click", () =>
      openLawSource(button.dataset.lawSource || ""),
    );
  });
}

function lawSourceButtonMarkup(row) {
  const active = row.slug === state.activeLawSourceSlug ? " is-active" : "";
  const meta = [
    lawStatusLabel(row.status),
    row.sections
      ? `${Number(row.sections).toLocaleString("pt-BR")} secoes`
      : "",
    row.editalOrigin?.length
      ? `edital: ${row.editalOrigin.slice(0, 2).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" - ");
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
  state.activeLawSourceData = null;
  state.lawMaterialEditId = null;
  state.lawMaterialSelection = null;
  renderLawSourceList(
    state.lawCompendiumOverview || { current: [], historical: [], pending: [] },
  );
  els.lawSourceDetail.innerHTML = '<p class="empty">Carregando norma...</p>';
  const row = findLawSourceInOverview(slug);
  const mode =
    row?.status === "historical_revoked"
      ? "history"
      : state.lawCompendiumMode || "beginner";
  const data = await api(
    `/api/law-compendium/sources/${encodeURIComponent(slug)}?mode=${encodeURIComponent(mode)}`,
  );
  renderLawSourceDetail(data);
}

function findLawSourceInOverview(slug) {
  const overview = state.lawCompendiumOverview || {};
  return [
    ...(overview.current || []),
    ...(overview.historical || []),
    ...(overview.pending || []),
  ].find((row) => row.slug === slug);
}

function renderLawSourceDetail(data) {
  state.activeLawSourceData = data?.available && !data?.blocked ? data : null;
  if (!data.available) {
    state.activeLawSourceData = null;
    els.lawSourceDetail.innerHTML = `<p class="empty">${escapeHtml(data.reason || "Norma indisponivel.")}</p>`;
    return;
  }
  const source = data.source || {};
  if (data.blocked) {
    state.activeLawSourceData = null;
    els.lawSourceDetail.innerHTML = `
      <div class="law-source-head">
        <div>
          <strong>${escapeHtml(source.title || source.slug || "Norma")}</strong>
          <span>${escapeHtml(lawStatusLabel(source.status))}</span>
        </div>
      </div>
      <p class="normative-warning is-warning">${escapeHtml(data.reason || "Fonte bloqueada para a apostila vigente.")}</p>
      <p class="empty">${escapeHtml(source.validationNotes || "")}</p>
    `;
    return;
  }
  const isDryLaw = state.lawCompendiumMode === "dry";
  els.lawSourceDetail.innerHTML = `
    <div class="law-source-head">
      <div>
        <strong>${escapeHtml(source.title || source.slug || "Norma")}</strong>
        <span>${escapeHtml(lawStatusLabel(source.status))}${source.officialCheckedAt ? ` - checada em ${escapeHtml(formatFullDate(source.officialCheckedAt))}` : ""}</span>
      </div>
      <div class="law-mode-toggle" role="group" aria-label="Modo da apostila">
        <button class="button ${isDryLaw ? "button-secondary" : "button-primary"}" type="button" data-law-mode="beginner">Iniciante</button>
        <button class="button ${isDryLaw ? "button-primary" : "button-secondary"}" type="button" data-law-mode="dry">Lei seca</button>
      </div>
    </div>
    ${source.officialUrl ? `<a class="law-official-link" href="${escapeAttr(source.officialUrl)}" target="_blank" rel="noreferrer">Fonte oficial</a>` : ""}
    ${!isDryLaw ? lawSummaryMarkup(data.summary, source) : ""}
    <div class="law-sections">
      ${(data.sections || []).map((section) => lawSectionMarkup(section, isDryLaw)).join("") || '<p class="empty">Nenhuma seção extraída.</p>'}
    </div>
  `;
  els.lawSourceDetail.querySelectorAll("[data-law-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.lawCompendiumMode = button.dataset.lawMode || "beginner";
      await openLawSource(state.activeLawSourceSlug);
    });
  });
}

function lawSummaryMarkup(summary, source) {
  if (!summary)
    return '<p class="empty">Resumo ainda não criado. Rode build-law-compendium-summaries.</p>';
  return `
    <section class="law-summary">
      <strong>Resumo de estudo</strong>
      <p>${escapeHtml(summary.topSummary || "")}</p>
      ${lawBulletBlock("O que cobre", summary.whatItCovers)}
      ${lawBulletBlock("Pontos cobrados", summary.highYieldPoints)}
      ${lawBulletBlock("Pegadinhas", summary.commonTraps)}
      ${source.editalOrigin?.length ? lawBulletBlock("Histórico do edital", source.editalOrigin) : ""}
    </section>
  `;
}

function lawBulletBlock(title, items = []) {
  const rows = (items || []).filter(Boolean);
  if (!rows.length) return "";
  return `
    <div class="law-bullet-block">
      <span>${escapeHtml(title)}</span>
      <ul>${rows.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function lawSectionMarkup(section, isDryLaw) {
  const hierarchyLevel = section.hierarchyLevel || "item";
  if (["titulo", "capitulo", "secao"].includes(hierarchyLevel)) {
    const title =
      section.title && section.title !== section.displayRef
        ? section.title
        : "";
    return `
      <div class="law-divider is-${escapeAttr(hierarchyLevel)}">
        <strong>${escapeHtml(section.displayRef || title || "")}</strong>
        ${title ? `<span>${escapeHtml(title)}</span>` : ""}
      </div>
    `;
  }
  const related = !isDryLaw ? lawRelatedMarkup(section) : "";
  return `
    <article class="law-section is-${escapeAttr(hierarchyLevel)}" data-law-section-id="${escapeAttr(section.id || "")}">
      <p>${escapeHtml(lawSectionBodyText(section))}</p>
      ${lawSectionMaterialsMarkup(section.materials || [])}
      ${lawCrossRefsMarkup(section.crossReferences || [])}
      ${related}
      ${lawSectionMaterialFormMarkup(section)}
    </article>
  `;
}

function lawSectionMaterialsMarkup(materials = []) {
  const rows = (materials || []).filter(Boolean);
  return `
    <div class="law-materials" data-law-material-list aria-label="Materiais incluidos"${rows.length ? "" : " hidden"}>
      ${rows
        .map((material) => {
          const caption = material.caption
            ? `<span>${escapeHtml(material.caption)}</span>`
            : "";
          if (material.materialType === "image" && material.imageDataUrl) {
            return `
            <figure class="law-material is-image">
              <img src="${escapeAttr(material.imageDataUrl)}" alt="${escapeAttr(material.caption || material.imageName || "Imagem adicionada")}">
              <figcaption>
                ${caption || `<span>${escapeHtml(material.imageName || "Imagem adicionada")}</span>`}
                <button class="button button-ghost" type="button" data-action="law-material-delete" data-material-id="${escapeAttr(material.id)}">Excluir</button>
              </figcaption>
            </figure>
          `;
          }
          if (
            Number(state.lawMaterialEditId || 0) === Number(material.id || 0)
          ) {
            return `
            <div class="law-material is-text is-editing" data-law-material-card data-law-material-id="${escapeAttr(material.id)}">
              ${lawMaterialFormatToolbar({ saveAction: "law-material-save-edit", cancelAction: "law-material-cancel-edit" })}
              <div
                class="historical-comment-editor law-material-rich-editor"
                data-law-material-editor
                contenteditable="true"
                spellcheck="true"
                aria-label="Editor do material de texto"
              >${lawMaterialTextHtml(material)}</div>
              <label class="field">
                <span>Legenda</span>
                <input name="caption" type="text" maxlength="500" value="${escapeAttr(material.caption || "")}" data-law-material-caption>
              </label>
            </div>
          `;
          }
          return `
          <div class="law-material is-text" data-law-material-card data-law-material-id="${escapeAttr(material.id)}">
            <div class="law-material-content">${lawMaterialTextHtml(material)}</div>
            <div class="law-material-foot">
              ${caption}
              <span class="law-material-buttons">
                <button class="button button-secondary" type="button" data-action="law-material-edit" data-material-id="${escapeAttr(material.id)}">Editar</button>
                <button class="button button-ghost" type="button" data-action="law-material-delete" data-material-id="${escapeAttr(material.id)}">Excluir</button>
              </span>
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

function lawMaterialTextHtml(material) {
  if (material.bodyHtml) return material.bodyHtml;
  return paragraphsMarkup(material.bodyText || "");
}

function lawSectionMaterialFormMarkup(section) {
  const sectionId = Number(section.id || 0);
  if (!sectionId) return "";
  return `
    <details class="law-material-editor">
      <summary>Adicionar texto/imagem</summary>
      <form class="law-material-form" data-law-material-form data-section-id="${escapeAttr(sectionId)}">
        <label class="field compact-field">
          <span>Tipo</span>
          <select name="materialType" data-law-material-type>
            <option value="text">Texto</option>
            <option value="image">Imagem</option>
          </select>
        </label>
        <label class="field law-material-text-field">
          <span>Texto</span>
          ${lawMaterialFormatToolbar({ saveAction: "", cancelAction: "" })}
          <div
            class="historical-comment-editor law-material-rich-editor"
            data-law-material-editor
            contenteditable="true"
            spellcheck="true"
            aria-label="Editor do material de texto"
          ><p></p></div>
        </label>
        <label class="field law-material-image-field" hidden>
          <span>Imagem</span>
          <input name="imageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
        </label>
        <label class="field">
          <span>Legenda</span>
          <input name="caption" type="text" maxlength="500" placeholder="Opcional">
        </label>
        <div class="law-material-actions">
          <button class="button button-primary" type="submit">Salvar</button>
          <span data-law-material-status></span>
        </div>
      </form>
    </details>
  `;
}

function paragraphsMarkup(value) {
  const paragraphs = String(value || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!paragraphs.length) return "";
  return paragraphs
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function lawMaterialFormatToolbar({ saveAction = "", cancelAction = "" } = {}) {
  const fontFamilies = [
    ["Arial, Helvetica, sans-serif", "Arial"],
    ["Georgia, serif", "Georgia"],
    ["Times New Roman, Times, serif", "Times"],
    ["Verdana, Geneva, sans-serif", "Verdana"],
    ["Courier New, Courier, monospace", "Mono"],
  ];
  const fontSizes = [
    ["12px", "12"],
    ["14px", "14"],
    ["16px", "16"],
    ["18px", "18"],
    ["20px", "20"],
    ["24px", "24"],
    ["28px", "28"],
  ];
  const lineHeights = [
    ["1.2", "1.2"],
    ["1.4", "1.4"],
    ["1.6", "1.6"],
    ["1.8", "1.8"],
    ["2", "2.0"],
  ];
  const colorButtons = [
    ["#0f172a", "Preto"],
    ["#1d4ed8", "Azul"],
    ["#15803d", "Verde"],
    ["#b45309", "Âmbar"],
    ["#dc2626", "Vermelho"],
  ];
  return `
    <div class="historical-comment-toolbar is-editing law-material-toolbar" data-law-material-toolbar>
      <div class="historical-format-tools" aria-label="Formatação do material de texto">
        <button class="format-button" type="button" title="Negrito" data-action="law-material-format" data-command="bold"><strong>B</strong></button>
        <button class="format-button" type="button" title="Itálico" data-action="law-material-format" data-command="italic"><em>I</em></button>
        <button class="format-button" type="button" title="Sublinhado" data-action="law-material-format" data-command="underline"><span class="format-underline">U</span></button>
        <button class="format-button" type="button" title="Tachado" data-action="law-material-format" data-command="strikeThrough"><s>S</s></button>
        <span class="format-divider"></span>
        <button class="format-button" type="button" title="Alinhar à esquerda" data-action="law-material-format" data-command="justifyLeft"><span class="format-align is-left"></span></button>
        <button class="format-button" type="button" title="Centralizar" data-action="law-material-format" data-command="justifyCenter"><span class="format-align is-center"></span></button>
        <button class="format-button" type="button" title="Alinhar à direita" data-action="law-material-format" data-command="justifyRight"><span class="format-align is-right"></span></button>
        <span class="format-divider"></span>
        <button class="format-button" type="button" title="Reduzir recuo" data-action="law-material-format" data-command="outdent"><span class="format-indent is-outdent"></span></button>
        <button class="format-button" type="button" title="Aumentar recuo" data-action="law-material-format" data-command="indent"><span class="format-indent is-indent"></span></button>
        <span class="format-divider"></span>
        <select class="historical-format-select is-font-family" aria-label="Fonte" title="Fonte" data-law-material-font-family>
          <option value="">Fonte</option>
          ${fontFamilies.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("")}
        </select>
        <select class="historical-format-select is-font-size" aria-label="Tamanho da fonte" title="Tamanho da fonte" data-law-material-font-size>
          <option value="">Tamanho</option>
          ${fontSizes.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("")}
        </select>
        <select class="historical-format-select is-line-height" aria-label="Espaçamento entre linhas" title="Espaçamento entre linhas" data-law-material-line-height>
          <option value="">Linhas</option>
          ${lineHeights.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("")}
        </select>
        <span class="format-divider"></span>
        ${colorButtons
          .map(
            ([color, label]) => `
          <button
            class="format-swatch"
            type="button"
            title="${escapeAttr(label)}"
            style="--swatch-color: ${escapeAttr(color)}"
            data-action="law-material-format"
            data-command="foreColor"
            data-value="${escapeAttr(color)}"
          ></button>
        `,
          )
          .join("")}
      </div>
      ${
        saveAction
          ? `
        <div class="historical-edit-actions">
          <button class="button button-primary" type="button" data-action="${escapeAttr(saveAction)}">Salvar</button>
          <button class="button button-secondary" type="button" data-action="${escapeAttr(cancelAction)}">Cancelar</button>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function updateLawMaterialFormMode(form) {
  if (!form) return;
  const type = form.elements.materialType?.value || "text";
  const textField = form.querySelector(".law-material-text-field");
  const imageField = form.querySelector(".law-material-image-field");
  if (textField) textField.hidden = type !== "text";
  if (imageField) imageField.hidden = type !== "image";
}

async function submitLawSectionMaterial(form) {
  const sectionId = Number(form.dataset.sectionId || 0);
  if (!sectionId) return;
  const status = form.querySelector("[data-law-material-status]");
  const submit = form.querySelector('button[type="submit"]');
  const type = form.elements.materialType?.value || "text";
  const payload = {
    materialType: type,
    caption: form.elements.caption?.value || "",
  };
  try {
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Salvando...";
    if (type === "text") {
      const editor = form.querySelector("[data-law-material-editor]");
      payload.bodyHtml = editor?.innerHTML || "";
    } else if (type === "image") {
      const file = form.elements.imageFile?.files?.[0];
      if (!file) throw new Error("Selecione uma imagem.");
      if (!/^image\/(?:png|jpeg|webp|gif)$/i.test(file.type || "")) {
        throw new Error("Use PNG, JPEG, WebP ou GIF.");
      }
      if (file.size > 3 * 1024 * 1024) {
        throw new Error("Imagem muito grande. Limite: 3 MB.");
      }
      payload.imageDataUrl = await readFileAsDataUrl(file);
      payload.imageName = file.name || "";
    }
    const result = await api(
      `/api/law-compendium/sections/${sectionId}/materials`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      },
    );
    if (result.material) {
      upsertLawMaterialInState(sectionId, result.material);
      state.lawMaterialSelection = null;
      rerenderLawSection(sectionId);
    }
  } catch (error) {
    if (status) status.textContent = error.message || "Erro ao salvar.";
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function deleteLawSectionMaterial(button) {
  const materialId = Number(
    button?.dataset?.materialId || button?.dataset?.lawMaterialDelete || 0,
  );
  if (!materialId) return;
  if (!window.confirm("Excluir este material?")) return;
  button.disabled = true;
  try {
    const { sectionId } = findLawMaterialInState(materialId) || {};
    await api(`/api/law-compendium/materials/${materialId}`, {
      method: "DELETE",
    });
    if (sectionId) {
      removeLawMaterialFromState(sectionId, materialId);
      rerenderLawSection(sectionId);
    }
  } catch (error) {
    window.alert(error.message || "Erro ao excluir material.");
    button.disabled = false;
  }
}

async function handleLawSectionMaterialAction(button, event) {
  const action = button.dataset.action || "";
  if (!action.startsWith("law-material-")) return;
  event.preventDefault();

  if (action === "law-material-format") {
    applyLawMaterialFormat(button);
    return;
  }

  if (action === "law-material-edit") {
    const materialId = Number(button.dataset.materialId || 0);
    const found = findLawMaterialInState(materialId);
    if (!found) return;
    state.lawMaterialEditId = materialId;
    rerenderLawSection(found.sectionId);
    window.requestAnimationFrame(() => {
      const editor = els.lawSourceDetail?.querySelector(
        `[data-law-material-id="${CSS.escape(String(materialId))}"] [data-law-material-editor]`,
      );
      editor?.focus();
    });
    return;
  }

  if (action === "law-material-cancel-edit") {
    const card = button.closest("[data-law-material-card]");
    const materialId = Number(card?.dataset?.lawMaterialId || 0);
    const found = findLawMaterialInState(materialId);
    state.lawMaterialEditId = null;
    state.lawMaterialSelection = null;
    if (found) rerenderLawSection(found.sectionId);
    return;
  }

  if (action === "law-material-save-edit") {
    await saveLawSectionMaterialEdit(button);
    return;
  }

  if (action === "law-material-delete") {
    await deleteLawSectionMaterial(button);
  }
}

function handleLawMaterialColor(input, event) {
  event.preventDefault();
  applyLawMaterialFormat({
    dataset: { command: "foreColor", value: input.value || "#0f172a" },
    closest: input.closest?.bind(input),
  });
}

function handleLawMaterialStyleSelect(select, event, styleName) {
  event.preventDefault();
  const value = select.value || "";
  if (!value) return;
  applyLawMaterialStyle(select, styleName, value);
  select.value = "";
}

function applyLawMaterialFormat(button) {
  const command = button.dataset.command || "";
  if (!command) return;
  const editor = findLawMaterialEditor(button);
  if (!editor) return;
  editor.focus();
  restoreLawMaterialSelection(editor);
  document.execCommand(command, false, button.dataset.value || null);
  saveLawMaterialSelection(editor);
}

function applyLawMaterialStyle(source, styleName, value) {
  const editor = findLawMaterialEditor(source);
  if (!editor) return;
  editor.focus();
  restoreLawMaterialSelection(editor);
  const selection = document.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!rangeIntersectsEditor(range, editor) || range.collapsed) return;

  const span = document.createElement("span");
  if (styleName === "fontSize") {
    span.style.fontSize = value;
  } else if (styleName === "fontFamily") {
    span.style.fontFamily = value;
  } else if (styleName === "lineHeight") {
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
  saveLawMaterialSelection(editor);
}

function saveLawMaterialSelection(editor) {
  const selection = document.getSelection();
  if (!selection || !selection.rangeCount || !editor) return;
  const range = selection.getRangeAt(0);
  if (!rangeIntersectsEditor(range, editor)) return;
  state.lawMaterialSelection = range.cloneRange();
}

function restoreLawMaterialSelection(editor) {
  const range = state.lawMaterialSelection;
  if (!range || !editor || !rangeIntersectsEditor(range, editor)) return false;
  const selection = document.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function findLawMaterialEditor(source) {
  const root =
    source?.closest?.("[data-law-material-card], [data-law-material-form]") ||
    document;
  return root.querySelector?.("[data-law-material-editor]");
}

async function saveLawSectionMaterialEdit(button) {
  const card = button.closest("[data-law-material-card]");
  const materialId = Number(card?.dataset?.lawMaterialId || 0);
  const found = findLawMaterialInState(materialId);
  if (!materialId || !found) return;
  const editor = card.querySelector("[data-law-material-editor]");
  const caption =
    card.querySelector("[data-law-material-caption]")?.value || "";
  button.disabled = true;
  try {
    const result = await api(`/api/law-compendium/materials/${materialId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ bodyHtml: editor?.innerHTML || "", caption }),
    });
    if (result.material) {
      upsertLawMaterialInState(found.sectionId, result.material);
      state.lawMaterialEditId = null;
      state.lawMaterialSelection = null;
      rerenderLawSection(found.sectionId);
    }
  } catch (error) {
    window.alert(error.message || "Erro ao salvar material.");
    button.disabled = false;
  }
}

function findLawMaterialInState(materialId) {
  const targetId = Number(materialId || 0);
  for (const section of state.activeLawSourceData?.sections || []) {
    const material = (section.materials || []).find(
      (item) => Number(item.id) === targetId,
    );
    if (material)
      return { section, sectionId: Number(section.id || 0), material };
  }
  return null;
}

function upsertLawMaterialInState(sectionId, material) {
  const section = (state.activeLawSourceData?.sections || []).find(
    (item) => Number(item.id) === Number(sectionId),
  );
  if (!section) return;
  const materials = [...(section.materials || [])];
  const index = materials.findIndex(
    (item) => Number(item.id) === Number(material.id),
  );
  if (index >= 0) {
    materials[index] = material;
  } else {
    materials.push(material);
  }
  section.materials = materials.sort(
    (a, b) =>
      Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
      Number(a.id || 0) - Number(b.id || 0),
  );
}

function removeLawMaterialFromState(sectionId, materialId) {
  const section = (state.activeLawSourceData?.sections || []).find(
    (item) => Number(item.id) === Number(sectionId),
  );
  if (!section) return;
  section.materials = (section.materials || []).filter(
    (item) => Number(item.id) !== Number(materialId),
  );
}

function rerenderLawSection(sectionId) {
  const section = (state.activeLawSourceData?.sections || []).find(
    (item) => Number(item.id) === Number(sectionId),
  );
  if (!section) return;
  const current = els.lawSourceDetail?.querySelector(
    `[data-law-section-id="${CSS.escape(String(sectionId))}"]`,
  );
  if (!current) return;
  current.outerHTML = lawSectionMarkup(
    section,
    state.lawCompendiumMode === "dry",
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function lawSectionBodyText(section) {
  let text = String(section.text || "")
    .replace(/\s+§\s*$/g, "")
    .trim();
  const displayRef = String(section.displayRef || "").trim();
  if (!displayRef) return text;
  const escapedRef = displayRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  text = text
    .replace(new RegExp(`^${escapedRef}\\s*[-–—.]?\\s*`, "i"), "")
    .trim();
  if ((section.hierarchyLevel || "") === "artigo") {
    return `${normalizeLawArticleRef(displayRef)} ${text}`.trim();
  }
  if ((section.hierarchyLevel || "") === "paragrafo") {
    return `${normalizeLawParagraphRef(displayRef)} ${text}`.trim();
  }
  if ((section.hierarchyLevel || "") === "inciso") {
    return `${displayRef} - ${text}`.trim();
  }
  if ((section.hierarchyLevel || "") === "alinea") {
    return `${displayRef} ${text}`.trim();
  }
  return `${displayRef} ${text}`.trim();
}

function normalizeLawArticleRef(displayRef) {
  const ref = String(displayRef || "")
    .replace(/\.$/, "")
    .trim();
  return /\.$/.test(ref) ? ref : `${ref}.`;
}

function normalizeLawParagraphRef(displayRef) {
  const ref = String(displayRef || "")
    .replace(/\.$/, "")
    .trim();
  if (/^Parágrafo\s+único/i.test(ref)) return "Parágrafo único.";
  return /\.$/.test(ref) ? ref : `${ref}.`;
}

function lawCrossRefsMarkup(refs) {
  const resolved = refs.filter(
    (ref) => ref.status === "resolved" && ref.quotedTargetText,
  );
  if (!resolved.length) return "";
  return `
    <div class="law-cross-refs" aria-label="Remissões citadas">
      <strong>Remissões citadas</strong>
      ${resolved
        .map(
          (ref) => `
        <p><span>${escapeHtml(ref.refText || ref.targetLocator || "")}</span> ${escapeHtml(ref.quotedTargetText || "")}</p>
      `,
        )
        .join("")}
    </div>
  `;
}

function lawRelatedMarkup(section) {
  const questions = section.questionLinks || [];
  const relatedQuestions = section.relatedQuestionLinks || [];
  const comments = section.commentLinks || [];
  if (!questions.length && !relatedQuestions.length && !comments.length)
    return "";
  return `
    <details class="law-related">
      <summary>Questões vinculadas a este dispositivo</summary>
      ${
        questions.length
          ? `
        <div class="law-related-block">
          <strong>Questões que citam o dispositivo</strong>
          ${questions
            .map(
              (question) => `
            <a href="${escapeAttr(questionLink(question.questionId))}" data-question-id="${escapeAttr(question.questionId)}">
              #${Number(question.questionId || 0).toLocaleString("pt-BR")} - ${escapeHtml(question.evidence || question.assunto || "")}
            </a>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }
      ${
        relatedQuestions.length
          ? `
        <div class="law-related-block">
          <strong>Questões relacionadas ao conteúdo</strong>
          ${relatedQuestions
            .map(
              (question) => `
            <a href="${escapeAttr(questionLink(question.questionId))}" data-question-id="${escapeAttr(question.questionId)}">
              #${Number(question.questionId || 0).toLocaleString("pt-BR")} - ${escapeHtml(question.assunto || question.evidence || "")}
            </a>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }
      ${
        comments.length
          ? `
        <div class="law-related-block">
          <strong>Comentários de professor ligados a citação exata</strong>
          ${comments.map((comment) => `<p>${escapeHtml(comment.excerpt || comment.evidence || "")}</p>`).join("")}
        </div>
      `
          : ""
      }
    </details>
  `;
}

function lawStatusLabel(status) {
  return (
    {
      validated_current: "vigente validada",
      historical_revoked: "histórico/revogada",
      needs_verification: "pendente",
      import_error: "erro de importação",
      draft: "rascunho",
    }[status] ||
    status ||
    "sem status"
  );
}

function buildNormativeReviewParams() {
  const params = new URLSearchParams({ limit: "120" });
  if (els.normativeRecommendationFilter.value)
    params.set("recomendacao", els.normativeRecommendationFilter.value);
  if (els.normativeSecurityFilter.value)
    params.set("nivelSeguranca", els.normativeSecurityFilter.value);
  if (els.normativeChangedFilter.value)
    params.set("mudancaGabarito", els.normativeChangedFilter.value);
  if (els.normativeReviewStatusFilter.value)
    params.set("reviewStatus", els.normativeReviewStatusFilter.value);
  if (els.normativeTeachingStatusFilter.value)
    params.set("teachingStatus", els.normativeTeachingStatusFilter.value);
  if (state.filters.materia) params.set("materia", state.filters.materia);
  for (const materia of state.filters.includedMaterias || [])
    params.append("includeMateria", materia);
  for (const materia of state.filters.excludedMaterias)
    params.append("excludeMateria", materia);
  if (state.filters.assunto) params.set("assunto", state.filters.assunto);
  if (state.filters.examKey) params.set("examKey", state.filters.examKey);
  if (state.filters.q) params.set("q", state.filters.q);
  return params;
}

function populateNormativeSelect(select, rows, emptyLabel) {
  const selected = select.value;
  select.innerHTML =
    `<option value="">${escapeHtml(emptyLabel)}</option>` +
    (rows || [])
      .map(
        (row) =>
          `<option value="${escapeAttr(row.value)}">${escapeHtml(row.value)} (${Number(row.total || 0).toLocaleString("pt-BR")})</option>`,
      )
      .join("");
  select.value = [...select.options].some((option) => option.value === selected)
    ? selected
    : "";
}

async function selectQuestion(questionId, options = {}) {
  if (!isCurrentQuestionRequest(options.requestToken)) return false;
  state.selectedId = questionId;
  state.answerResult = options.answerResult || null;
  state.adaptiveTarget = options.adaptiveTarget || null;
  state.eliminatedAnswers = new Set();
  state.supportOpen = false;
  state.supportTab = "comment";
  state.inlineSupportTab = "comment";
  state.sawComment = false;
  state.openedTheory = false;
  resetQuestionTimer();
  startTimer();

  const question = await api(`/api/questions/${questionId}`);
  if (!isCurrentQuestionRequest(options.requestToken)) return false;
  if (question.error) {
    state.theoryUrl = "";
    els.openTheory.disabled = true;
    if (els.openQuickTheory) els.openQuickTheory.disabled = true;
    renderQuestionSituationTone(null);
    renderContranPrf2021QuestionAlert(null);
    els.statement.innerHTML = `<p class="empty">${escapeHtml(question.error)}</p>`;
    return false;
  }

  renderQuestion(question, options);
  await saveStudyState({
    currentQuestionId: questionId,
    mode: state.studyMode,
    profile: state.activeProfile || "",
    materia: question.metadata?.materia || "",
    assunto: question.metadata?.assunto || "",
  }).catch((error) => {
    console.warn("Nao foi possivel salvar o estado de estudo.", error);
  });
  recordQuestionEvent("started_question");
  return true;
}

function scrollToStatementStart() {
  const target = els.statement?.closest(".question-card") || els.statement;
  if (!target) return;
  const jumpToStatement = () => {
    // A topbar é sticky no desktop (altura 0 no mobile); desconta para o
    // enunciado não ficar escondido atrás dela.
    const topbar = document.querySelector(".topbar");
    const offset = topbar ? topbar.getBoundingClientRect().height : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  };
  // No iOS, um scroll programático durante a inércia de um toque (o usuário
  // deu um flick para ver o comentário e tocou em "próxima") é ignorado, e o
  // layout pode assentar só depois do primeiro frame. Repetir em janelas
  // curtas garante que ao menos uma chamada "pegue".
  jumpToStatement();
  window.requestAnimationFrame(jumpToStatement);
  window.setTimeout(jumpToStatement, 80);
  window.setTimeout(jumpToStatement, 250);
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
    console.error("Nao foi possivel abrir a questao.", error);
    if (options.fallbackHref) {
      window.location.assign(options.fallbackHref);
      return;
    }
    els.answerHint.textContent =
      "Nao foi possivel abrir esta questao. Recarregue a pagina e tente novamente.";
  }
}

function renderQuestion(question, options = {}) {
  const previousQuestionId =
    state.currentQuestion?.id || state.currentQuestion?.questionId || null;
  const nextQuestionId = question.id || question.questionId || null;
  if (previousQuestionId !== nextQuestionId) {
    state.teachingEditMode = false;
    state.currentLawEditMode = false;
    state.historicalCommentEditMode = false;
    state.questionEditMode = false;
    state.questionEditStatus = "";
  }
  state.currentQuestion = question;
  const adaptiveReason =
    options.adaptiveTarget?.reasonText || question.adaptive?.reasonText || "";
  const meta = question.metadata;
  const examLabel = questionExamLabel(meta);
  els.questionTitle.textContent = "Questão";
  els.questionMeta.textContent = [
    examLabel ? `Prova: ${examLabel}` : "",
    meta.materia,
    meta.assunto,
  ]
    .filter(Boolean)
    .join(" • ");
  els.questionQuickStatus.textContent =
    adaptiveReason || questionQuickStatus(question);
  renderQuestionBadges(question);
  renderMastery(question.mastery);
  renderQuestionSituationTone(question);
  renderContranPrf2021QuestionAlert(question);
  els.statement.innerHTML = `${renderContranPrfUnpublishedNotice(question)}${formatStatementHtml(question) || question.statementHtml || `<p>${escapeHtml(question.statementText || "Sem enunciado")}</p>`}`;
  renderQuestionEditPanel(question);
  applyStatementLengthClass(question);
  renderAnswerStatus(question);

  const alternatives = getDisplayAlternatives(question);
  els.alternatives.innerHTML = alternatives
    .map(
      (alternative) => `
    <label class="alternative" data-letter="${escapeAttr(alternative.letter)}" data-display-letter="${escapeAttr(alternative.displayLetter || alternative.letter)}">
      <input type="radio" name="answer" value="${escapeAttr(alternative.letter)}">
      ${renderAlternativeText(question, alternative)}
    </label>
  `,
    )
    .join("");

  if (options.selectedAnswer) {
    const selectedInput = els.alternatives.querySelector(
      `input[name="answer"][value="${cssEscape(options.selectedAnswer)}"]`,
    );
    if (selectedInput) {
      selectedInput.checked = true;
    }
  }

  state.theoryUrl = question.theory?.available ? question.theory.url : "";
  state.theoryPdfAvailable = Boolean(question.theory?.pdfAvailable);
  const hasQuickTheory = hasQuickTheorySupport(question);
  if (els.openQuickTheory) {
    els.openQuickTheory.disabled =
      !hasQuickTheory || !canRevealExplanation(question);
    els.openQuickTheory.textContent = hasQuickTheory
      ? "Teoria rápida"
      : "Teoria rápida indisponível";
  }
  els.openTheory.disabled = !state.theoryUrl;
  els.openTheory.textContent = "PDF de teoria";
  els.openTheory.title = question.theory?.available
    ? `Abrir teoria: ${question.theory.title}`
    : "PDF de teoria não encontrado para este assunto";
  const hasSupportExplanation = Boolean(
    canRevealExplanation(question) &&
    (question.comment.html ||
      question.comment.text ||
      question.contranPrfUnpublished?.historicalExplanation ||
      question.contranPrfUnpublished?.teacherComment ||
      hasQuickTheory ||
      question.normativeUpdate?.exists ||
      question.currentLawAnswer?.exists ||
      question.normativeTeachingComment?.exists ||
      question.metadata?.desatualizada),
  );
  const hasTeachingSupport = Boolean(
    canRevealCurrentLawAnswer(question) &&
    (question.currentLawAnswer?.exists ||
      question.normativeTeachingComment?.exists ||
      question.metadata?.desatualizada),
  );
  els.openTeaching.disabled = !hasTeachingSupport;
  els.toggleComment.disabled = !hasSupportExplanation;
  els.openTeaching.textContent = "Resposta pela legislacao atual";
  const commentLabel = isContranPrfUnpublishedQuestion(question)
    ? "Comentário do professor"
    : "Explicação histórica";
  els.toggleComment.textContent = commentLabel;
  if (els.supportTabComment) els.supportTabComment.textContent = commentLabel;
  if (els.supportTabTeaching) {
    els.supportTabTeaching.disabled = !hasTeachingSupport;
  }
  const hasCluster = Boolean(
    question.adaptive?.exists && question.adaptive?.clusterId,
  );
  const isStatsOnlyCluster = question.adaptive?.clusterPolicy === "stats_only";
  els.showSimilar.disabled = !hasCluster;
  els.showSimilar.textContent = isStatsOnlyCluster
    ? "Outras do assunto"
    : "Semelhantes";
  els.similarQuestions.disabled = !hasCluster || isStatsOnlyCluster;
  els.similarQuestions.textContent = isStatsOnlyCluster
    ? "Outras do assunto"
    : "Ver semelhantes";
  syncNormativeSupportAvailability(question);
  syncQuickTheoryAvailability(question);

  const answering = question.answering || {};
  const historicalAnswer =
    answering.historicalAnswer ||
    question.comment.historicalAnswer ||
    question.comment.extractedAnswer ||
    "";
  const studyAnswer =
    answering.studyAnswer || question.comment.studyAnswer || "";
  const answerInfoLabel = isContranPrfUnpublishedQuestion(question)
    ? "Gabarito"
    : "Gabarito histórico";
  const info = [
    question.comment.userEditedAt ? "comentário atualizado por você" : "",
    question.comment.sourceType === "ai" ? "gerado por IA" : "",
    historicalAnswer ? `${answerInfoLabel}: ${historicalAnswer}` : "",
    question.comment.professor || "",
    question.comment.aiModel || "",
  ]
    .filter(Boolean)
    .join(" - ");
  els.commentInfo.textContent =
    [
      question.comment.userEditedAt ? "comentário atualizado por você" : "",
      question.comment.sourceType === "ai" ? "gerado por IA" : "",
      historicalAnswer ? `${answerInfoLabel}: ${historicalAnswer}` : "",
      question.comment.professor || "",
      question.comment.aiModel || "",
    ]
      .filter(Boolean)
      .join(" - ") || info;
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

  if (
    previousQuestionId !== nextQuestionId &&
    options.scrollToStatement !== false
  ) {
    scrollToStatementStart();
  }
}

function renderQuestionEditPanel(question) {
  if (!els.questionEditPanel || !els.questionEditToggle) return;
  const canEdit = Boolean(question?.id || question?.questionId);
  els.questionEditToggle.disabled = !canEdit;
  els.questionEditToggle.textContent = state.questionEditMode
    ? "Fechar edição"
    : "Editar questão";

  if (els.questionEditStatus) {
    els.questionEditStatus.hidden = !state.questionEditStatus;
    els.questionEditStatus.textContent = state.questionEditStatus;
  }

  if (!canEdit || !state.questionEditMode) {
    els.questionEditPanel.hidden = true;
    els.questionEditPanel.innerHTML = "";
    return;
  }

  const currentAnswer = questionCoreAnswerValue(question);
  els.questionEditPanel.hidden = false;
  els.questionEditPanel.innerHTML = `
    <form class="question-edit-form">
      <label class="teaching-edit-field">
        <span>Enunciado</span>
        <textarea name="statementText" rows="8" required>${escapeHtml(question.statementText || "")}</textarea>
      </label>
      <label class="teaching-edit-field">
        <span>Gabarito</span>
        <select name="officialAnswer">
          ${questionCoreAnswerOptions(question, currentAnswer)}
        </select>
      </label>
      <div class="question-edit-actions">
        <button class="button button-secondary" type="button" data-action="question-edit-cancel">Cancelar</button>
        <button class="button button-primary" type="submit">Salvar</button>
      </div>
    </form>
  `;
}

function questionCoreAnswerValue(question) {
  return normalizeAnswerText(
    question?.answering?.studyAnswer ||
      question?.currentLawAnswer?.currentAnswer ||
      question?.answering?.historicalAnswer ||
      question?.comment?.historicalAnswer ||
      question?.comment?.extractedAnswer ||
      question?.contranPrfUnpublished?.correctAnswer ||
      "",
  );
}

function questionCoreAnswerOptions(question, currentAnswer) {
  const type = String(question?.metadata?.tipo || "").toUpperCase();
  const options =
    type === "CERTO_ERRADO"
      ? [
          { value: "CERTO", label: "CERTO" },
          { value: "ERRADO", label: "ERRADO" },
        ]
      : (question?.alternatives || []).map((alternative) => ({
          value: alternative.letter,
          label: `Alternativa ${alternative.letter}`,
        }));
  const normalizedOptions = new Set(
    options.map((option) => normalizeAnswerText(option.value)),
  );
  if (currentAnswer && !normalizedOptions.has(currentAnswer)) {
    options.unshift({ value: currentAnswer, label: currentAnswer });
  }
  options.unshift({ value: "", label: "Sem gabarito" });
  return options
    .map(
      (option) => `
        <option value="${escapeAttr(option.value)}" ${normalizeAnswerText(option.value) === currentAnswer ? "selected" : ""}>
          ${escapeHtml(option.label)}
        </option>
      `,
    )
    .join("");
}

async function saveQuestionCoreEdit(form) {
  if (!form || !state.selectedId) return;
  const submit = form.querySelector('button[type="submit"]');
  const previousText = submit?.textContent || "Salvar";
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Salvando...";
  }
  try {
    const formData = new FormData(form);
    const result = await api(`/api/questions/${state.selectedId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statementText: formData.get("statementText"),
        officialAnswer: formData.get("officialAnswer"),
      }),
    });
    if (result.error) throw new Error(result.error);
    state.questionEditMode = false;
    state.questionEditStatus = "Questão atualizada";
    if (result.question) {
      renderQuestion(result.question, { scrollToStatement: false });
    } else {
      await openQuestionDirect(state.selectedId, { scrollToStatement: false });
    }
    loadStats().catch(() => {});
  } catch (error) {
    console.error(error);
    state.questionEditStatus = questionEditErrorMessage(error);
    renderQuestionEditPanel(state.currentQuestion);
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = previousText;
    }
  }
}

function questionEditErrorMessage(error) {
  const raw = String(error?.message || "").replace(/^HTTP\s+\d+:\s*/, "");
  if (!raw) return "Nao foi possivel salvar";
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error || raw;
  } catch {
    return raw;
  }
}

function questionExamLabel(meta = {}) {
  if (meta.provaLabel) return meta.provaLabel;
  return [
    meta.banca,
    meta.orgaoSigla || meta.orgaoNome,
    meta.cargo,
    meta.ano,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(" - ");
}

function renderContranPrfUnpublishedNotice(question) {
  const meta = question?.contranPrfUnpublished;
  if (!meta?.exists) return "";
  const details = [
    meta.currentResolution ? `Atual: ${meta.currentResolution}` : "",
    meta.axis || "",
    meta.topic || "",
    meta.difficulty ? formatContranFilterValue(meta.difficulty) : "",
  ]
    .filter(Boolean)
    .join(" - ");
  return `
    <aside class="unpublished-question-notice" aria-label="Questão inédita">
      <strong>${escapeHtml(meta.badge || "Questao inedita - elaborada para treino PRF/CONTRAN")}</strong>
      <span>${escapeHtml(meta.notice || "Nao e questao oficial de concurso.")}</span>
      ${details ? `<small>${escapeHtml(details)}</small>` : ""}
    </aside>
  `;
}

function isContranPrfUnpublishedQuestion(question) {
  return Boolean(
    question?.contranPrfUnpublished?.exists ||
    question?.metadata?.isUnpublished,
  );
}

function renderHistoricalCommentPanel(question) {
  if (!els.commentBody) return;
  if (isContranPrfUnpublishedQuestion(question)) {
    renderContranPrfUnpublishedCommentPanel(question);
    return;
  }
  const answering = question.answering || {};
  const historicalAnswer =
    answering.historicalAnswer ||
    question.comment?.historicalAnswer ||
    question.comment?.extractedAnswer ||
    "";
  const studyAnswer =
    answering.studyAnswer || question.comment?.studyAnswer || "";
  const historicalWarning =
    question.metadata?.desatualizada &&
    historicalAnswer &&
    studyAnswer &&
    normalizeAnswerText(historicalAnswer) !== normalizeAnswerText(studyAnswer)
      ? `<p class="normative-warning is-warning">Atenção: este comentário explica o gabarito original. Pela legislação atual, o gabarito de estudo é ${escapeHtml(currentAnswerLabel(studyAnswer))}.</p>`
      : "";
  const userEditedNotice = question.comment?.userEditedAt
    ? `<p class="historical-user-edit-notice">Comentário atualizado por você${question.comment.userEditedAt ? ` em ${escapeHtml(formatFullDate(question.comment.userEditedAt))}` : ""}.</p>`
    : "";
  const html =
    question.comment?.html ||
    (question.comment?.text
      ? `<p>${escapeHtml(question.comment.text)}</p>`
      : "");
  const canEdit = canEditHistoricalComment();
  setHistoricalCommentStatus("");
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
        >${html || "<p></p>"}</div>
        ${
          question.metadata?.desatualizada
            ? `
          <label class="historical-comment-option">
            <input type="checkbox" data-historical-comment-clear-outdated>
            <span>Esta questão não está mais desatualizada</span>
          </label>
        `
            : ""
        }
      </section>
    `;
    prepareHistoricalCommentTables(
      els.commentBody.querySelector("[data-historical-comment-editor]"),
    );
    return;
  }

  els.commentBody.innerHTML = `
    ${userEditedNotice}
    ${historicalWarning}
    <section class="historical-comment-view" data-historical-comment-card>
      ${canEdit ? historicalCommentToolbar({ editing: false }) : ""}
      <div class="historical-comment-content">
        ${html || `<p class="empty">${escapeHtml("Comentário ainda não coletado.")}</p>`}
      </div>
    </section>
  `;
}

function renderContranPrfUnpublishedCommentPanel(question) {
  const meta = question?.contranPrfUnpublished || {};
  const professorComment = formatContranProfessorComment(
    meta.historicalExplanation ||
      meta.teacherComment ||
      meta.explanation ||
      question.comment?.text ||
      "",
  );
  const manualReview = meta.needsManualReview
    ? `<p class="normative-warning is-warning">Marcada para revisão normativa posterior${meta.reviewReason ? `: ${escapeHtml(meta.reviewReason)}` : "."}</p>`
    : "";
  const answerLabel = currentAnswerLabel(
    meta.correctAnswer ||
      question.answering?.studyAnswer ||
      question.comment?.historicalAnswer ||
      "",
  );
  setHistoricalCommentStatus("");
  state.historicalCommentEditMode = false;
  els.commentBody.innerHTML = `
    <section class="historical-comment-view contran-teaching-comment" data-historical-comment-card>
      ${manualReview}
      ${
        answerLabel
          ? `
        <section class="contran-teaching-block">
          <strong>Gabarito</strong>
          <p>${escapeHtml(answerLabel)}</p>
        </section>
      `
          : ""
      }
      <div class="historical-comment-content">
        ${professorComment ? pedagogicalPlainTextMarkup(professorComment) : `<p class="empty">${escapeHtml("Comentário ainda não coletado.")}</p>`}
      </div>
      ${
        meta.beginnerExplanation
          ? `
        <section class="contran-teaching-block">
          <strong>Explicação para iniciante</strong>
          ${pedagogicalPlainTextMarkup(meta.beginnerExplanation)}
        </section>
      `
          : ""
      }
      ${
        meta.trapExplanation
          ? `
        <section class="contran-teaching-block">
          <strong>Pegadinha</strong>
          ${pedagogicalPlainTextMarkup(meta.trapExplanation)}
        </section>
      `
          : ""
      }
      ${
        meta.sourceNormativeReference
          ? `
        <section class="contran-teaching-block">
          <strong>Fundamento normativo</strong>
          ${renderNormativeReferenceAccordion(question, meta.sourceNormativeReference)}
        </section>
      `
          : ""
      }
    </section>
  `;
  scheduleDefaultNormativeAccordionLoad();
}

function formatContranProfessorComment(value) {
  return String(value || "")
    .replace(/^Gabarito:\s*(?:CERTO|ERRADO|[A-E])\.\s*\n{2,}/i, "")
    .replace(/\n{2,}Fundamento:\s*[\s\S]*$/i, "")
    .trim();
}

function pedagogicalPlainTextMarkup(value) {
  const paragraphs = String(value || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length) return "";
  return paragraphs
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length === 1 && /^[^:]{3,60}:$/.test(lines[0])) {
        return `<h4>${escapeHtml(lines[0].replace(/:$/, ""))}</h4>`;
      }
      return `<p>${escapeHtml(lines.join("\n")).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function renderNormativeReferenceAccordion(question, normativeReferenceText) {
  const questionId = question?.id || question?.questionId || "";
  const preference = getContranNormativeDisplayPreference();
  const shouldOpen =
    preference === "expanded" ||
    (preference === "remember" && getContranNormativeLastOpen());
  return `
    <div
      class="normative-reference-accordion${shouldOpen ? " is-open" : ""}"
      data-contran-normative-accordion
      data-question-id="${escapeAttr(questionId)}"
      data-loaded="false"
    >
      <p class="normative-reference-short">${escapeHtml(normativeReferenceText || "")}</p>
      <div class="normative-reference-actions">
        <button class="button button-secondary" type="button" data-action="contran-normative-toggle">
          ${shouldOpen ? "Recolher artigos" : "Ver artigos na íntegra"}
        </button>
        <button class="button button-secondary" type="button" data-action="contran-normative-copy-reference">Copiar fundamento</button>
        <label class="normative-reference-preference">
          <span>Visualização</span>
          <select data-action="contran-normative-preference" aria-label="Preferência de visualização dos fundamentos">
            <option value="collapsed"${preference === "collapsed" ? " selected" : ""}>Sempre recolhido</option>
            <option value="expanded"${preference === "expanded" ? " selected" : ""}>Sempre expandido</option>
            <option value="remember"${preference === "remember" ? " selected" : ""}>Lembrar última escolha</option>
          </select>
        </label>
      </div>
      <div class="normative-reference-status" data-contran-normative-status></div>
      <div class="normative-reference-list" data-contran-normative-list ${shouldOpen ? "" : "hidden"}></div>
    </div>
  `;
}

function scheduleDefaultNormativeAccordionLoad() {
  window.setTimeout(() => {
    document
      .querySelectorAll("[data-contran-normative-accordion].is-open")
      .forEach((accordion) => {
        loadContranNormativeArticles(accordion).catch(() => {});
      });
  }, 0);
}

async function handleContranNormativeAction(button, event) {
  const action = button.dataset.action || "";
  if (!action.startsWith("contran-normative-")) return false;
  event.preventDefault();
  const accordion = button.closest("[data-contran-normative-accordion]");
  if (!accordion) return true;
  if (action === "contran-normative-toggle") {
    await toggleContranNormativeAccordion(accordion);
    return true;
  }
  if (action === "contran-normative-copy-reference") {
    await copyTextFromElement(
      accordion.querySelector(".normative-reference-short")?.textContent || "",
      button,
      "Fundamento copiado",
    );
    return true;
  }
  if (action === "contran-normative-copy-article") {
    const article = button.closest("[data-contran-normative-article]");
    await copyTextFromElement(
      article?.querySelector("[data-article-copy-text]")?.textContent || "",
      button,
      "Artigo copiado",
    );
    return true;
  }
  return true;
}

function handleContranNormativePreference(select) {
  if (!select?.matches('[data-action="contran-normative-preference"]'))
    return false;
  const value = ["collapsed", "expanded", "remember"].includes(select.value)
    ? select.value
    : "collapsed";
  localStorage.setItem(CONTRAN_NORMATIVE_DISPLAY_PREFERENCE_KEY, value);
  document
    .querySelectorAll('[data-action="contran-normative-preference"]')
    .forEach((item) => {
      item.value = value;
    });
  if (value === "expanded") {
    document
      .querySelectorAll("[data-contran-normative-accordion]")
      .forEach((accordion) => {
        openContranNormativeAccordion(accordion).catch(() => {});
      });
  } else if (value === "collapsed") {
    document
      .querySelectorAll("[data-contran-normative-accordion]")
      .forEach((accordion) => closeContranNormativeAccordion(accordion));
  }
  return true;
}

async function toggleContranNormativeAccordion(accordion) {
  const list = accordion.querySelector("[data-contran-normative-list]");
  const isOpen = !list?.hidden;
  if (isOpen) {
    closeContranNormativeAccordion(accordion);
    rememberContranNormativeOpen(false);
    return;
  }
  await openContranNormativeAccordion(accordion);
  rememberContranNormativeOpen(true);
}

async function openContranNormativeAccordion(accordion) {
  const list = accordion.querySelector("[data-contran-normative-list]");
  if (list) list.hidden = false;
  accordion.classList.add("is-open");
  const toggle = accordion.querySelector(
    '[data-action="contran-normative-toggle"]',
  );
  if (toggle) toggle.textContent = "Recolher artigos";
  await loadContranNormativeArticles(accordion);
}

function closeContranNormativeAccordion(accordion) {
  const list = accordion.querySelector("[data-contran-normative-list]");
  if (list) list.hidden = true;
  accordion.classList.remove("is-open");
  const toggle = accordion.querySelector(
    '[data-action="contran-normative-toggle"]',
  );
  if (toggle) toggle.textContent = "Ver artigos na íntegra";
}

async function loadContranNormativeArticles(accordion) {
  if (accordion.dataset.loaded === "true") return;
  const questionId = Number(accordion.dataset.questionId || 0);
  if (!questionId) return;
  const status = accordion.querySelector("[data-contran-normative-status]");
  const list = accordion.querySelector("[data-contran-normative-list]");
  if (status) status.textContent = "Carregando artigos...";
  const data =
    state.contranNormativeArticlesCache.get(questionId) ||
    (await api(`/api/questions/${questionId}/contran-normative-articles`));
  state.contranNormativeArticlesCache.set(questionId, data);
  accordion.dataset.loaded = "true";
  if (status) status.textContent = "";
  if (list) {
    list.innerHTML = data.references?.length
      ? data.references.map(normativeArticleMarkup).join("")
      : '<p class="empty">Nenhum artigo integral vinculado a este fundamento.</p>';
  }
}

function normativeArticleMarkup(reference) {
  const content = reference.found
    ? `<div class="normative-article-text" data-article-copy-text>${pedagogicalPlainTextMarkup(reference.plainText || reference.fullText || "")}</div>`
    : `<p class="normative-warning is-warning" data-article-copy-text>${escapeHtml(reference.missingMessage || "Texto integral ainda não cadastrado para este dispositivo.")}</p>`;
  return `
    <details class="normative-article-item" data-contran-normative-article>
      <summary>
        <span>${escapeHtml(reference.label || reference.title || "Dispositivo normativo")}</span>
        <button class="button button-secondary" type="button" data-action="contran-normative-copy-article">Copiar artigo</button>
      </summary>
      ${content}
    </details>
  `;
}

function getContranNormativeDisplayPreference() {
  return (
    localStorage.getItem(CONTRAN_NORMATIVE_DISPLAY_PREFERENCE_KEY) ||
    "collapsed"
  );
}

function getContranNormativeLastOpen() {
  return localStorage.getItem(CONTRAN_NORMATIVE_LAST_OPEN_KEY) === "open";
}

function rememberContranNormativeOpen(open) {
  if (getContranNormativeDisplayPreference() === "remember") {
    localStorage.setItem(
      CONTRAN_NORMATIVE_LAST_OPEN_KEY,
      open ? "open" : "closed",
    );
  }
}

async function copyTextFromElement(text, button, successLabel) {
  const value = String(text || "").trim();
  if (!value) return;
  await navigator.clipboard.writeText(value);
  const original = button.textContent;
  button.textContent = successLabel;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function historicalCommentToolbar({ editing }) {
  const fontFamilies = [
    ["Arial, Helvetica, sans-serif", "Arial"],
    ["Georgia, serif", "Georgia"],
    ["Times New Roman, Times, serif", "Times"],
    ["Verdana, Geneva, sans-serif", "Verdana"],
    ["Courier New, Courier, monospace", "Mono"],
  ];
  const fontSizes = [
    ["12px", "12"],
    ["14px", "14"],
    ["16px", "16"],
    ["18px", "18"],
    ["20px", "20"],
    ["24px", "24"],
    ["28px", "28"],
  ];
  const lineHeights = [
    ["1.2", "1.2"],
    ["1.4", "1.4"],
    ["1.6", "1.6"],
    ["1.8", "1.8"],
    ["2", "2.0"],
  ];
  const colorButtons = [
    ["#0f172a", "Preto"],
    ["#1d4ed8", "Azul"],
    ["#15803d", "Verde"],
    ["#b45309", "Âmbar"],
    ["#dc2626", "Vermelho"],
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
        <button class="format-button" type="button" title="Inserir imagem" data-action="historical-comment-image"><span class="format-image-icon"></span></button>
        <input class="historical-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple data-historical-comment-image-input>
        <span class="format-divider"></span>
        <select class="historical-format-select is-font-family" aria-label="Fonte" title="Fonte" data-historical-comment-font-family>
          <option value="">Fonte</option>
          ${fontFamilies.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("")}
        </select>
        <select class="historical-format-select is-font-size" aria-label="Tamanho da fonte" title="Tamanho da fonte" data-historical-comment-font-size>
          <option value="">Tamanho</option>
          ${fontSizes.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("")}
        </select>
        <select class="historical-format-select is-line-height" aria-label="Espaçamento entre linhas" title="Espaçamento entre linhas" data-historical-comment-line-height>
          <option value="">Linhas</option>
          ${lineHeights.map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`).join("")}
        </select>
        <span class="format-divider"></span>
        ${colorButtons
          .map(
            ([color, label]) => `
          <button
            class="format-swatch"
            type="button"
            title="${escapeAttr(label)}"
            style="--swatch-color: ${escapeAttr(color)}"
            data-action="historical-comment-format"
            data-command="foreColor"
            data-value="${escapeAttr(color)}"
          ></button>
        `,
          )
          .join("")}
      </div>
      <div class="historical-edit-actions">
        <button class="button button-primary" type="button" data-action="historical-comment-save">Salvar</button>
        <button class="button button-secondary" type="button" data-action="historical-comment-cancel">Cancelar</button>
      </div>
    </div>
  `;
}

function canEditHistoricalComment() {
  return true;
}

async function handleHistoricalCommentAction(button, event) {
  const action = button.dataset.action || "";
  if (!action.startsWith("historical-comment-")) return;
  event.preventDefault();
  if (!canEditHistoricalComment()) return;

  if (action === "historical-comment-edit") {
    state.historicalCommentEditMode = true;
    renderHistoricalCommentPanel(state.currentQuestion);
    renderInlineSupportCard();
    focusHistoricalCommentEditor();
    return;
  }

  if (action === "historical-comment-cancel") {
    state.historicalCommentEditMode = false;
    renderHistoricalCommentPanel(state.currentQuestion);
    renderInlineSupportCard();
    return;
  }

  if (action === "historical-comment-format") {
    applyHistoricalCommentFormat(button);
    return;
  }

  if (action === "historical-comment-image") {
    triggerHistoricalCommentImagePicker(button);
    return;
  }

  if (action === "historical-comment-save") {
    await saveHistoricalCommentEdit(button);
  }
}

async function handleHistoricalCommentColor(input, event) {
  event.preventDefault();
  if (!canEditHistoricalComment()) return;
  applyHistoricalCommentFormat({
    dataset: { command: "foreColor", value: input.value || "#0f172a" },
  });
}

function handleHistoricalCommentStyleSelect(select, event, styleName) {
  event.preventDefault();
  if (!canEditHistoricalComment()) return;
  const value = select.value || "";
  if (!value) return;
  applyHistoricalCommentStyle(select, styleName, value);
  select.value = "";
}

function applyHistoricalCommentFormat(button) {
  const command = button.dataset.command || "";
  if (!command) return;
  const editor = findHistoricalCommentEditor(button);
  if (!editor) return;
  editor.focus();
  restoreHistoricalCommentSelection(editor);
  document.execCommand(command, false, button.dataset.value || null);
  saveHistoricalCommentSelection(editor);
  setHistoricalCommentStatus("");
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
    setHistoricalCommentStatus(
      "Selecione um trecho do texto para aplicar a formatação.",
      true,
    );
    return;
  }

  const span = document.createElement("span");
  if (styleName === "fontSize") {
    span.style.fontSize = value;
  } else if (styleName === "fontFamily") {
    span.style.fontFamily = value;
  } else if (styleName === "lineHeight") {
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
  setHistoricalCommentStatus("");
}

function triggerHistoricalCommentImagePicker(button) {
  const editor = findHistoricalCommentEditor(button);
  const card = button.closest("[data-historical-comment-card]");
  const input = card?.querySelector("[data-historical-comment-image-input]");
  if (!editor || !input) return;
  saveHistoricalCommentSelection(editor);
  input.value = "";
  input.click();
}

async function handleHistoricalCommentImageInput(input, event) {
  event.preventDefault();
  if (!canEditHistoricalComment()) return;
  const files = Array.from(input.files || []);
  input.value = "";
  if (!files.length) return;
  const editor = findHistoricalCommentEditor(input);
  await insertHistoricalCommentImages(editor, files);
}

async function handleHistoricalCommentPaste(editor, event) {
  const files = Array.from(event.clipboardData?.files || []).filter((file) =>
    /^image\/(?:png|jpeg|webp|gif)$/i.test(file.type || ""),
  );
  if (!files.length) return false;
  event.preventDefault();
  await insertHistoricalCommentImages(editor, files);
  return true;
}

async function insertHistoricalCommentImages(editor, files) {
  if (!editor) return;
  const validFiles = [];
  for (const file of files) {
    if (!/^image\/(?:png|jpeg|webp|gif)$/i.test(file.type || "")) {
      setHistoricalCommentStatus("Use imagens PNG, JPEG, WebP ou GIF.", true);
      continue;
    }
    if (file.size > 3 * 1024 * 1024) {
      setHistoricalCommentStatus(
        "Imagem muito grande. Limite: 3 MB por imagem.",
        true,
      );
      continue;
    }
    validFiles.push(file);
  }
  if (!validFiles.length) return;

  editor.focus();
  restoreHistoricalCommentSelection(editor);
  for (const file of validFiles) {
    const dataUrl = await readFileAsDataUrl(file);
    insertHistoricalCommentImageNode(
      editor,
      dataUrl,
      file.name || "Imagem adicionada",
    );
  }
  saveHistoricalCommentSelection(editor);
  setHistoricalCommentStatus(
    `${validFiles.length} imagem${validFiles.length === 1 ? "" : "s"} inserida${validFiles.length === 1 ? "" : "s"}.`,
  );
}

function insertHistoricalCommentImageNode(editor, dataUrl, imageName) {
  const figure = document.createElement("figure");
  figure.className = "historical-comment-image";

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = imageName || "Imagem adicionada";
  figure.appendChild(img);

  const paragraph = document.createElement("p");
  paragraph.appendChild(document.createElement("br"));

  const selection = document.getSelection();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    if (rangeIntersectsEditor(range, editor)) {
      range.deleteContents();
      range.insertNode(paragraph);
      range.insertNode(figure);
      selection.removeAllRanges();
      const nextRange = document.createRange();
      nextRange.setStart(paragraph, 0);
      nextRange.collapse(true);
      selection.addRange(nextRange);
      return;
    }
  }

  editor.appendChild(figure);
  editor.appendChild(paragraph);
  const nextRange = document.createRange();
  nextRange.setStart(paragraph, 0);
  nextRange.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
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
    return (
      editor.contains(range.commonAncestorContainer) ||
      range.intersectsNode(editor)
    );
  } catch {
    return false;
  }
}

function findHistoricalCommentEditor(source) {
  const root = source?.closest?.("[data-historical-comment-card]") || document;
  return root.querySelector?.("[data-historical-comment-editor]");
}

function scheduleHistoricalTablePreparation(editor) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => prepareHistoricalCommentTables(editor));
  });
}

function prepareHistoricalCommentTables(editor) {
  if (!editor) return;
  editor
    .querySelectorAll(".historical-column-resizer")
    .forEach((handle) => handle.remove());
  editor.querySelectorAll("table").forEach((table) => {
    const firstRow = table.rows?.[0];
    if (!firstRow || firstRow.cells.length < 2) return;
    table.classList.add("is-resizable-table");
    const colgroup = ensureHistoricalTableColgroup(
      table,
      firstRow.cells.length,
    );
    const cols = Array.from(colgroup.querySelectorAll("col"));
    const tableRect = table.getBoundingClientRect();
    let hasMeasuredWidth = false;
    Array.from(firstRow.cells).forEach((cell, index) => {
      const col = cols[index];
      const width = Math.round(cell.getBoundingClientRect().width);
      if (col && width > 0 && !col.style.width) {
        col.style.width = `${width}px`;
        hasMeasuredWidth = true;
      }
      const handle = document.createElement("span");
      handle.className = "historical-column-resizer";
      handle.contentEditable = "false";
      handle.setAttribute("aria-hidden", "true");
      handle.dataset.historicalColumnIndex = String(index);
      cell.appendChild(handle);
    });
    if (tableRect.width > 0 && (!table.style.width || hasMeasuredWidth)) {
      setHistoricalTableWidthFromColumns(table, cols, tableRect.width);
    }
  });
}

function ensureHistoricalTableColgroup(table, columnCount) {
  let colgroup = table.querySelector(":scope > colgroup");
  if (!colgroup) {
    colgroup = document.createElement("colgroup");
    table.insertBefore(colgroup, table.firstChild);
  }
  while (colgroup.querySelectorAll("col").length < columnCount) {
    colgroup.appendChild(document.createElement("col"));
  }
  return colgroup;
}

function setHistoricalTableWidthFromColumns(table, cols, fallbackWidth = 0) {
  const totalWidth = cols.reduce(
    (sum, col) => sum + (parseFloat(col.style.width) || 0),
    0,
  );
  const width = Math.round(totalWidth || fallbackWidth);
  if (width > 0) table.style.width = `${width}px`;
}

function getHistoricalCommentEditorHtml(editor) {
  const clone = editor.cloneNode(true);
  clone
    .querySelectorAll(".historical-column-resizer")
    .forEach((handle) => handle.remove());
  return clone.innerHTML;
}

function handleHistoricalTableResizePointerDown(event) {
  const handle = event.target.closest?.(".historical-column-resizer");
  if (!handle || !canEditHistoricalComment()) return;
  const editor = handle.closest("[data-historical-comment-editor]");
  const table = handle.closest("table");
  if (!editor || !table) return;
  event.preventDefault();
  event.stopPropagation();

  const firstRow = table.rows?.[0];
  const columnIndex = Number(handle.dataset.historicalColumnIndex || 0);
  if (!firstRow || !Number.isInteger(columnIndex)) return;

  const colgroup = ensureHistoricalTableColgroup(table, firstRow.cells.length);
  const cols = Array.from(colgroup.querySelectorAll("col"));
  const targetCol = cols[columnIndex];
  if (!targetCol) return;

  const cell = firstRow.cells[columnIndex];
  const startWidth =
    parseFloat(targetCol.style.width) ||
    cell?.getBoundingClientRect().width ||
    80;
  state.historicalTableResize = {
    editor,
    table,
    cols,
    targetCol,
    columnIndex,
    startX: event.clientX,
    startWidth: Math.max(40, startWidth),
  };
  document.body.classList.add("is-resizing-historical-table");
  document.addEventListener(
    "pointermove",
    handleHistoricalTableResizePointerMove,
  );
  document.addEventListener("pointerup", handleHistoricalTableResizePointerUp, {
    once: true,
  });
}

function handleHistoricalTableResizePointerMove(event) {
  const resize = state.historicalTableResize;
  if (!resize) return;
  const nextWidth = Math.max(
    40,
    Math.round(resize.startWidth + event.clientX - resize.startX),
  );
  resize.targetCol.style.width = `${nextWidth}px`;
  setHistoricalTableWidthFromColumns(resize.table, resize.cols);
  setHistoricalCommentStatus("");
}

function handleHistoricalTableResizePointerUp() {
  const resize = state.historicalTableResize;
  state.historicalTableResize = null;
  document.body.classList.remove("is-resizing-historical-table");
  document.removeEventListener(
    "pointermove",
    handleHistoricalTableResizePointerMove,
  );
  if (resize?.editor) {
    prepareHistoricalCommentTables(resize.editor);
    saveHistoricalCommentSelection(resize.editor);
  }
}

function focusHistoricalCommentEditor() {
  window.requestAnimationFrame(() => {
    const editor =
      (!els.inlineSupportCard?.hidden &&
        els.inlineSupportBody?.querySelector(
          "[data-historical-comment-editor]",
        )) ||
      els.commentBody?.querySelector("[data-historical-comment-editor]");
    editor?.focus();
  });
}

async function saveHistoricalCommentEdit(button) {
  if (!state.selectedId || !state.currentQuestion) return;
  const editor = findHistoricalCommentEditor(button);
  if (!editor) return;
  const html = getHistoricalCommentEditorHtml(editor).trim();
  const card = button.closest("[data-historical-comment-card]");
  const markNotOutdated = Boolean(
    card?.querySelector("[data-historical-comment-clear-outdated]")?.checked,
  );
  setHistoricalCommentStatus("Salvando...");
  const result = await api(
    `/api/questions/${state.selectedId}/historical-comment`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, markNotOutdated }),
    },
  );
  if (result.error) {
    setHistoricalCommentStatus(result.error, true);
    return;
  }
  state.currentQuestion.comment = {
    ...state.currentQuestion.comment,
    ...(result.comment || {}),
  };
  if (result.metadata) {
    state.currentQuestion.metadata = {
      ...state.currentQuestion.metadata,
      ...result.metadata,
    };
  }
  state.historicalCommentEditMode = false;
  renderQuestionSituationTone(state.currentQuestion);
  renderQuestionBadges(state.currentQuestion);
  renderNormativeAlert(state.currentQuestion);
  renderNormativeTeachingPanel(state.currentQuestion);
  renderNormativePanel(state.currentQuestion);
  const hasTeachingSupport = Boolean(
    canRevealCurrentLawAnswer(state.currentQuestion) &&
    (state.currentQuestion.currentLawAnswer?.exists ||
      state.currentQuestion.normativeTeachingComment?.exists ||
      state.currentQuestion.metadata?.desatualizada),
  );
  els.openTeaching.disabled = !hasTeachingSupport;
  if (els.supportTabTeaching)
    els.supportTabTeaching.disabled = !hasTeachingSupport;
  syncNormativeSupportAvailability(state.currentQuestion);
  renderSupportVisibility();
  renderHistoricalCommentPanel(state.currentQuestion);
  renderInlineSupportCard();
  setHistoricalCommentStatus("Explicação salva.");
}

function setHistoricalCommentStatus(message, isError = false) {
  if (!els.commentEditStatus) return;
  els.commentEditStatus.textContent = message || "";
  els.commentEditStatus.classList.toggle("is-error", Boolean(isError));
  els.commentEditStatus.hidden = !message;
}

function renderNormativeAlert(question) {
  const update = question.normativeUpdate;
  const currentLaw = question.currentLawAnswer;
  if (currentLaw?.exists && !question.metadata?.desatualizada) {
    if (!hasAnsweredCurrentPrompt(question)) {
      els.normativeAlert.hidden = true;
      els.normativeAlert.innerHTML = "";
      return;
    }
    renderCurrentLawAlert(currentLaw);
    return;
  }

  if (question.metadata?.desatualizada) {
    if (!canRevealCurrentLawAnswer(question)) {
      els.normativeAlert.className = "normative-alert is-info";
      els.normativeAlert.innerHTML = `
        <div>
          <strong>Questao corrigida pela legislacao atual</strong>
          <span>Responda para ver o gabarito atual.</span>
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
    els.normativeAlert.innerHTML = "";
    return;
  }

  const tone = update?.isDiscardable
    ? "is-danger"
    : update?.isManualReview
      ? "is-warning"
      : "is-info";
  const title = update?.exists
    ? "Questão com análise normativa"
    : "Questão desatualizada";
  const detail = update?.exists
    ? [
        update.recomendacao ? `Recomendação: ${update.recomendacao}` : "",
        update.nivelSeguranca ? `Segurança: ${update.nivelSeguranca}` : "",
        update.hasChangedAnswer ? "gabarito provável mudou" : "",
      ]
        .filter(Boolean)
        .join(" - ")
    : "Esta questão foi marcada como desatualizada no banco.";

  els.normativeAlert.className = `normative-alert ${tone}`;
  els.normativeAlert.innerHTML = `
    <div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
    ${question.normativeTeachingComment?.exists ? '<button class="button button-primary" type="button" data-action="show-teaching">Ver comentário atualizado</button>' : ""}
    ${update?.exists ? '<button class="button button-secondary" type="button" data-action="show-normative">Ver análise normativa</button>' : ""}
  `;
  els.normativeAlert.hidden = false;
}

function renderCurrentLawAlert(currentLaw) {
  const status =
    currentLaw?.status || currentLaw?.currentLawStatus || "needs_audit";
  const canAutoScore =
    currentLaw?.canAutoScore ?? currentLaw?.canAutoScoreCurrentLaw;
  const tone =
    status === "discard"
      ? "is-danger"
      : status === "needs_audit" || status === "no_valid_alternative"
        ? "is-warning"
        : "is-info";
  const detail =
    status === "verified" && canAutoScore
      ? `Gabarito atual: ${currentAnswerLabel(currentLaw.currentAnswer)}`
      : status === "no_valid_alternative"
        ? "Sem alternativa compativel pela legislacao atual."
        : status === "discard"
          ? "Fora da fila principal pela legislacao atual."
          : "Precisa auditoria; nao pontuar pela legislacao atual.";
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

function isCurrentLawVerifiedForScoring(currentLaw) {
  return Boolean(
    currentLaw?.exists &&
    (currentLaw.status || currentLaw.currentLawStatus) === "verified" &&
    (currentLaw.canAutoScore || currentLaw.canAutoScoreCurrentLaw) &&
    currentLaw.currentAnswer,
  );
}

function renderNormativeTeachingPanel(question) {
  if (question.currentLawAnswer?.exists || question.metadata?.desatualizada) {
    if (!canRevealCurrentLawAnswer(question)) {
      els.teachingInfo.textContent = "bloqueado ate a tentativa";
      els.supportTeachingBody.innerHTML =
        '<p class="empty">A resposta pela legislacao atual fica disponivel depois que voce registrar uma alternativa.</p>';
      return;
    }
    renderCurrentLawAnswerPanel(question);
    return;
  }

  const teaching = question.normativeTeachingComment;
  if (!teaching?.exists) {
    els.teachingInfo.textContent = question.metadata?.desatualizada
      ? "ainda não gerado"
      : "indisponível";
    els.supportTeachingBody.innerHTML = question.metadata?.desatualizada
      ? '<p class="empty">Ainda não há comentário atualizado para esta questão. Use a aba de atualização normativa como referência de auditoria.</p>'
      : '<p class="empty">Esta questão não possui comentário normativo atualizado.</p>';
    return;
  }

  const isDiscard =
    teaching.status === "discard" ||
    teaching.answerPolicy === "discard_original";
  const needsManual =
    teaching.status === "needs_manual_review" ||
    teaching.answerPolicy === "not_assertive_manual_review" ||
    teaching.reviewStatus === "needs_manual_review";
  els.teachingInfo.textContent = teaching.currentAnswer
    ? "disponivel"
    : "sem resposta segura";

  const policyMessage = isDiscard
    ? '<p class="normative-warning is-danger">Questão não recomendada para estudo sem reformulação.</p>'
    : needsManual
      ? '<p class="normative-warning is-warning">Esta questão precisa de revisão manual antes de ser usada para correção segura.</p>'
      : "";
  const answer = teaching.currentAnswer
    ? currentAnswerLabel(teaching.currentAnswer)
    : "não definido com segurança";

  if (state.teachingEditMode) {
    els.supportTeachingBody.innerHTML = teachingEditFormMarkup(
      teaching,
      answer,
      policyMessage,
    );
    return;
  }

  els.supportTeachingBody.innerHTML = `
    <div class="teaching-v3-card">
      <div class="teaching-edit-toolbar">
        <div>
          <strong>Texto do aluno</strong>
          <span>${teaching.studentEdit?.exists ? `editado em ${escapeHtml(formatFullDate(teaching.studentEdit.updatedAt))}` : "sem edicao manual"}</span>
        </div>
        <div class="teaching-edit-actions">
          <button class="button button-secondary" type="button" data-action="teaching-edit">Editar texto</button>
          ${teaching.studentEdit?.exists ? '<button class="button button-ghost" type="button" data-action="teaching-reset-edit">Restaurar original</button>' : ""}
        </div>
      </div>
      ${policyMessage}
      ${teachingV3Section("Gabarito pela regra atual", answer, { highlight: true })}
      ${teachingLegalBasisMarkup(teaching)}
      ${teachingV3Section("Explicação", teaching.shortExplanationMd || teaching.shortExplanation)}
      ${teachingV3Section("Regra atual em resumo", teaching.currentRuleSummaryMd || teaching.currentRuleSummary)}
      ${teachingV3Section("Complementação de professor", teaching.professorComplementMd)}
      ${teachingV3Section("Conclusão para estudo", teaching.studyConclusionMd)}
    </div>
  `;
}

function renderCurrentLawAnswerPanel(question) {
  const answer = question.currentLawAnswer || {
    exists: false,
    currentLawStatus: "needs_audit",
  };
  if (state.currentLawEditMode) {
    els.teachingInfo.textContent = "editando";
    els.supportTeachingBody.innerHTML = currentLawEditFormMarkup(
      question,
      answer,
    );
    return;
  }
  const status = answer.status || answer.currentLawStatus || "needs_audit";
  const canAutoScore = answer.canAutoScore ?? answer.canAutoScoreCurrentLaw;
  const canScore = Boolean(
    canAutoScore && answer.currentAnswer && status === "verified",
  );
  const currentAnswer = canScore
    ? currentAnswerLabel(answer.currentAnswer)
    : status === "no_valid_alternative"
      ? "sem alternativa compativel pela legislacao atual"
      : "nao definido para pontuacao automatica";
  const why =
    answer.teacherExplanation ||
    (status === "no_valid_alternative"
      ? "As alternativas disponiveis nao ficam compativeis com a regra vigente."
      : status === "discard"
        ? "Esta questao foi retirada da fila principal de estudo pela legislacao atual."
        : "Esta questao ainda precisa de auditoria antes de ser corrigida pela legislacao atual.");
  const foundation = [
    answer.legalBasis,
    answer.articleReference,
    answer.articleExcerpt,
  ]
    .filter(Boolean)
    .join("\n\n");
  const conclusion =
    answer.studyConclusion ||
    (canScore
      ? "Use este gabarito apenas para estudo pela legislacao atual."
      : "Nao use o gabarito historico para corrigir esta questao no modo de legislacao atual.");

  els.teachingInfo.textContent = canScore ? "disponivel" : "sem pontuacao";
  els.supportTeachingBody.innerHTML = `
    <div class="teaching-v3-card">
      <div class="teaching-edit-toolbar">
        <div>
          <strong>Resposta atual</strong>
          <span>${answer.updatedAt ? `atualizada em ${escapeHtml(formatFullDate(answer.updatedAt))}` : "registro da legislação atual"}</span>
        </div>
        <div class="teaching-edit-actions">
          <button class="button button-secondary" type="button" data-action="current-law-edit">Editar resposta atual</button>
        </div>
      </div>
      ${teachingV3Section("Gabarito pela legislacao atual", currentAnswer, { highlight: true })}
      ${teachingV3Section("Por que?", why)}
      ${teachingV3Section("Fundamento", foundation)}
      ${teachingV3Section("Regra em resumo", answer.ruleSummary || "")}
      ${teachingV3Section("Conclusao para estudo", conclusion)}
    </div>
  `;
}

function currentLawEditFormMarkup(question, answer) {
  const status = answer.status || answer.currentLawStatus || "needs_audit";
  const historicalAnswer =
    answer.historicalAnswer ||
    question.answering?.historicalAnswer ||
    question.comment?.historicalAnswer ||
    "";
  const expectedFormat =
    question.metadata?.tipo === "CERTO_ERRADO"
      ? "Use CERTO ou ERRADO."
      : "Use A, B, C, D ou E.";
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
            ${currentLawStatusOption("verified", "Verificada", status)}
            ${currentLawStatusOption("needs_audit", "Precisa auditoria", status)}
            ${currentLawStatusOption("no_valid_alternative", "Sem alternativa valida", status)}
            ${currentLawStatusOption("discard", "Descartar do estudo atual", status)}
          </select>
        </label>
        <label class="teaching-edit-field">
          <span>Gabarito atual</span>
          <input name="currentAnswer" value="${escapeAttr(answer.currentAnswer || "")}" placeholder="${escapeAttr(question.metadata?.tipo === "CERTO_ERRADO" ? "CERTO ou ERRADO" : "A, B, C, D ou E")}">
        </label>
      </div>
      <label class="checkline">
        <input name="canAutoScore" type="checkbox" ${answer.canAutoScore || answer.canAutoScoreCurrentLaw ? "checked" : ""}>
        <span>Pontuar automaticamente quando status for verificada</span>
      </label>
      ${teachingEditTextarea("Por que?", "teacherExplanation", answer.teacherExplanation || "")}
      ${teachingEditTextarea("Fundamento", "legalBasis", answer.legalBasis || "")}
      ${teachingEditTextarea("Referência do artigo/dispositivo", "articleReference", answer.articleReference || "")}
      ${teachingEditTextarea("Trecho oficial curto", "articleExcerpt", answer.articleExcerpt || "")}
      ${teachingEditTextarea("Regra em resumo", "ruleSummary", answer.ruleSummary || "")}
      ${teachingEditTextarea("Complementação de professor", "professorComplement", answer.professorComplement || "")}
      ${teachingEditTextarea("Conclusão para estudo", "studyConclusion", answer.studyConclusion || "")}
      <label class="teaching-edit-field">
        <span>URL da fonte</span>
        <input name="sourceUrl" value="${escapeAttr(answer.sourceUrl || "")}">
      </label>
    </form>
  `;
}

function currentLawStatusOption(value, label, current) {
  return `<option value="${escapeAttr(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function syncCurrentLawAutoScoreControl(target) {
  const select = target?.closest?.('select[name="currentLawStatus"]');
  if (!select) return false;
  const form = select.closest("[data-current-law-edit-form]");
  const checkbox = form?.querySelector('input[name="canAutoScore"]');
  if (checkbox) {
    checkbox.checked = select.value === "verified";
  }
  return true;
}

async function saveCurrentLawAnswerEdit() {
  if (!state.selectedId) return;
  const form = els.supportTeachingBody.querySelector(
    "[data-current-law-edit-form]",
  );
  if (!form) return;
  const data = new FormData(form);
  setCurrentLawEditButtonsDisabled(true);
  try {
    const result = await api(
      `/api/questions/${state.selectedId}/current-law-answer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentLawStatus: data.get("currentLawStatus") || "needs_audit",
          currentAnswer: data.get("currentAnswer") || "",
          canAutoScore: Boolean(data.get("canAutoScore")),
          teacherExplanation: data.get("teacherExplanation") || "",
          legalBasis: data.get("legalBasis") || "",
          articleReference: data.get("articleReference") || "",
          articleExcerpt: data.get("articleExcerpt") || "",
          ruleSummary: data.get("ruleSummary") || "",
          professorComplement: data.get("professorComplement") || "",
          studyConclusion: data.get("studyConclusion") || "",
          sourceUrl: data.get("sourceUrl") || "",
        }),
      },
    );
    if (result.error) throw new Error(result.error);
    state.currentQuestion.currentLawAnswer = result.currentLawAnswer;
    if (result.metadata) {
      state.currentQuestion.metadata = {
        ...state.currentQuestion.metadata,
        ...result.metadata,
      };
    }
    if (result.answering) {
      state.currentQuestion.answering = {
        ...state.currentQuestion.answering,
        ...result.answering,
      };
    }
    if (result.normativeTeachingComment) {
      state.currentQuestion.normativeTeachingComment =
        result.normativeTeachingComment;
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
  return (
    {
      verified: "verificada",
      needs_audit: "precisa auditoria",
      no_valid_alternative: "sem alternativa compativel",
      discard: "fora da fila principal",
    }[status] || "precisa auditoria"
  );
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
      ${teachingEditTextarea("Fundamento aplicavel", "legalBasisMd", teachingEditValue(teaching, "legalBasisMd", teachingDisplayedLegalBasis(teaching)))}
      ${teachingEditTextarea("Explicacao", "shortExplanationMd", teachingEditValue(teaching, "shortExplanationMd", teaching.shortExplanationMd || teaching.shortExplanation))}
      ${teachingEditTextarea("Regra atual em resumo", "currentRuleSummaryMd", teachingEditValue(teaching, "currentRuleSummaryMd", teaching.currentRuleSummaryMd || teaching.currentRuleSummary))}
      ${teachingEditTextarea("Complementacao de professor", "professorComplementMd", teachingEditValue(teaching, "professorComplementMd", teaching.professorComplementMd))}
      ${teachingEditTextarea("Conclusao para estudo", "studyConclusionMd", teachingEditValue(teaching, "studyConclusionMd", teaching.studyConclusionMd))}
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
    return edit[key] ?? "";
  }
  return fallback || "";
}

function teachingDisplayedLegalBasis(teaching) {
  return (
    teaching.legalBasis ||
    teaching.legalArticleReference ||
    teaching.mainLegalBasis ||
    ""
  );
}

async function saveNormativeTeachingEdit() {
  if (!state.selectedId) return;
  const form = els.supportTeachingBody.querySelector(
    "[data-teaching-edit-form]",
  );
  if (!form) return;

  const data = new FormData(form);
  setTeachingEditButtonsDisabled(true);
  try {
    const result = await api(
      `/api/questions/${state.selectedId}/normative-teaching-edit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalBasisMd: data.get("legalBasisMd") || "",
          shortExplanationMd: data.get("shortExplanationMd") || "",
          currentRuleSummaryMd: data.get("currentRuleSummaryMd") || "",
          professorComplementMd: data.get("professorComplementMd") || "",
          studyConclusionMd: data.get("studyConclusionMd") || "",
        }),
      },
    );
    if (result.error) throw new Error(result.error);
    state.currentQuestion.normativeTeachingComment =
      result.normativeTeachingComment;
    state.teachingEditMode = false;
    renderNormativeTeachingPanel(state.currentQuestion);
  } catch (error) {
    els.teachingInfo.textContent = `erro ao salvar: ${error.message}`;
    setTeachingEditButtonsDisabled(false);
  }
}

async function resetNormativeTeachingEdit() {
  if (!state.selectedId) return;
  if (
    !window.confirm("Restaurar o comentario atualizado original desta questao?")
  )
    return;

  setTeachingEditButtonsDisabled(true);
  try {
    const result = await api(
      `/api/questions/${state.selectedId}/normative-teaching-edit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      },
    );
    if (result.error) throw new Error(result.error);
    state.currentQuestion.normativeTeachingComment =
      result.normativeTeachingComment;
    state.teachingEditMode = false;
    renderNormativeTeachingPanel(state.currentQuestion);
  } catch (error) {
    els.teachingInfo.textContent = `erro ao restaurar: ${error.message}`;
    setTeachingEditButtonsDisabled(false);
  }
}

function setTeachingEditButtonsDisabled(disabled) {
  els.supportTeachingBody
    .querySelectorAll(
      '[data-action="teaching-save-edit"], [data-action="teaching-reset-edit"]',
    )
    .forEach((button) => {
      button.disabled = disabled;
    });
}

function teachingV3Section(title, markdown, options = {}) {
  const text = String(markdown || "").trim();
  if (!text) return "";
  return `
    <section class="teaching-v3-section ${options.highlight ? "is-highlight" : ""}">
      <strong>${escapeHtml(title)}</strong>
      <div>${markdownLiteToHtml(text)}</div>
    </section>
  `;
}

function teachingLegalBasisMarkup(teaching) {
  const reference =
    teaching.legalArticleReference ||
    teaching.mainLegalBasis ||
    teaching.legalBasis;
  const excerpt = teaching.articleExcerptCanQuote
    ? teaching.legalArticleExcerpt
    : "";
  const note =
    teaching.legalArticleExcerpt && !teaching.articleExcerptCanQuote
      ? '<p class="teaching-v3-note">Trecho literal não exibido porque o seed não marcou a transcrição como exata ou segura por tema.</p>'
      : "";
  if (!reference && !excerpt && !note) return "";
  return `
    <section class="teaching-v3-section">
      <strong>Artigo/fundamento aplicável</strong>
      ${reference ? `<p>${escapeHtml(reference)}</p>` : ""}
      ${excerpt ? `<blockquote>${escapeHtml(excerpt)}</blockquote>` : ""}
      ${note}
    </section>
  `;
}

function teachingAlternativesMarkup(items) {
  if (!items) return "";
  if (!Array.isArray(items) && typeof items === "object") {
    const correct = items.correct_alternative || "";
    const note = items.note || "";
    const text = items.correct_alternative_text || "";
    if (!correct && !note && !text) return "";
    return `
      <section class="teaching-alternatives">
        <strong>Análise das alternativas</strong>
        ${correct ? `<div class="teaching-alternative is-current-correct"><span>${escapeHtml(correct)}</span><p>${escapeHtml(text || "Alternativa provável pela regra atual.")}</p></div>` : ""}
        ${note ? `<p class="normative-note">${escapeHtml(note)}</p>` : ""}
      </section>
    `;
  }
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <section class="teaching-alternatives">
      <strong>Análise das alternativas</strong>
      ${items
        .map(
          (item) => `
        <div class="teaching-alternative ${item.is_correct_current_rule ? "is-current-correct" : ""}">
          <span>${escapeHtml(item.letter || "-")}</span>
          <p>${escapeHtml(item.analysis || "")}</p>
        </div>
      `,
        )
        .join("")}
    </section>
  `;
}

function renderNormativePanel(question) {
  const update = question.normativeUpdate;
  if (!update?.exists) {
    els.normativeSupportInfo.textContent = question.metadata?.desatualizada
      ? "sem análise importada"
      : "indisponível";
    els.supportNormativeBody.innerHTML = question.metadata?.desatualizada
      ? '<p class="empty">Esta questão está marcada como desatualizada, mas ainda não há análise normativa importada para ela.</p>'
      : '<p class="empty">Esta questão não possui análise normativa importada.</p>';
    return;
  }

  if (question.currentLawAnswer?.exists) {
    const currentLaw = question.currentLawAnswer;
    const status =
      currentLaw.status || currentLaw.currentLawStatus || "needs_audit";
    const currentAnswer = currentLaw.currentAnswer
      ? currentAnswerLabel(currentLaw.currentAnswer)
      : status === "no_valid_alternative"
        ? "sem alternativa compatível"
        : "não definido para pontuação";
    els.normativeSupportInfo.textContent = "registro antigo de auditoria";
    els.supportNormativeBody.innerHTML = `
      <div class="normative-card">
        <p class="normative-warning is-info">Esta análise normativa é um registro antigo de auditoria. A resposta de estudo é definida pela tabela de resposta pela legislação atual.</p>
        <div class="normative-summary-grid">
          ${normativeField("Resposta atual de estudo", currentAnswer)}
          ${normativeField("Status atual", currentLawStatusLabel(status))}
        </div>
        <details class="normative-details">
          <summary>Dados antigos de auditoria</summary>
          <div class="normative-summary-grid">
            ${normativeField("Recomendação antiga", update.recomendacao)}
            ${normativeField("Segurança antiga", update.nivelSeguranca)}
            ${normativeField("Gabarito histórico", update.gabaritoBanco)}
            ${normativeField("Gabarito atualizado provável antigo", update.gabaritoAtualizadoProvavel)}
            ${normativeField("Mudança de gabarito antiga", update.mudancaGabarito)}
            ${normativeField("Fonte-base", update.fonteBase)}
          </div>
          ${normativeTextBlock("Por que estava desatualizada", update.porQueDesatualizada)}
          ${normativeTextBlock("Nova regra registrada na auditoria antiga", update.novaRegraEstadoAtual)}
          ${normativeTextBlock("Fundamento antigo", update.fundamentoJuridicoAtual)}
          ${normativeTextBlock("Observação antiga sobre o enunciado literal", update.observacaoEnunciadoLiteral)}
        </details>
      </div>
    `;
    return;
  }

  els.normativeSupportInfo.textContent = [
    update.recomendacao || "",
    update.nivelSeguranca ? `segurança ${update.nivelSeguranca}` : "",
    update.reviewStatus
      ? `status ${reviewStatusLabel(update.reviewStatus)}`
      : "",
  ]
    .filter(Boolean)
    .join(" - ");

  const warning = update.isDiscardable
    ? '<p class="normative-warning is-danger">Esta questão não é recomendada para estudo sem reformulação.</p>'
    : update.isManualReview
      ? '<p class="normative-warning is-warning">Não há segurança suficiente. Revisar manualmente.</p>'
      : update.hasChangedAnswer
        ? '<p class="normative-warning is-warning">Atenção: o gabarito provável mudou pela análise normativa.</p>'
        : "";

  els.supportNormativeBody.innerHTML = `
    <div class="normative-card">
      ${warning}
      <div class="normative-summary-grid">
        ${normativeField("Recomendação", update.recomendacao)}
        ${normativeField("Segurança", update.nivelSeguranca)}
        ${normativeField("Gabarito histórico", update.gabaritoBanco)}
        ${normativeField("Gabarito atualizado provável", update.gabaritoAtualizadoProvavel)}
        ${normativeField("Mudança de gabarito", update.mudancaGabarito)}
        ${normativeField("Fonte-base", update.fonteBase)}
      </div>
      ${normativeTextBlock("Por que está desatualizada", update.porQueDesatualizada)}
      ${normativeTextBlock("Nova regra atual", update.novaRegraEstadoAtual)}
      ${normativeTextBlock("Fundamento atual", update.fundamentoJuridicoAtual)}
      ${normativeTextBlock("Observação sobre o enunciado literal", update.observacaoEnunciadoLiteral)}
      <p class="normative-note">Análise normativa auxiliar. Conferir manualmente antes de usar como atualização definitiva da questão.</p>
    </div>
  `;
}

function normativeField(label, value) {
  return `
    <span class="normative-field">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value || "não informado")}</strong>
    </span>
  `;
}

function normativeTextBlock(title, text) {
  if (!text) return "";
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
    if (els.appliedTheoryInfo)
      els.appliedTheoryInfo.textContent = "indisponivel";
    els.supportAppliedTheoryBody.innerHTML =
      '<p class="empty">Teoria aplicada individual ainda nao disponivel para esta questao.</p>';
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

  if (card.cardStatus === "needs_current_law_audit") {
    els.supportAppliedTheoryBody.innerHTML = `
      <div class="quick-theory-card">
        <strong class="quick-theory-title">Auditoria normativa pendente</strong>
        <p class="quick-theory-warning">${escapeHtml(card.showWarning || "Esta questao precisa de auditoria normativa antes de receber teoria aplicada segura.")}</p>
        ${quickTheorySection("Ponto da questao", card.questionFocus)}
        ${quickTheorySection("Orientacao de estudo", card.studyConclusion)}
      </div>
    `;
    return;
  }

  const answerTitle = card.noValidAlternative
    ? "Sem alternativa compativel pela legislacao vigente"
    : card.currentAnswer
      ? `Gabarito atual: ${currentAnswerLabel(card.currentAnswer)}`
      : card.historicalAnswer
        ? `Gabarito historico: ${currentAnswerLabel(card.historicalAnswer)}`
        : "";

  els.supportAppliedTheoryBody.innerHTML = `
    <div class="quick-theory-card applied-theory-card">
      <strong class="quick-theory-title">${escapeHtml(card.title || "Teoria aplicada a questao")}</strong>
      ${card.showWarning ? `<p class="quick-theory-warning">${escapeHtml(card.showWarning)}</p>` : ""}
      ${quickTheorySection("O que a questao cobra", card.questionFocus)}
      ${answerTitle ? quickTheorySection("Gabarito pela regra de estudo", answerTitle) : ""}
      ${quickTheorySection("Dispositivo que resolve", card.primaryLegalLocator || card.legalBasis)}
      ${quickTheoryNormExcerpt(card.primaryExactExcerpt || card.articleExcerpt)}
      ${quickTheorySection("Aplicacao ao enunciado", card.appliedExplanation)}
      ${quickTheoryBullets(card.ruleSummaryBullets || [], "Resumo para memorizar")}
      ${quickTheorySection("Pegadinha de prova", card.professorTip)}
      ${quickTheoryBullets(card.commonTraps || [], "Armadilhas comuns")}
      ${quickTheorySection("Conclusao para estudo", card.studyConclusion)}
      ${
        card.primaryExactExcerpt || card.articleExcerpt
          ? quickTheoryOfficialText([
              {
                label: card.primaryLegalLocator || card.legalBasis,
                excerpt: card.primaryExactExcerpt || card.articleExcerpt,
                text: card.primaryExactExcerpt || card.articleExcerpt,
                sourceUrl:
                  card.exactExcerptSourceUrl || card.sourceUrls?.[0] || "",
              },
            ])
          : ""
      }
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
    published: "aplicada",
    no_valid_alternative: "sem alternativa",
    needs_current_law_audit: "auditoria pendente",
    draft_needs_review: "revisao",
    discarded: "descartada",
    blocked: "bloqueada",
  };
  return labels[status] || "disponivel";
}

function renderQuickTheoryPanel(question) {
  const legalStudy = question?.legalStudy;
  if (!legalStudy?.available || !legalStudy.primaryCard) {
    if (els.quickTheoryInfo) els.quickTheoryInfo.textContent = "indisponível";
    if (els.supportQuickTheoryBody) {
      els.supportQuickTheoryBody.innerHTML =
        '<p class="empty">Teoria rápida ainda não disponível para este ponto.</p>';
    }
    return;
  }

  const card = legalStudy.primaryCard;
  const articles = legalStudy.officialText?.articles || [];
  const isPanorama =
    legalStudy.mode === "panorama" ||
    card.displayKind === "panorama" ||
    card.displayMode === "general_orientation_only";
  if (els.quickTheoryInfo) {
    els.quickTheoryInfo.textContent = isPanorama
      ? "panorama do assunto"
      : card.microtema || card.assunto || "microteoria";
  }
  if (!els.supportQuickTheoryBody) return;

  if (isPanorama) {
    els.supportQuickTheoryBody.innerHTML = `
      <div class="quick-theory-card is-panorama">
        <strong class="quick-theory-title">Panorama do assunto</strong>
        <p class="quick-theory-warning">${escapeHtml(legalStudy.warning || "Este e um panorama geral. Ainda nao ha microcard especifico validado para esta questao.")}</p>
        <details class="quick-theory-details">
          <summary>Ver panorama</summary>
          <div>
            <strong class="quick-theory-title">${escapeHtml(card.title || "Panorama")}</strong>
            ${quickTheorySection("Orientacao geral", card.answerSummary || card.ruleSummary)}
            ${quickTheorySection("Fundamento", quickTheoryFoundation(card, articles))}
            ${quickTheoryBullets(card.bullets || [])}
            ${quickTheorySection("Pontos de atencao", card.professorNote || card.commonTraps)}
            ${quickTheoryOfficialText(articles)}
          </div>
        </details>
      </div>
    `;
    return;
  }

  els.supportQuickTheoryBody.innerHTML = `
    <div class="quick-theory-card">
      <strong class="quick-theory-title">${escapeHtml(card.title || "Teoria rápida")}</strong>
      ${quickTheorySection("Regra que resolve esta questão", card.answerSummary || card.ruleSummary)}
      ${quickTheorySection("Fundamento", quickTheoryFoundation(card, articles))}
      ${quickTheoryBullets(card.bullets || [])}
      ${quickTheorySection("Pegadinha de prova", card.professorNote || card.commonTraps)}
      ${quickTheorySection("Como memorizar", card.memoryHook)}
      ${quickTheoryOfficialText(articles)}
      ${
        state.theoryUrl && state.theoryPdfAvailable
          ? `
        <p class="quick-theory-secondary">
          <a class="button button-secondary" href="${escapeAttr(state.theoryUrl)}" target="_blank" rel="noopener">Abrir PDF completo</a>
        </p>
      `
          : ""
      }
    </div>
  `;
}

function quickTheorySection(title, text) {
  if (!text) return "";
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
  return ref?.label || "";
}

function quickTheoryBullets(bullets, title = "Em resumo") {
  if (!Array.isArray(bullets) || !bullets.length) return "";
  return `
    <section class="quick-theory-section">
      <span>${escapeHtml(title)}</span>
      <ul>${bullets
        .slice(0, 5)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>
    </section>
  `;
}

function quickTheoryNormExcerpt(text) {
  if (!text) return "";
  return `
    <section class="quick-theory-section normative-text-block">
      <strong>Trecho da norma</strong>
      <p>${escapeHtml(text)}</p>
    </section>
  `;
}

function quickTheoryOfficialText(articles) {
  if (!Array.isArray(articles) || !articles.length) return "";
  return `
    <details class="quick-theory-official">
      <summary>Ver texto oficial</summary>
      ${articles
        .map(
          (article) => `
        <article>
          <strong>${escapeHtml(article.label || article.articleRef || "Texto oficial")}</strong>
          ${article.excerpt ? `<p>${escapeHtml(article.excerpt)}</p>` : ""}
          ${article.text && article.text !== article.excerpt ? `<blockquote>${escapeHtml(article.text)}</blockquote>` : ""}
          ${article.sourceUrl ? `<a href="${escapeAttr(article.sourceUrl)}" target="_blank" rel="noopener">Abrir fonte oficial</a>` : ""}
        </article>
      `,
        )
        .join("")}
    </details>
  `;
}

function renderTheoryPanel(question) {
  if (question.theory?.available) {
    const pageLabel = question.theory.pageStart
      ? `página ${question.theory.pageStart}${question.theory.pageCount ? ` de ${question.theory.pageCount}` : ""}`
      : question.theory.indexed
        ? "sem página segura"
        : "índice pendente";
    const openLabel = question.theory.pageStart
      ? "Abrir PDF na página"
      : "Abrir PDF da teoria";
    const baseUrl = question.theory.baseUrl || question.theory.url;
    els.theoryInfo.textContent = question.theory.pageStart
      ? pageLabel
      : question.theory.title || "PDF disponível";
    els.supportTheoryBody.innerHTML = `
      <div class="theory-card">
        <strong>${escapeHtml(question.theory.title || "Teoria relacionada")}</strong>
        <span class="theory-meta">${escapeHtml(question.metadata?.materia || "")}${question.metadata?.assunto ? ` • ${escapeHtml(question.metadata.assunto)}` : ""}</span>
        <span class="theory-page">${escapeHtml(pageLabel)}</span>
        ${
          question.theory.excerpt
            ? `
          <div class="theory-excerpt">
            <small>Trecho mais provável</small>
            <p>${escapeHtml(question.theory.excerpt)}</p>
          </div>
        `
            : `
          <p class="theory-index-note">${
            question.theory.indexed
              ? "PDF indexado, mas sem trecho suficientemente seguro para esta questão."
              : "Índice de páginas ainda não gerado para este PDF."
          }</p>
        `
        }
        ${
          question.theory.pdfAvailable
            ? `
        <div class="theory-card-actions">
          <a class="button button-primary" href="${escapeAttr(question.theory.url)}" target="_blank" rel="noopener">${escapeHtml(openLabel)}</a>
          ${question.theory.pageStart ? `<a class="button button-secondary" href="${escapeAttr(baseUrl)}" target="_blank" rel="noopener">Abrir do início</a>` : ""}
        </div>
        `
            : `<p class="theory-index-note">O PDF completo não está disponível online; use o trecho acima como referência.</p>`
        }
      </div>
    `;
    return;
  }

  els.theoryInfo.textContent = "indisponível";
  els.supportTheoryBody.innerHTML =
    '<p class="empty">Não encontrei PDF de teoria para esta matéria/assunto.</p>';
}

function renderHistoryPanel(question) {
  const total = Number(question.answerStats?.total || 0);
  els.historyInfo.textContent = total
    ? `${total} tentativa${total === 1 ? "" : "s"}`
    : "sem tentativas";
  els.supportHistoryBody.innerHTML = total
    ? `<div class="answer-details">${answerHistoryMarkup(question)}</div>`
    : '<p class="empty">Você ainda não respondeu esta questão.</p>';
}

function questionQuickStatus(question) {
  const pieces = [];
  if (question.lastAnswer?.is_correct === 1)
    pieces.push("última resposta correta");
  if (question.lastAnswer?.is_correct === 0) pieces.push("erro anterior");
  if (!question.answerStats?.total) pieces.push("não resolvida");
  if (isReviewDue(question.mastery?.nextDueAt)) pieces.push("revisão vencida");
  const mastery = Math.round(Number(question.mastery?.score || 0) * 100);
  pieces.push(`domínio ${mastery}%`);
  return pieces.join(" • ");
}

function canRevealCurrentLawAnswer(question = state.currentQuestion) {
  if (!question) return false;
  if (question.metadata?.desatualizada) {
    return isCurrentLawVerifiedForScoring(question.currentLawAnswer)
      ? hasAnsweredCurrentPrompt(question)
      : true;
  }
  return canRevealExplanation(question);
}

function isAnswerFirstStudyMode() {
  return ["adaptive", "smart", "study"].includes(state.studyMode);
}

function hasAnsweredCurrentPrompt(question = state.currentQuestion) {
  return Boolean(
    question &&
    state.answerResult &&
    Number(state.answerResult.questionId) === Number(question.id),
  );
}

function canRevealExplanation(question = state.currentQuestion) {
  if (!question) return false;
  if (!isAnswerFirstStudyMode()) return true;
  return hasAnsweredCurrentPrompt(question);
}

// Há algo para mostrar no painel de apoio (comentário, teoria, resposta atual,
// atualização normativa etc.). Usado para habilitar "Ver explicação" e para
// decidir se abrimos o modal automaticamente no mobile após responder.
// Mensagem transparente da próxima revisão: quando vence e por quê. Ajuda o
// aluno a entender que o intervalo curto é do rating (chute/erro) e cresce a
// cada acerto — não é aleatório.
function nextReviewHint(result) {
  const days = Number(result?.fsrs?.intervalDays || 0);
  const rating = Number(result?.fsrs?.rating || 0);
  const when = days === 1
    ? "amanhã"
    : days > 1
      ? `em ${days} dias`
      : (result?.nextDueAt ? `em ${formatDate(result.nextDueAt)}` : "");
  if (!when) return "Resposta registrada";
  const motivo = {
    1: "você errou — volta cedo",
    2: "acertou no chute — revisão cedo",
    3: "acertou",
    4: "acertou com folga — intervalo maior",
  }[rating] || "";
  return `Próxima revisão ${when}${motivo ? ` · ${motivo}` : ""}`;
}

function questionHasSupportContent(question = state.currentQuestion) {
  return Boolean(
    question?.comment?.html ||
    question?.comment?.text ||
    question?.appliedTheoryCard?.available ||
    question?.legalStudy?.available ||
    question?.normativeUpdate?.exists ||
    question?.currentLawAnswer?.exists ||
    question?.normativeTeachingComment?.exists ||
    question?.metadata?.desatualizada,
  );
}

function supportTabRequiresAnswer(tab) {
  return [
    "comment",
    "normative",
    "teaching",
    "appliedTheory",
    "quickTheory",
    "history",
  ].includes(tab);
}

function updateAnswerActions() {
  const selected = new FormData(els.answerForm).get("answer");
  const question = state.currentQuestion;
  const result = state.answerResult;
  const hasAlternatives = Boolean(question?.alternatives?.length);
  const hasExplanation = questionHasSupportContent(question);
  const canRevealSupport = canRevealExplanation(question);
  const hasPreviousAnswer = Boolean(question?.answerStats?.total);

  els.secondaryExplain.disabled = !question;
  els.errorTypeWrapper.hidden = true;

  if (result) {
    if (result.isCorrect === 1) {
      els.answerHint.textContent = nextReviewHint(result);
      els.submitAnswer.textContent = "Próxima questão";
      els.submitAnswer.dataset.action = "next";
      els.submitAnswer.disabled = false;
      els.secondaryExplain.textContent = "Ver explicação";
      els.secondaryExplain.dataset.action = "explain";
      els.secondaryExplain.disabled = !hasExplanation || !canRevealSupport;
      return;
    }

    if (result.isCorrect === 0) {
      els.answerHint.textContent = "Revise a explicação antes de avançar";
      els.errorTypeWrapper.hidden = false;
      els.submitAnswer.textContent = "Ver explicação";
      els.submitAnswer.dataset.action = "explain";
      els.submitAnswer.disabled = !hasExplanation;
      els.secondaryExplain.textContent = "Próxima questão";
      els.secondaryExplain.dataset.action = "next";
      els.secondaryExplain.disabled = false;
      return;
    }

    els.answerHint.textContent = nonScoringAnswerTitle(result);
    els.submitAnswer.textContent = "Próxima questão";
    els.submitAnswer.dataset.action = "next";
    els.submitAnswer.disabled = false;
    els.secondaryExplain.textContent = "Ver explicação";
    els.secondaryExplain.dataset.action = "explain";
    els.secondaryExplain.disabled = !hasExplanation || !canRevealSupport;
    return;
  }

  if (selected) {
    els.answerHint.textContent = "Pronta para corrigir";
    els.submitAnswer.textContent = hasPreviousAnswer
      ? "Responder novamente"
      : "Responder";
    els.submitAnswer.dataset.action = "respond";
    els.submitAnswer.disabled = !hasAlternatives;
    els.secondaryExplain.textContent = canRevealSupport
      ? "Ver explicação"
      : "Responda para liberar";
    els.secondaryExplain.dataset.action = "explain";
    els.secondaryExplain.disabled = !hasExplanation || !canRevealSupport;
    return;
  }

  if (hasPreviousAnswer) {
    if (isAnswerFirstStudyMode() && !canRevealSupport) {
      els.answerHint.textContent = "Responda para liberar a explicação";
      els.submitAnswer.textContent = "Responder";
      els.submitAnswer.dataset.action = "respond";
      els.submitAnswer.disabled = true;
      els.secondaryExplain.textContent = "Responda para liberar";
      els.secondaryExplain.dataset.action = "explain";
      els.secondaryExplain.disabled = true;
      return;
    }
    els.answerHint.textContent =
      state.studyMode === "adaptive"
        ? "Esta questão já foi respondida. Você pode revisar ou seguir."
        : "Questão já respondida";
    els.submitAnswer.textContent =
      state.studyMode === "adaptive"
        ? "Próxima recomendada"
        : "Próxima questão";
    els.submitAnswer.dataset.action = "next";
    els.submitAnswer.disabled = false;
    els.secondaryExplain.textContent = "Histórico";
    els.secondaryExplain.dataset.action = "history";
    els.secondaryExplain.disabled = false;
    return;
  }

  els.answerHint.textContent = "Escolha uma alternativa";
  els.submitAnswer.textContent = "Responder";
  els.submitAnswer.dataset.action = "respond";
  els.submitAnswer.disabled = true;
  els.secondaryExplain.textContent = canRevealSupport
    ? "Ver explicação"
    : "Responda para liberar";
  els.secondaryExplain.dataset.action = "explain";
  els.secondaryExplain.disabled = !hasExplanation || !canRevealSupport;
}

function renderAnswerResult(result) {
  if (result.error) {
    els.answerStatus.textContent = result.error;
    els.answerStatus.disabled = true;
    els.submitAnswer.disabled = false;
    return;
  }

  if (typeof result.masteryScore === "number") {
    const score = Math.round(result.masteryScore * 100);
    els.masteryScore.textContent = `${score}%`;
    els.masteryLabel.textContent = masteryLabel(score);
  }
  if (result.nextDueAt) {
    els.nextDue.textContent = formatDate(result.nextDueAt);
  }

  applyAnswerResultToCurrentQuestion(result);
  state.answerResult = result;

  const selectedInput = els.alternatives.querySelector(
    `input[name="answer"][value="${cssEscape(result.answer)}"]`,
  );
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
    canRevealCurrentLawAnswer(state.currentQuestion) &&
    (state.currentQuestion?.currentLawAnswer?.exists ||
      state.currentQuestion?.normativeTeachingComment?.exists ||
      state.currentQuestion?.metadata?.desatualizada),
  );
  els.openTeaching.disabled = !hasTeachingSupportAfterAnswer;
  if (els.supportTabTeaching) {
    els.supportTabTeaching.disabled = !hasTeachingSupportAfterAnswer;
  }
  renderAnswerResultBox();
  renderSelectedAlternative();
  updateAnswerActions();
  renderSupportVisibility();
  // Estes painéis foram renderizados antes da resposta (mostrando "Responda
  // para liberar"). Rerenderiza para revelar o conteúdo agora liberado, senão
  // o card inline copia a versão travada.
  renderAppliedTheoryPanel(state.currentQuestion);
  renderQuickTheoryPanel(state.currentQuestion);
  renderTheoryPanel(state.currentQuestion);
  renderInlineSupportCard();

  // No mobile o card de apoio inline fica escondido, então abrimos o modal
  // automaticamente após responder — traz a explicação histórica (e as demais
  // abas) sem o usuário precisar tocar em "Ver explicação".
  if (
    mobileLayoutQuery.matches &&
    canRevealExplanation(state.currentQuestion) &&
    questionHasSupportContent(state.currentQuestion)
  ) {
    openSupportPanel(preferredSupportTab(state.currentQuestion));
  }
}

function applyAnswerResultToCurrentQuestion(result) {
  if (!state.currentQuestion) {
    return;
  }

  const stats = state.currentQuestion.answerStats || {
    total: 0,
    correct: 0,
    wrong: 0,
    unknown: 0,
  };
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
    state.currentQuestion.normativeTeachingComment =
      result.normativeTeachingComment;
  }
  state.currentQuestion.lastAnswer = {
    answer_letter: result.answer || "",
    answer_text: result.answerText || "",
    expected_answer: result.expectedAnswer || "",
    is_correct: result.isCorrect,
    answered_at: result.answeredAt || new Date().toISOString(),
    confidence: result.confidence || els.confidenceSelect.value || "",
    error_type: result.errorType || "",
  };
}

function showAnswerSubmitError(error) {
  console.error(error);
  els.answerResult.className = "answer-result is-wrong";
  els.answerResult.innerHTML = `
    <span class="answer-result-icon" aria-hidden="true">!</span>
    <span><strong>Nao foi possivel registrar a resposta.</strong> Tente novamente. Se continuar, confira os logs da Vercel.</span>
  `;
  els.answerResult.hidden = false;
  els.answerHint.textContent = "Falha ao registrar";
  els.submitAnswer.textContent = "Responder";
  els.submitAnswer.dataset.action = "respond";
  els.submitAnswer.disabled = false;
}

function renderAnswerStatus(question) {
  const stats = question.answerStats || {
    total: 0,
    correct: 0,
    wrong: 0,
    unknown: 0,
  };
  if (!stats.total) {
    els.answerStatus.textContent = "";
    els.answerStatus.disabled = true;
    els.answerDetails.hidden = true;
    els.answerDetails.innerHTML = "";
    return;
  }

  els.answerStatus.disabled = false;
  els.answerStatus.textContent = `Respondida ${stats.total} vez${stats.total === 1 ? "" : "es"} - detalhar`;
  els.answerDetails.innerHTML = answerHistoryMarkup(question);
  els.answerDetails.hidden = true;
}

function answerHistoryMarkup(question) {
  const stats = question.answerStats || {
    total: 0,
    correct: 0,
    wrong: 0,
    unknown: 0,
  };
  const last = question.lastAnswer;
  const lastStatus =
    last?.is_correct === 1
      ? "correta"
      : last?.is_correct === 0
        ? "incorreta"
        : "sem gabarito";

  return `
    <span>Respondida: <strong>${Number(stats.total || 0)}</strong> vez${Number(stats.total || 0) === 1 ? "" : "es"}</span>
    <span>Acertos: <strong>${Number(stats.correct || 0)}</strong></span>
    <span>Erros: <strong>${Number(stats.wrong || 0)}</strong></span>
    <span>Sem correção: <strong>${Number(stats.unknown || 0)}</strong></span>
    ${last ? `<span>Última resposta: <strong>${escapeHtml(lastStatus)}</strong></span>` : ""}
    ${last?.confidence ? `<span>Confiança: <strong>${escapeHtml(confidenceLabel(last.confidence))}</strong></span>` : ""}
    ${last?.error_type ? `<span>Tipo de erro: <strong>${escapeHtml(errorTypeLabel(last.error_type))}</strong></span>` : ""}
  `;
}

function renderQuestionBadges(question) {
  const badges = [];
  const meta = question?.metadata;
  const studyStatus = question?.studyStatus;
  if (question?.contranPrfUnpublished?.exists || meta?.isUnpublished) {
    badges.push(
      '<span class="question-badge is-unpublished">Inédita PRF/CONTRAN</span>',
    );
  }
  if (studyStatus?.isOutOfStudy) {
    const label =
      studyStatus.status === "review_later"
        ? "Revisar depois"
        : "Fora do estudo";
    badges.push(
      `<span class="question-badge is-study-excluded">${escapeHtml(label)}</span>`,
    );
  }
  if (meta?.desatualizada) {
    badges.push(
      '<span class="question-badge is-outdated">Desatualizada</span>',
    );
  }
  if (question?.normativeTeachingComment?.exists) {
    badges.push(
      '<span class="question-badge is-normative">Comentário atualizado</span>',
    );
  }
  if (meta?.anulada) {
    badges.push('<span class="question-badge is-canceled">Anulada</span>');
  }
  if (question?.comment?.html || question?.comment?.text) {
    badges.push('<span class="question-badge is-commented">Comentada</span>');
  }
  if (!question?.comment?.studyAnswer) {
    badges.push(
      '<span class="question-badge is-no-answer">Sem gabarito</span>',
    );
  }
  if (question?.lastAnswer?.is_correct === 0) {
    badges.push(
      '<span class="question-badge is-last-wrong">Errei por último</span>',
    );
  }
  if (isReviewDue(question?.mastery?.nextDueAt)) {
    badges.push('<span class="question-badge is-due">Revisão vencida</span>');
  }

  els.questionBadges.innerHTML = badges.join("");
  els.questionBadges.hidden = badges.length === 0;
}

function renderQuestionSituationTone(question) {
  const isCanceled = Boolean(question?.metadata?.anulada);
  const isOutdated = Boolean(question?.metadata?.desatualizada);
  els.studyLayout?.classList.toggle("is-canceled-question", isCanceled);
  els.studyLayout?.classList.toggle(
    "is-outdated-question",
    !isCanceled && isOutdated,
  );
  document.body.classList.toggle("has-canceled-question", isCanceled);
  document.body.classList.toggle(
    "has-outdated-question",
    !isCanceled && isOutdated,
  );
}

function renderContranPrf2021QuestionAlert(question) {
  if (!els.contranNormAlert) return;
  const matches = Array.isArray(question?.contranPrf2021Matches)
    ? question.contranPrf2021Matches
    : [];
  if (!matches.length) {
    els.contranNormAlert.hidden = true;
    els.contranNormAlert.innerHTML = "";
    return;
  }
  const first = matches[0];
  const sourceRef = formatContranRef(first.sourceNumber, first.sourceYear);
  els.contranNormAlert.hidden = false;
  els.contranNormAlert.innerHTML = `
    <div class="contran-question-alert-head">
      <strong>Atualização normativa CONTRAN</strong>
      <button class="button button-secondary" type="button" data-action="open-contran-map" data-ref="${escapeAttr(sourceRef)}">Ver mapa</button>
    </div>
    ${matches
      .slice(0, 3)
      .map((item) => renderContranPrf2021NormCard(item, { mode: "compact" }))
      .join("")}
  `;
}

function renderStudyStatusControl(question) {
  if (!els.studyStatusControl) {
    return;
  }

  const status = question?.studyStatus || {
    status: "active",
    reason: "",
    isOutOfStudy: false,
  };
  const active = Boolean(question);
  const outOfStudy = Boolean(status.isOutOfStudy);
  const reason =
    status.reason ||
    (question?.metadata?.desatualizada ? "outdated_no_value" : "other");

  els.studyStatusControl.classList.toggle("is-out-of-study", outOfStudy);
  els.studyStatusText.textContent = !active
    ? "Sem questao selecionada"
    : outOfStudy
      ? `${studyStatusLabel(status.status)} - ${studyStatusReasonLabel(reason)}`
      : "Ativa na fila adaptativa";
  els.studyStatusReason.value = [...els.studyStatusReason.options].some(
    (option) => option.value === reason,
  )
    ? reason
    : "other";

  els.studyStatusReason.disabled = !active || outOfStudy;
  els.excludeFromStudy.disabled = !active || outOfStudy;
  els.reviewLater.disabled = !active || outOfStudy;
  els.restoreToStudy.hidden = !active || !outOfStudy;
}

async function updateQuestionStudyStatus(status) {
  if (!state.selectedId) {
    return;
  }

  const reason =
    status === "active" ? "" : els.studyStatusReason.value || "other";
  const response = await api(
    `/api/questions/${state.selectedId}/study-status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    },
  );
  if (response.error) {
    els.studyStatusText.textContent = response.error;
    return;
  }

  state.currentQuestion.studyStatus = response.studyStatus;
  renderStudyStatusControl(state.currentQuestion);
  renderQuestionBadges(state.currentQuestion);
  loadStats().catch(() => {});

  if (status !== "active" && state.studyMode !== "all") {
    await goNext();
  }
}

function studyStatusLabel(status) {
  return (
    {
      excluded: "Fora do estudo",
      review_later: "Revisar depois",
      active: "Ativa",
    }[status] || "Ativa"
  );
}

function studyStatusReasonLabel(reason) {
  return (
    {
      outdated_no_value: "desatualizada sem aproveitamento",
      obsolete_norm: "norma antiga",
      bad_statement: "enunciado ruim",
      duplicate: "duplicada",
      manual_review: "revisar depois",
      other: "outro",
    }[reason] || "outro"
  );
}

function formatStatementHtml(question) {
  const html = String(question.statementHtml || "");
  const text = String(question.statementText || "");
  if (!text || /<table\b/i.test(html)) {
    return "";
  }

  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""));
  const tableGroups = findAssociationTableGroups(lines);
  if (!tableGroups.length) {
    return "";
  }

  const chunks = [];
  let cursor = 0;
  for (const group of tableGroups) {
    chunks.push(paragraphsFromLines(lines.slice(cursor, group.start)));
    chunks.push(associationTableMarkup(group.rows));
    cursor = group.end + 1;
  }
  chunks.push(paragraphsFromLines(lines.slice(cursor)));

  return chunks.filter(Boolean).join("");
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
  const trimmed = String(line || "").trim();
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
  const hasHeader =
    first && !looksLikeListItem(first.left) && !looksLikeListItem(first.right);
  const bodyRows = hasHeader ? rows.slice(1) : rows;
  const header = hasHeader
    ? `<thead><tr><th>${escapeHtml(first.left)}</th><th>${escapeHtml(first.right)}</th></tr></thead>`
    : "";

  return `
    <table class="statement-association-table">
      ${header}
      <tbody>
        ${bodyRows
          .map(
            (row) => `
          <tr>
            <td>${escapeHtml(row.left)}</td>
            <td>${escapeHtml(row.right)}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function paragraphsFromLines(lines) {
  const paragraphs = [];
  let current = [];

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      if (current.length) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      continue;
    }
    current.push(trimmed);
  }

  if (current.length) {
    paragraphs.push(current.join(" "));
  }

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function looksLikeListItem(value) {
  return /^(\(?[A-E]\)|[A-E][.)]|[IVXLCDM]+[.)]|[0-9]+[.)]|[0-9]+\s*[–-])/i.test(
    String(value || "").trim(),
  );
}

function renderAlternativeText(question, alternative) {
  const text = alternative.text || "";
  if (String(question.metadata?.tipo || "").toUpperCase() === "CERTO_ERRADO") {
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
  const alternatives = Array.isArray(question?.alternatives)
    ? question.alternatives
    : [];
  if (!shouldShuffleAlternatives(question)) {
    return alternatives.map((alternative) => ({
      ...alternative,
      displayLetter: alternative.letter,
    }));
  }

  const sourceLetters = alternatives.map((alternative) => alternative.letter);
  const attemptNumber = Number(question.answerStats?.total || 0);
  const shuffled = seededShuffle(
    alternatives.map((alternative) => ({ ...alternative })),
    `${question.id || question.questionId || ""}:${attemptNumber}`,
  );
  const sameOrder = shuffled.every(
    (alternative, index) => alternative.letter === alternatives[index]?.letter,
  );
  const ordered =
    sameOrder && shuffled.length > 1
      ? rotateArray(shuffled, (attemptNumber % (shuffled.length - 1)) + 1)
      : shuffled;

  return ordered.map((alternative, index) => ({
    ...alternative,
    displayLetter: sourceLetters[index] || alternative.letter,
  }));
}

function shouldShuffleAlternatives(question) {
  const alternatives = Array.isArray(question?.alternatives)
    ? question.alternatives
    : [];
  if (String(question?.metadata?.tipo || "").toUpperCase() === "CERTO_ERRADO")
    return false;
  if (Number(question?.answerStats?.total || 0) < 1) return false;
  if (alternatives.length < 3 || alternatives.length > 5) return false;

  const letters = alternatives.map((alternative) =>
    normalizeAnswer(alternative.letter),
  );
  const expectedLetters = ["A", "B", "C", "D", "E"].slice(
    0,
    alternatives.length,
  );
  if (letters.some((letter, index) => letter !== expectedLetters[index]))
    return false;

  return (
    !alternatives.some((alternative) =>
      alternativeTextMentionsAlternativeLetter(alternative.text || ""),
    ) && !commentMentionsAlternativeLetters(question)
  );
}

function alternativeTextMentionsAlternativeLetter(text) {
  const normalized = normalizeAnswerText(text);
  return (
    /\b(?:alternativa|opcao|letra)\s+[a-e]\b/.test(normalized) ||
    /\b[a-e]\s*\)/.test(normalized)
  );
}

function commentMentionsAlternativeLetters(question) {
  const text = normalizeAnswerText(
    stripHtmlText(
      [question?.comment?.text || "", question?.comment?.html || ""].join(" "),
    ),
  );
  if (!text) return false;

  return (
    /\b(?:gabarito|correta|incorreta)\s+(?:letra|alternativa)?\s*["']?[a-e]["']?\b/.test(
      text,
    ) ||
    /\b(?:alternativa|opcao|letra)\s*["']?[a-e]["']?\s*(?:correta|incorreta|certa|errada)?\b/.test(
      text,
    ) ||
    /\b[a-e]\s*[-–—]\s*(?:correta|incorreta|certa|errada)\b/.test(text)
  );
}

function stripHtmlText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function seededShuffle(items, seedText) {
  const shuffled = [...items];
  let seed = hashSeed(seedText);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed);
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function rotateArray(items, offset) {
  if (!items.length) return items;
  const normalizedOffset = offset % items.length;
  return [
    ...items.slice(normalizedOffset),
    ...items.slice(0, normalizedOffset),
  ];
}

function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value || "");
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
  const selected = new FormData(els.answerForm).get("answer");
  const result = state.answerResult;
  const expectedLetter = expectedAlternativeLetter(result?.expectedAnswer);
  els.alternatives.querySelectorAll(".alternative").forEach((label) => {
    const input = label.querySelector('input[name="answer"]');
    const letter = input?.value || "";
    const isSelected = Boolean(selected && input?.value === selected);
    const isEliminated = state.eliminatedAnswers.has(letter) && !isSelected;
    const isCorrectAnswer = Boolean(
      result && expectedLetter && letter === expectedLetter,
    );
    const isWrongAnswer = Boolean(
      result && result.isCorrect === 0 && letter === result.answer,
    );
    label.classList.toggle("is-selected", isSelected);
    label.classList.toggle("is-eliminated", isEliminated);
    label.classList.toggle("is-answer-correct", isCorrectAnswer);
    label.classList.toggle("is-answer-wrong", isWrongAnswer);
  });
}

function renderAnswerResultBox() {
  const result = state.answerResult;
  if (!result) {
    els.answerResult.hidden = true;
    els.answerResult.innerHTML = "";
    return;
  }

  const resolution =
    '<button class="answer-result-link" type="button" data-action="show-comment">Ver resolução</button>';
  const normative = normativeAnswerWarning(result);
  if (result.isCorrect === 1) {
    els.answerResult.className = "answer-result is-correct";
    els.answerResult.innerHTML = `
      <span class="answer-result-icon" aria-hidden="true">✓</span>
      <span><strong>Você acertou!</strong> Muito bem! ${resolution}${normative}</span>
    `;
  } else if (result.isCorrect === 0) {
    els.answerResult.className = "answer-result is-wrong";
    els.answerResult.innerHTML = `
      <span class="answer-result-icon" aria-hidden="true">×</span>
      <span><strong>Você errou!</strong> Gabarito: <strong>${escapeHtml(displayAnswerForCurrentQuestion(result.expectedAnswer || ""))}</strong>. ${resolution}${normative}</span>
    `;
  } else {
    els.answerResult.className = "answer-result";
    const title = nonScoringAnswerTitle(result);
    els.answerResult.innerHTML = `
      <span class="answer-result-icon" aria-hidden="true">?</span>
      <span><strong>${escapeHtml(title)}</strong>. ${resolution}${normative}</span>
    `;
  }
  els.answerResult.hidden = false;
}

function nonScoringAnswerTitle(result) {
  if (result?.correctionMode === "non_scoring") {
    const reason = result.nonScoringReason || "";
    if (reason === "needs_audit")
      return "Resposta registrada sem gabarito atual validado";
    if (reason === "no_valid_alternative")
      return "Resposta registrada sem alternativa atual compatível";
    if (reason === "discard") return "Resposta registrada sem pontuação";
  }
  return "Resposta registrada sem gabarito";
}

function normativeAnswerWarning(result) {
  const currentLaw = result.currentLawAnswer;
  if (result.correctionMode === "current_law" || currentLaw?.exists) {
    const reason = result.nonScoringReason || "";
    const text =
      reason === "no_valid_alternative"
        ? "Sem alternativa compativel pela legislacao atual. Tentativa registrada sem pontuacao."
        : reason === "discard"
          ? "Questao fora da fila principal pela legislacao atual. Tentativa registrada sem pontuacao."
          : reason === "needs_audit"
            ? [
                "Questao pendente de auditoria pela legislacao atual.",
                currentLaw?.historicalAnswer
                  ? `Gabarito historico cadastrado: ${displayCurrentAnswerLabel(currentLaw.historicalAnswer)}.`
                  : "",
                "O gabarito historico nao foi usado para pontuar.",
              ]
                .filter(Boolean)
                .join(" ")
            : `Correcao feita pela legislacao atual. Gabarito atual: ${displayCurrentAnswerLabel(result.expectedAnswer || currentLaw?.currentAnswer || "")}.`;
    return `<span class="answer-result-note">${escapeHtml(text)}</span>`;
  }

  return "";
}

function expectedAlternativeLetter(expectedAnswer) {
  const expected = normalizeAnswer(expectedAnswer);
  if (!expected || !state.currentQuestion?.alternatives) {
    return "";
  }
  if (
    String(state.currentQuestion.metadata?.tipo || "").toUpperCase() ===
    "CERTO_ERRADO"
  ) {
    const certoErrado = state.currentQuestion.alternatives.find(
      (item) =>
        normalizeAnswer(item.text) === expected ||
        matchesCertoErradoAlias(expected, normalizeAnswer(item.text)),
    );
    if (certoErrado) {
      return certoErrado.letter || "";
    }
  }

  if (/^[A-E]$/.test(expected)) {
    return expected;
  }

  const alternative = state.currentQuestion.alternatives.find(
    (item) => normalizeAnswer(item.text) === expected,
  );
  return alternative?.letter || "";
}

function displayAnswerForCurrentQuestion(answer) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return "";
  if (normalized === "CERTO" || normalized === "ERRADO") return normalized;
  const originalLetter = expectedAlternativeLetter(normalized);
  if (originalLetter) {
    const label = els.alternatives.querySelector(
      `.alternative[data-letter="${cssEscape(originalLetter)}"]`,
    );
    return label?.dataset.displayLetter || originalLetter;
  }
  return answer;
}

function displayCurrentAnswerLabel(answer) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) return "";
  if (normalized === "CERTO" || normalized === "ERRADO") return normalized;
  const displayed = displayAnswerForCurrentQuestion(normalized);
  return displayed ? `Alternativa ${displayed}` : currentAnswerLabel(answer);
}

function matchesCertoErradoAlias(answer, text) {
  return (
    (answer === "C" && text === "CERTO") ||
    (answer === "E" && text === "ERRADO")
  );
}

function applyStatementLengthClass(question) {
  const card = els.statement?.closest(".question-card");
  if (!card) return;
  const textLength = String(
    question?.statementText || els.statement?.textContent || "",
  )
    .replace(/\s+/g, " ")
    .trim().length;
  card.classList.remove(
    "is-short-statement",
    "is-medium-statement",
    "is-long-statement",
    "is-very-long-statement",
  );
  if (textLength >= 1600) {
    card.classList.add("is-very-long-statement");
  } else if (textLength >= 900) {
    card.classList.add("is-long-statement");
  } else if (textLength >= 360) {
    card.classList.add("is-medium-statement");
  } else {
    card.classList.add("is-short-statement");
  }
}

function preferredSupportTab(question = state.currentQuestion) {
  const canRevealCurrentLaw = canRevealCurrentLawAnswer(question);
  const hasHistoricalComment = Boolean(
    question?.comment?.html ||
    question?.comment?.text ||
    question?.contranPrfUnpublished?.historicalExplanation ||
    question?.contranPrfUnpublished?.teacherComment,
  );
  if (question?.comment?.userEditedAt && hasHistoricalComment) return "comment";
  // Questões desatualizadas mantêm prioridade da "Resposta atual" (segurança).
  if (
    canRevealCurrentLaw &&
    (question?.currentLawAnswer?.exists || question?.metadata?.desatualizada)
  )
    return "teaching";
  if (canRevealCurrentLaw && question?.normativeTeachingComment?.exists)
    return "teaching";
  // "Ver explicação" abre a explicação histórica quando ela existe — inclusive
  // nas questões que têm Teoria aplicada (a aba de teoria fica a um clique).
  if (hasHistoricalComment) return "comment";
  if (hasAppliedTheorySupport(question) && canRevealAppliedTheory(question))
    return "appliedTheory";
  if (question?.normativeUpdate?.exists) return "normative";
  if (hasQuickTheorySupport(question)) return "quickTheory";
  return "comment";
}

function supportTabTitle(tab, question = state.currentQuestion) {
  const commentTitle = isContranPrfUnpublishedQuestion(question)
    ? [
        "Comentário do professor",
        "Gabarito comentado, pegadinha e justificativas",
      ]
    : ["Explicação histórica", "Comentário do professor e gabarito histórico"];
  const titles = {
    teaching: [
      "Resposta pela legislacao atual",
      "Gabarito atual, fundamento e conclusao de estudo",
    ],
    appliedTheory: ["Teoria aplicada", "Regra que resolve esta questao"],
    quickTheory: ["Teoria rapida", "Regra, artigo e pegadinha de prova"],
    comment: commentTitle,
    normative: ["Atualizacao normativa", "Analise auxiliar da desatualizacao"],
    theory: ["Teoria relacionada", "Material em PDF da materia/assunto"],
    history: ["Historico da questao", "Tentativas registradas no banco local"],
    similar:
      question?.adaptive?.clusterPolicy === "stats_only"
        ? ["Outras do assunto", "Agrupamento amplo para consulta"]
        : ["Questoes semelhantes", "Representantes e variacoes de reforco"],
  };
  return titles[tab] || titles.comment;
}

function inlineSupportTabs() {
  const commentLabel = isContranPrfUnpublishedQuestion(state.currentQuestion)
    ? "Comentário do professor"
    : "Explicação histórica";
  return [
    ["teaching", "Resposta atual", els.supportTabTeaching],
    ["appliedTheory", "Teoria aplicada", els.supportTabAppliedTheory],
    ["quickTheory", "Teoria rápida", els.supportTabQuickTheory],
    ["normative", "Atualização normativa", els.supportTabNormative],
    ["comment", commentLabel, null],
    ["theory", "PDF", null],
    ["history", "Histórico", null],
    ["similar", "Semelhantes", null],
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
    similar: els.supportSimilarBody,
  };
  return (
    sources[tab]?.innerHTML || '<p class="empty">Conteúdo indisponível.</p>'
  );
}

function canUseInlineSupportTab(
  tab,
  sourceButton,
  question = state.currentQuestion,
) {
  if (sourceButton?.disabled) return false;
  if (supportTabRequiresAnswer(tab) && !canRevealExplanation(question))
    return false;
  if (tab === "appliedTheory" && !canRevealAppliedTheory(question))
    return false;
  if (tab === "quickTheory" && !hasQuickTheorySupport(question)) return false;
  if (tab === "normative" && !hasNormativeSupport(question)) return false;
  if (tab === "teaching") {
    return Boolean(
      question?.currentLawAnswer?.exists ||
      question?.normativeTeachingComment?.exists ||
      question?.metadata?.desatualizada,
    );
  }
  return true;
}

function renderInlineSupportCard() {
  if (!els.inlineSupportCard) return;
  const question = state.currentQuestion;
  const shouldShow = Boolean(
    question &&
    hasAnsweredCurrentPrompt(question) &&
    canRevealExplanation(question),
  );
  const wasHidden = els.inlineSupportCard.hidden;
  els.inlineSupportCard.hidden = !shouldShow;
  if (!shouldShow) {
    if (els.inlineSupportBody) els.inlineSupportBody.innerHTML = "";
    state.inlineSupportRenderKey = "";
    return;
  }

  const tabs = inlineSupportTabs();
  const usableTabs = tabs.filter(([tab, , sourceButton]) =>
    canUseInlineSupportTab(tab, sourceButton, question),
  );
  if (!usableTabs.some(([tab]) => tab === state.inlineSupportTab)) {
    const preferred = preferredSupportTab(question);
    state.inlineSupportTab = usableTabs.some(([tab]) => tab === preferred)
      ? preferred
      : usableTabs[0]?.[0] || "comment";
  }

  els.inlineSupportTabs.innerHTML = tabs
    .map(([tab, label, sourceButton]) => {
      const disabled = !canUseInlineSupportTab(tab, sourceButton, question);
      return `<button class="support-tab${tab === state.inlineSupportTab ? " is-active" : ""}" type="button" data-inline-support-tab="${escapeAttr(tab)}" ${disabled ? "disabled" : ""}>${escapeHtml(label)}</button>`;
    })
    .join("");

  const [title, subtitle] = supportTabTitle(state.inlineSupportTab, question);
  els.inlineSupportTitle.textContent = title;
  els.inlineSupportSubtitle.textContent = subtitle;
  const bodyHtml = inlineSupportBodyForTab(state.inlineSupportTab);
  const renderKey = [
    question.id || question.questionId || "",
    state.inlineSupportTab,
    state.answerResult?.questionId || "",
    question.comment?.userEditedAt || "",
    bodyHtml.length,
  ].join("|");
  const shouldResetScroll =
    wasHidden || renderKey !== state.inlineSupportRenderKey;
  els.inlineSupportBody.innerHTML = bodyHtml;
  state.inlineSupportRenderKey = renderKey;
  if (state.inlineSupportTab === "comment") {
    prepareHistoricalCommentTables(
      els.inlineSupportBody.querySelector("[data-historical-comment-editor]"),
    );
  }
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
  const action = button.dataset.action || "";
  if (!action.startsWith("current-law-") && !action.startsWith("teaching-"))
    return;
  event.preventDefault();
  if (action === "current-law-edit") {
    state.currentLawEditMode = true;
    renderNormativeTeachingPanel(state.currentQuestion);
  } else if (action === "current-law-cancel-edit") {
    state.currentLawEditMode = false;
    renderNormativeTeachingPanel(state.currentQuestion);
  } else if (action === "current-law-save-edit") {
    await saveCurrentLawAnswerEdit();
  } else if (action === "teaching-edit") {
    state.teachingEditMode = true;
    renderNormativeTeachingPanel(state.currentQuestion);
  } else if (action === "teaching-cancel-edit") {
    state.teachingEditMode = false;
    renderNormativeTeachingPanel(state.currentQuestion);
  } else if (action === "teaching-save-edit") {
    await saveNormativeTeachingEdit();
  } else if (action === "teaching-reset-edit") {
    await resetNormativeTeachingEdit();
  }
  renderInlineSupportCard();
}

function showCommentPanel() {
  openSupportPanel(preferredSupportTab(state.currentQuestion));
  state.sawComment = true;
  recordQuestionEvent("opened_comment");
}

function showTeachingPanel() {
  openSupportPanel("teaching");
  state.sawComment = true;
  recordQuestionEvent("opened_comment", "teaching");
}

function showQuickTheoryPanel() {
  if (!hasQuickTheorySupport(state.currentQuestion)) {
    openSupportPanel("quickTheory");
    return;
  }
  state.openedTheory = true;
  openSupportPanel("quickTheory");
  recordQuestionEvent("opened_theory", "quick_theory");
}

function showTheoryPanel() {
  if (!state.theoryUrl && !state.currentQuestion?.theory?.available) {
    openSupportPanel("theory");
    return;
  }
  state.openedTheory = true;
  openSupportPanel("theory");
  recordQuestionEvent("opened_theory", state.theoryUrl);
}

function showNormativePanel() {
  if (!hasNormativeSupport(state.currentQuestion)) {
    return;
  }
  openSupportPanel("normative");
}

async function showSimilarPanel() {
  openSupportPanel("similar");
  await loadSimilarQuestions();
}

function renderSimilarPanelIntro(question) {
  const adaptive = question?.adaptive;
  if (!adaptive?.exists) {
    els.similarInfo.textContent = "indisponível";
    els.supportSimilarBody.innerHTML =
      '<p class="empty">Esta questão ainda não está em uma família adaptativa.</p>';
    return;
  }
  const isStatsOnly = adaptive.clusterPolicy === "stats_only";
  els.similarInfo.textContent = isStatsOnly
    ? `${Number(adaptive.size || 0).toLocaleString("pt-BR")} no assunto`
    : adaptive.clusterType === "same_skill"
      ? `${Number(adaptive.size || 0).toLocaleString("pt-BR")} no mesmo assunto`
      : `${Number(adaptive.size || 0).toLocaleString("pt-BR")} semelhantes`;
  els.supportSimilarBody.innerHTML = `
    <p>${escapeHtml(isStatsOnly ? "Agrupamento amplo do mesmo assunto." : adaptive.reasonText || "Questões relacionadas pelo motor adaptativo.")}</p>
    <p class="empty">Abra este painel para ver outras questões relacionadas.</p>
  `;
}

async function loadSimilarQuestions() {
  if (!state.selectedId) return;
  els.similarInfo.textContent = "carregando";
  els.supportSimilarBody.innerHTML =
    '<p class="empty">Carregando questões relacionadas...</p>';
  const data = await api(`/api/questions/${state.selectedId}/similar`);
  if (!data.cluster?.id) {
    els.similarInfo.textContent = "sem cluster";
    els.supportSimilarBody.innerHTML =
      '<p class="empty">Nenhuma questão semelhante cadastrada.</p>';
    return;
  }
  const isStatsOnly = data.cluster.policy === "stats_only";
  els.similarInfo.textContent = isStatsOnly
    ? `${Number(data.cluster.size || 0).toLocaleString("pt-BR")} no assunto`
    : data.cluster.type === "same_skill"
      ? `${Number(data.cluster.size || 0).toLocaleString("pt-BR")} no mesmo assunto`
      : `${Number(data.cluster.size || 0).toLocaleString("pt-BR")} semelhantes`;
  const members = data.members || [];
  els.supportSimilarBody.innerHTML = `
    <p>${escapeHtml(isStatsOnly ? "Outras questões do mesmo assunto." : data.cluster.type === "same_skill" ? "Reforços dentro do mesmo assunto." : "Questões muito próximas identificadas pelo motor adaptativo.")}</p>
    ${
      members.length
        ? `<div class="similar-list">${members.map((member) => similarMemberMarkup(member)).join("")}</div>`
        : '<p class="empty">Nenhuma outra questao semelhante cadastrada nesta familia.</p>'
    }
  `;
}

function similarMemberMarkup(member) {
  const role = member.role === "representative" ? "representante" : "variação";
  const mastery = Math.round(Number(member.mastery_score || 0) * 100);
  const last =
    member.last_result === 1
      ? "última correta"
      : member.last_result === 0
        ? "última errada"
        : "não resolvida";
  const questionId = resolveQuestionId(member);
  const href = questionId ? questionLink(questionId) : "#";
  return `
    <div class="similar-item">
      <strong>${escapeHtml(role)} • ${escapeHtml(member.materia || "")}</strong>
      <span>${escapeHtml(member.assunto || "")}</span>
      <span>Domínio ${mastery}% • ${escapeHtml(last)}${member.similarity ? ` • similaridade ${Math.round(Number(member.similarity || 0) * 100)}%` : ""}</span>
      ${
        questionId
          ? `<a class="button button-secondary" href="${escapeAttr(href)}" data-question-id="${escapeAttr(questionId)}">Abrir</a>`
          : '<span class="empty">ID indisponivel</span>'
      }
    </div>
  `;
}

function hideCommentPanel() {
  closeSupportPanel();
}

function openSupportPanel(tab = "comment", options = {}) {
  if (tab === "normative" && !hasNormativeSupport(state.currentQuestion)) {
    tab = canRevealCurrentLawAnswer(state.currentQuestion)
      ? "teaching"
      : "comment";
  }
  if (tab === "quickTheory" && !hasQuickTheorySupport(state.currentQuestion)) {
    tab = canRevealCurrentLawAnswer(state.currentQuestion)
      ? "teaching"
      : "comment";
  }
  if (
    tab === "appliedTheory" &&
    !hasAppliedTheorySupport(state.currentQuestion)
  ) {
    tab = hasQuickTheorySupport(state.currentQuestion)
      ? "quickTheory"
      : "comment";
  }
  const tabCanReveal =
    tab === "teaching"
      ? canRevealCurrentLawAnswer(state.currentQuestion)
      : tab === "appliedTheory"
        ? canRevealAppliedTheory(state.currentQuestion)
        : canRevealExplanation(state.currentQuestion);
  if (supportTabRequiresAnswer(tab) && !tabCanReveal) {
    els.answerHint.textContent = "Responda para liberar a explicação";
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
      els.supportSimilarPanel,
    ].forEach((panel) => {
      if (panel) panel.scrollTop = 0;
    });
  });
}

function closeSupportPanel() {
  state.supportOpen = false;
  renderSupportVisibility();
  if (
    state.lastSupportTrigger &&
    typeof state.lastSupportTrigger.focus === "function"
  ) {
    state.lastSupportTrigger.focus();
  }
}

function lockPageScroll() {
  if (document.body.classList.contains("is-support-scroll-locked")) return;
  lockedBodyScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.top = `-${lockedBodyScrollY}px`;
  document.body.classList.add("is-support-scroll-locked");
}

function unlockPageScroll() {
  if (!document.body.classList.contains("is-support-scroll-locked")) return;
  document.body.classList.remove("is-support-scroll-locked");
  document.body.style.top = "";
  window.scrollTo(0, lockedBodyScrollY);
  lockedBodyScrollY = 0;
}

function hasNormativeSupport(question = state.currentQuestion) {
  return Boolean(question?.normativeUpdate?.exists);
}

function hasQuickTheorySupport(question = state.currentQuestion) {
  return Boolean(
    question?.legalStudy?.available && question.legalStudy?.primaryCard,
  );
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
  if (!available && state.supportTab === "appliedTheory") {
    state.supportTab = hasQuickTheorySupport(question)
      ? "quickTheory"
      : "comment";
  }
}

function syncQuickTheoryAvailability(question = state.currentQuestion) {
  const available = hasQuickTheorySupport(question);
  const canReveal = canRevealExplanation(question);
  if (els.openQuickTheory) {
    els.openQuickTheory.hidden = !available;
    els.openQuickTheory.disabled = !available || !canReveal;
    els.openQuickTheory.textContent = available
      ? "Teoria rápida"
      : "Teoria rápida indisponível";
  }
  if (els.supportTabQuickTheory) {
    els.supportTabQuickTheory.hidden = !available;
    els.supportTabQuickTheory.disabled = !available || !canReveal;
  }
  if (!available && state.supportTab === "quickTheory") {
    state.supportTab = canRevealCurrentLawAnswer(question)
      ? "teaching"
      : "comment";
  }
}

function syncNormativeSupportAvailability(question = state.currentQuestion) {
  const available = hasNormativeSupport(question);
  if (els.toggleNormativeSupport) {
    els.toggleNormativeSupport.hidden = !available;
    els.toggleNormativeSupport.disabled =
      !available || !canRevealExplanation(question);
    els.toggleNormativeSupport.textContent = "Atualização normativa";
  }
  if (els.supportTabNormative) {
    els.supportTabNormative.hidden = !available;
    els.supportTabNormative.disabled = !available;
  }
  if (!available && state.supportTab === "normative") {
    state.supportTab = canRevealCurrentLawAnswer(question)
      ? "teaching"
      : "comment";
  }
}

function renderSupportVisibility() {
  syncNormativeSupportAvailability(state.currentQuestion);
  syncAppliedTheoryAvailability(state.currentQuestion);
  syncQuickTheoryAvailability(state.currentQuestion);
  if (
    state.supportTab === "teaching" &&
    !state.currentQuestion?.currentLawAnswer?.exists &&
    !state.currentQuestion?.normativeTeachingComment?.exists &&
    !state.currentQuestion?.normativeUpdate?.exists &&
    !state.currentQuestion?.metadata?.desatualizada
  ) {
    state.supportTab = "comment";
  }
  if (state.supportOpen) {
    lockPageScroll();
  } else {
    unlockPageScroll();
  }
  els.supportOverlay.hidden = !state.supportOpen;
  els.supportDrawer.hidden = !state.supportOpen;
  els.supportTabs.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.supportTab === state.supportTab,
    );
  });
  els.supportTeachingPanel.hidden = state.supportTab !== "teaching";
  if (els.supportAppliedTheoryPanel)
    els.supportAppliedTheoryPanel.hidden = state.supportTab !== "appliedTheory";
  els.supportQuickTheoryPanel.hidden = state.supportTab !== "quickTheory";
  els.commentPanel.hidden = state.supportTab !== "comment";
  els.supportNormativePanel.hidden = state.supportTab !== "normative";
  els.supportTheoryPanel.hidden = state.supportTab !== "theory";
  els.supportHistoryPanel.hidden = state.supportTab !== "history";
  els.supportSimilarPanel.hidden = state.supportTab !== "similar";

  const commentTitle = isContranPrfUnpublishedQuestion(state.currentQuestion)
    ? [
        "Comentário do professor",
        "Gabarito comentado, pegadinha e justificativas",
      ]
    : ["Explicação histórica", "Comentário do professor e gabarito histórico"];
  const titles = {
    teaching: [
      "Comentário atualizado",
      "Regra atual provável e orientação de estudo",
    ],
    quickTheory: ["Teoria rápida", "Regra, artigo e pegadinha de prova"],
    comment: commentTitle,
    normative: ["Atualização normativa", "Análise auxiliar da desatualização"],
    theory: ["Teoria relacionada", "Material em PDF da matéria/assunto"],
    history: ["Histórico da questão", "Tentativas registradas no banco local"],
    similar: ["Questões semelhantes", "Representantes e variações de reforço"],
  };
  const [title, subtitle] = titles[state.supportTab] || titles.comment;
  els.supportTitle.textContent = title;
  els.supportSubtitle.textContent = subtitle;
  if (state.supportTab === "teaching") {
    els.supportTitle.textContent = "Resposta pela legislacao atual";
    els.supportSubtitle.textContent =
      "Gabarito atual, fundamento e conclusao de estudo";
  } else if (state.supportTab === "appliedTheory") {
    els.supportTitle.textContent = "Teoria aplicada";
    els.supportSubtitle.textContent = "Regra que resolve esta questao";
  } else if (
    state.supportTab === "similar" &&
    state.currentQuestion?.adaptive?.clusterPolicy === "stats_only"
  ) {
    els.supportTitle.textContent = "Outras do assunto";
    els.supportSubtitle.textContent =
      "Agrupamento amplo para consulta, sem supressao de variacoes";
  }
  renderSupportResultFlag();
}

// Selo discreto no cabeçalho do modal indicando se o aluno acertou ou errou —
// útil no mobile, onde o modal abre sozinho após responder e o resultado não
// fica visível de imediato. Só aparece para respostas que pontuam.
function renderSupportResultFlag() {
  const flag = els.supportResultFlag;
  if (!flag) return;
  const result = state.answerResult;
  const matchesCurrent =
    result &&
    Number(result.questionId) === Number(state.currentQuestion?.id);
  if (matchesCurrent && result.isCorrect === 1) {
    flag.textContent = "✓ Você acertou";
    flag.dataset.state = "correct";
    flag.hidden = false;
  } else if (matchesCurrent && result.isCorrect === 0) {
    flag.textContent = "✗ Você errou";
    flag.dataset.state = "wrong";
    flag.hidden = false;
  } else {
    flag.hidden = true;
    flag.removeAttribute("data-state");
  }
}

function renderSubjectsVisibility() {
  els.subjectsPanel.hidden = !state.subjectsVisible;
  els.toggleSubjects.textContent = "Ranking de assuntos";
  updateReportViewState();
}

function renderCoverageVisibility() {
  els.coveragePanel.hidden = !state.coverageVisible;
  els.toggleCoverage.textContent = "Base x Prova";
  updateReportViewState();
}

function renderPrincipaisPrfVisibility() {
  if (!els.principaisPrfPanel || !els.togglePrincipaisPrf) return;
  els.principaisPrfPanel.hidden = !state.principaisPrfVisible;
  els.togglePrincipaisPrf.textContent = "Principais PRF";
  updateReportViewState();
}

function renderTheoryCoverageVisibility() {
  if (!els.theoryCoveragePanel || !els.toggleTheoryCoverage) return;
  els.theoryCoveragePanel.hidden = !state.theoryCoverageVisible;
  els.toggleTheoryCoverage.textContent = "Cobertura de teoria";
  updateReportViewState();
}

function renderNormativeVisibility() {
  els.normativePanel.hidden = !state.normativeVisible;
  els.toggleNormative.textContent = "Revisão normativa";
  updateReportViewState();
}

function renderContranMapVisibility() {
  if (!els.contranMapPanel || !els.toggleContranMap) return;
  els.contranMapPanel.hidden = !state.contranMapVisible;
  els.toggleContranMap.textContent = "Mapa CONTRAN PRF 2021";
  updateReportViewState();
}

function renderLawCompendiumVisibility() {
  if (!els.lawCompendiumPanel || !els.toggleLawCompendium) return;
  els.lawCompendiumPanel.hidden = !state.lawCompendiumVisible;
  document.body.classList.toggle(
    "is-law-compendium-view",
    state.lawCompendiumVisible,
  );
  els.toggleLawCompendium.textContent = "Legislação PRF";
  updateReportViewState();
}

function renderGranCursosPlanVisibility() {
  if (!els.granCursosPlanPanel || !els.toggleGranCursosPlan) return;
  els.granCursosPlanPanel.hidden = !state.granCursosPlanVisible;
  els.toggleGranCursosPlan.textContent =
    "Plano de Aulas Gran Cursos - Trânsito PRF";
  updateReportViewState();
}

function updateReportViewState() {
  const hasOpenReport = Boolean(
    state.coverageVisible ||
    state.principaisPrfVisible ||
    state.granCursosPlanVisible ||
    state.theoryCoverageVisible ||
    state.subjectsVisible ||
    state.normativeVisible ||
    state.contranMapVisible ||
    state.lawCompendiumVisible,
  );
  document.body.classList.toggle("is-report-view", hasOpenReport);
  document.body.classList.toggle("is-report-page", hasOpenReport);
  if (hasOpenReport) {
    const active = getActiveReportKey();
    const title = REPORT_ROUTES[active]?.title || "Relatório";
    document.title = `${title} | Estudos PRF`;
  } else {
    document.title = "Estudos PRF";
  }
}

function closeReportPanels() {
  state.coverageVisible = false;
  state.principaisPrfVisible = false;
  state.granCursosPlanVisible = false;
  state.theoryCoverageVisible = false;
  state.subjectsVisible = false;
  state.normativeVisible = false;
  state.contranMapVisible = false;
  state.lawCompendiumVisible = false;
  renderCoverageVisibility();
  renderPrincipaisPrfVisibility();
  renderGranCursosPlanVisibility();
  renderTheoryCoverageVisibility();
  renderSubjectsVisibility();
  renderNormativeVisibility();
  renderContranMapVisibility();
  renderLawCompendiumVisibility();
}

function closeLawCompendiumView() {
  if (!state.lawCompendiumVisible) return;
  state.lawCompendiumVisible = false;
  renderLawCompendiumVisibility();
}

async function openReportPage(reportKey, options = {}) {
  const route = REPORT_ROUTES[reportKey];
  if (!route) return;
  setActiveReport(reportKey);
  const url = buildReportUrl(reportKey, options);
  if (window.history?.pushState) {
    const method = options.replace ? "replaceState" : "pushState";
    window.history[method]({}, "", url);
  }
  if (reportKey === "contranMap") {
    const ref =
      options.contranRef ||
      (options.preserveContranQuery
        ? new URL(window.location.href).searchParams.get("ref")
        : state.contranMapLastQuery);
    if (ref) {
      if (els.contranMapInput) els.contranMapInput.value = ref;
      await searchContranMap(ref, { updateUrl: false });
    } else {
      await loadContranMapList();
    }
    return;
  }
  await route.load?.();
}

function setActiveReport(reportKey) {
  state.coverageVisible = reportKey === "coverage";
  state.principaisPrfVisible = reportKey === "principaisPrf";
  state.granCursosPlanVisible = reportKey === "granCursosPlan";
  state.theoryCoverageVisible = reportKey === "theoryCoverage";
  state.subjectsVisible = reportKey === "subjects";
  state.normativeVisible = reportKey === "normative";
  state.contranMapVisible = reportKey === "contranMap";
  state.lawCompendiumVisible = reportKey === "lawCompendium";
  renderCoverageVisibility();
  renderPrincipaisPrfVisibility();
  renderGranCursosPlanVisibility();
  renderTheoryCoverageVisibility();
  renderSubjectsVisibility();
  renderNormativeVisibility();
  renderContranMapVisibility();
  renderLawCompendiumVisibility();
}

function getActiveReportKey() {
  if (state.coverageVisible) return "coverage";
  if (state.principaisPrfVisible) return "principaisPrf";
  if (state.granCursosPlanVisible) return "granCursosPlan";
  if (state.theoryCoverageVisible) return "theoryCoverage";
  if (state.subjectsVisible) return "subjects";
  if (state.normativeVisible) return "normative";
  if (state.contranMapVisible) return "contranMap";
  if (state.lawCompendiumVisible) return "lawCompendium";
  return "";
}

function buildReportUrl(reportKey, options = {}) {
  const route = REPORT_ROUTES[reportKey];
  const url = new URL(route?.path || "/", window.location.origin);
  if (reportKey === "contranMap") {
    const ref =
      options.contranRef ||
      (options.preserveContranQuery
        ? new URL(window.location.href).searchParams.get("ref")
        : state.contranMapLastQuery);
    if (ref) url.searchParams.set("ref", ref);
  }
  return `${url.pathname}${url.search}`;
}

function getCurrentReportRouteKey() {
  const pathname = window.location.pathname;
  if (
    pathname === "/contran-prf-2021" ||
    pathname === "/legislacao-prf/contran"
  )
    return "contranMap";
  return (
    Object.entries(REPORT_ROUTES).find(
      ([, route]) => route.path === pathname,
    )?.[0] || ""
  );
}

function navigateStudyHome() {
  closeReportPanels();
  if (window.history?.pushState) {
    window.history.pushState({}, "", "/");
  }
}

async function handleReportRouteChange() {
  const reportKey = getCurrentReportRouteKey();
  if (reportKey) {
    await openReportPage(reportKey, {
      replace: true,
      preserveContranQuery: true,
    });
    return;
  }
  closeReportPanels();
}

function isContranMapRoute() {
  return getCurrentReportRouteKey() === "contranMap";
}

function updateContranMapUrl() {
  if (!window.history?.pushState) return;
  if (state.contranMapVisible) {
    const url = new URL(REPORT_ROUTES.contranMap.path, window.location.origin);
    if (state.contranMapLastQuery)
      url.searchParams.set("ref", state.contranMapLastQuery);
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
  } else if (isContranMapRoute()) {
    window.history.pushState({}, "", "/");
  }
}

async function loadPrincipaisPrf() {
  if (!els.principaisPrfInfo || !els.principaisPrfBody) return;
  els.principaisPrfInfo.textContent = "carregando plano";
  els.principaisPrfBody.innerHTML =
    '<p class="empty">Carregando Principais PRF...</p>';
  const data = await api("/api/plano-prf");
  const plan = data.plan || {};
  state.principaisPrfPlan = plan;
  els.principaisPrfInfo.textContent = [
    `${Number(plan.visao_geral?.semanas || 0).toLocaleString("pt-BR")} semanas`,
    `${Number(plan.visao_geral?.horas_por_semana || 0).toLocaleString("pt-BR")}h/semana`,
    `${Number(plan.quadro_semanal_modelo?.length || 0).toLocaleString("pt-BR")} sessões`,
  ].join(" · ");
  els.principaisPrfBody.innerHTML = renderPrincipaisPrfPlan(plan);
}

function renderPrincipaisPrfPlan(plan = {}) {
  const overview = plan.visao_geral || {};
  const distribution = plan.distribuicao_percentual_horas || [];
  const sessions = plan.quadro_semanal_modelo || [];
  const traffic = plan.legislacao_transito_priorizada || [];
  const simulations = plan.simulados || [];
  const checklist = plan.checklist_legislacao_atualizada || [];
  const goals = plan.metas_questoes_por_materia || [];
  const alerts = plan.alertas || [];
  const unpublishedSupplement = plan.material_complementar_contran_prf || null;
  return `
    <section class="principais-prf-alert">
      <strong>Conferência obrigatória</strong>
      <ul>${alerts.map((alert) => `<li>${escapeHtml(alert)}</li>`).join("")}</ul>
    </section>
    <section class="principais-prf-grid">
      ${renderPrincipaisPrfMetric("Semanas", overview.semanas)}
      ${renderPrincipaisPrfMetric("Horas/semana", overview.horas_por_semana)}
      ${renderPrincipaisPrfMetric("Sessões/semana", overview.sessoes_por_semana)}
      ${renderPrincipaisPrfMetric("Revisão", (overview.revisao_espacada || []).join(" · "))}
    </section>
    <section class="principais-prf-section">
      <h2>Distribuição de horas</h2>
      <div class="principais-prf-bars">
        ${distribution.map(renderPrincipaisPrfDistribution).join("")}
      </div>
    </section>
    <section class="principais-prf-section">
      <h2>Quadro semanal</h2>
      <div class="principais-prf-session-grid">
        ${sessions.map(renderPrincipaisPrfSession).join("")}
      </div>
    </section>
    <section class="principais-prf-section">
      <h2>Legislação de Trânsito prioritária</h2>
      <div class="principais-prf-topic-list">
        ${traffic.slice(0, 10).map(renderPrincipaisPrfTrafficTopic).join("")}
      </div>
    </section>
    ${renderPrincipaisPrfUnpublishedSupplement(unpublishedSupplement)}
    <section class="principais-prf-split">
      <div class="principais-prf-section">
        <h2>Simulados</h2>
        <ul class="principais-prf-list">${simulations
          .slice(0, 10)
          .map(
            (item) =>
              `<li><strong>Semana ${Number(item.semana || 0)}:</strong> ${escapeHtml(item.tipo || "")}, ${Number(item.itens || 0)} itens C/E, com relatório por assunto.</li>`,
          )
          .join("")}</ul>
      </div>
      <div class="principais-prf-section">
        <h2>Metas de questões</h2>
        <ul class="principais-prf-list">${goals.map((item) => `<li><strong>${escapeHtml(item.bloco || "")}:</strong> ${Number(item.itens_ce_por_semana || 0)} itens C/E por semana.</li>`).join("")}</ul>
      </div>
    </section>
    <section class="principais-prf-section">
      <h2>Checklist de atualização normativa</h2>
      <ul class="principais-prf-checklist">${checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function renderPrincipaisPrfUnpublishedSupplement(supplement) {
  if (!supplement?.available) return "";
  const axes = supplement.axes || [];
  const policies = supplement.usagePolicy || [];
  return `
    <section class="principais-prf-section principais-prf-unpublished">
      <h2>Questões inéditas PRF/CONTRAN</h2>
      <div class="principais-prf-unpublished-summary">
        <span><strong>${Number(supplement.total || 0).toLocaleString("pt-BR")}</strong> questões inéditas</span>
        <span>${escapeHtml(supplement.badge || "Questão inédita - elaborada para treino PRF/CONTRAN")}</span>
      </div>
      <p>${escapeHtml(supplement.warning || "Não é questão oficial de concurso.")}</p>
      <div class="principais-prf-bars">
        ${axes
          .map((axis) => {
            const total = Number(axis.total || 0);
            const percent = supplement.total
              ? (total / Number(supplement.total)) * 100
              : 0;
            return `
            <article class="principais-prf-bar">
              <div><strong>${escapeHtml(axis.axis || "Sem eixo")}</strong><span>${total.toLocaleString("pt-BR")}</span></div>
              <div class="principais-prf-bar-track"><span style="width: ${Math.max(2, Math.min(100, percent))}%"></span></div>
            </article>
          `;
          })
          .join("")}
      </div>
      <ul class="principais-prf-checklist">${policies.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function renderPrincipaisPrfMetric(label, value) {
  return `
    <span class="metric-card principais-prf-metric">
      <strong>${escapeHtml(String(value ?? ""))}</strong>
      <small>${escapeHtml(label)}</small>
    </span>
  `;
}

function renderPrincipaisPrfDistribution(item = {}) {
  const percent = Number(item.percentual || 0);
  return `
    <article class="principais-prf-bar">
      <div>
        <strong>${escapeHtml(item.label || "")}</strong>
        <span>${percent.toLocaleString("pt-BR")}% · ${Number(item.horas_semana || 0).toLocaleString("pt-BR")}h/semana · ${escapeHtml(item.ajuste_nivel || "")}</span>
      </div>
      <div class="principais-prf-bar-track"><span style="width: ${Math.max(2, Math.min(100, percent))}%"></span></div>
    </article>
  `;
}

function renderPrincipaisPrfSession(session = {}) {
  return `
    <article class="principais-prf-session">
      <header>
        <strong>Dia ${Number(session.dia || 0)} · Sessão ${Number(session.sessao_no_dia || 0)}</strong>
        <span>${Number(session.duracao_horas || 0).toLocaleString("pt-BR")}h · ${Number(session.itens_ce || 0)} itens C/E</span>
      </header>
      <p>${escapeHtml(session.bloco || "")}</p>
      <small>${escapeHtml(session.foco || "")}</small>
    </article>
  `;
}

function renderPrincipaisPrfTrafficTopic(topic = {}) {
  return `
    <article class="principais-prf-topic">
      <header>
        <strong>${escapeHtml(topic.tema || "")}</strong>
        <span>Prioridade ${Number(topic.prioridade || 0)}</span>
      </header>
      <dl>
        <div><dt>Norma cobrada na prova</dt><dd>${escapeHtml(topic.norma_cobrada_na_prova || "")}</dd></div>
        <div><dt>Norma atual de estudo</dt><dd>${escapeHtml(topic.norma_atual_de_estudo || "")}</dd></div>
        <div><dt>Provas</dt><dd>${escapeHtml(contranExamCountLabel(topic.exam_counts || {}))}</dd></div>
        <div><dt>Foco</dt><dd>${escapeHtml(topic.foco || "")}</dd></div>
      </dl>
    </article>
  `;
}

function contranExamCountLabel(counts = {}) {
  return [
    `PRF 2021: ${counts.prf_2021_objetiva || "0"}`,
    `PRF 2019: ${counts.prf_2019_objetiva || "0"}`,
    `PRF 2013: ${counts.prf_2013_objetiva || "0"}`,
  ].join(" · ");
}

async function loadGranCursosPlan() {
  if (!els.granCursosPlanInfo || !els.granCursosPlanBody) return;
  els.granCursosPlanInfo.textContent = "carregando aulas";
  els.granCursosPlanBody.innerHTML =
    '<p class="empty">Carregando plano de aulas Gran Cursos...</p>';
  try {
    const data = await api("/api/gran-cursos-transito-prf/lessons");
    state.granCursosPlan = data;
    renderGranCursosPlan();
  } catch (error) {
    els.granCursosPlanInfo.textContent = "erro ao carregar";
    els.granCursosPlanBody.innerHTML = `<p class="empty">Nao foi possivel carregar o plano: ${escapeHtml(error.message)}</p>`;
  }
}

function renderGranCursosPlan() {
  if (!els.granCursosPlanInfo || !els.granCursosPlanBody) return;
  const data = state.granCursosPlan || {};
  const lessons = sortGranCursosLessonsByRecommendation(data.lessons || []);
  const filteredLessons = filterGranCursosLessons(lessons);
  const summary = data.summary || {};
  els.granCursosPlanInfo.textContent = [
    `${Number(summary.total || lessons.length || 0).toLocaleString("pt-BR")} aulas`,
    `${Number(summary.watched || 0).toLocaleString("pt-BR")} assistidas`,
    `${Number(summary.pending || 0).toLocaleString("pt-BR")} pendentes`,
    formatDurationLong(summary.totalSeconds || 0),
  ].join(" · ");
  els.granCursosPlanBody.innerHTML = `
    ${renderGranCursosSummary(summary, lessons)}
    ${renderGranCursosRecommendedOrder(lessons)}
    ${renderGranCursosFilters(data.filters || {}, filteredLessons.length, lessons.length)}
    ${renderGranCursosActions()}
    ${renderGranCursosTable(filteredLessons)}
  `;
  bindGranCursosPlanControls();
}

function renderGranCursosSummary(summary = {}, lessons = []) {
  const total = Number(summary.total || 0);
  const watched = Number(summary.watched || 0);
  const pending = Number(summary.pending || 0);
  const progress = Number(summary.progressPct || 0);
  const byPriority = summary.byPriority || [];
  const nextLesson =
    lessons.find((lesson) => !lesson.watched) || lessons[0] || null;
  return `
    ${renderGranCursosNextLesson(nextLesson)}
    <section class="gran-plan-summary" aria-label="Resumo do plano">
      <span class="metric-card gran-metric"><strong>${total.toLocaleString("pt-BR")}</strong><small>aulas totais</small></span>
      <span class="metric-card gran-metric"><strong>${watched.toLocaleString("pt-BR")}</strong><small>assistidas</small></span>
      <span class="metric-card gran-metric"><strong>${pending.toLocaleString("pt-BR")}</strong><small>pendentes</small></span>
      <span class="metric-card gran-metric"><strong>${progress.toLocaleString("pt-BR")}%</strong><small>progresso</small></span>
      <span class="metric-card gran-metric"><strong>${formatDurationLong(summary.pendingSeconds || 0)}</strong><small>tempo pendente</small></span>
    </section>
    <section class="gran-plan-section gran-progress-section">
      <header><h2>Prioridade e andamento</h2><span>${formatDurationLong(summary.totalSeconds || 0)} de aula mapeada</span></header>
      <div class="gran-progress-grid">
        ${byPriority.map(renderGranProgressRow).join("")}
      </div>
    </section>
  `;
}

function renderGranCursosNextLesson(lesson) {
  if (!lesson) {
    return `
      <section class="gran-next-card">
        <div>
          <span>Próxima aula recomendada</span>
          <strong>Plano concluído</strong>
          <small>Nenhuma aula pendente na ordem recomendada.</small>
        </div>
      </section>
    `;
  }
  return `
    <section class="gran-next-card">
      <div>
        <span>Próxima aula recomendada</span>
        <strong>#${Number(lesson.recommended_order || 0).toLocaleString("pt-BR")} · Aula Gran ${Number(lesson.lesson_number || 0).toLocaleString("pt-BR")}</strong>
        <small>${escapeHtml(lesson.title || "")}</small>
      </div>
      <div>
        <span class="gran-priority-badge ${priorityClass(lesson.priority)}">${escapeHtml(lesson.priority_label || lesson.priority || "")}</span>
        <span class="gran-incidence-badge ${incidenceClass(lesson.incidence_level)}">${escapeHtml(incidenceLabel(lesson.incidence_level))}</span>
      </div>
    </section>
  `;
}

function renderGranProgressRow(item = {}) {
  const total = Number(item.total || 0);
  const watched = Number(item.watched || 0);
  const percent = Number(item.progressPct || 0);
  return `
    <article class="gran-progress-row">
      <div>
        <strong>${escapeHtml(item.priorityLabel || item.label || item.priority || item.key || "Prioridade")}</strong>
        <span>${watched.toLocaleString("pt-BR")} / ${total.toLocaleString("pt-BR")} assistidas · ${formatDurationLong(item.pendingSeconds || 0)} pendentes</span>
      </div>
      <div class="principais-prf-bar-track"><span style="width: ${Math.max(2, Math.min(100, percent))}%"></span></div>
    </article>
  `;
}

function renderGranCursosRecommendedOrder(lessons = []) {
  const groups = [...lessons]
    .sort(
      (a, b) =>
        Number(a.recommended_order || 0) - Number(b.recommended_order || 0),
    )
    .reduce((acc, lesson) => {
      const cycle = lesson.study_cycle || "Ordem recomendada";
      if (!acc.has(cycle)) acc.set(cycle, []);
      acc.get(cycle).push(lesson);
      return acc;
    }, new Map());
  return `
    <section class="gran-plan-section">
      <header><h2>Ordem recomendada</h2><span>Separada da estatistica real de provas anteriores</span></header>
      <div class="gran-order-grid">
        ${Array.from(groups.entries())
          .map(
            ([cycle, items], index) => `
          <article class="gran-order-card">
            <strong>${String(index + 1).padStart(2, "0")} · ${escapeHtml(cycle)}</strong>
            <span>${items.length.toLocaleString("pt-BR")} aulas · ${formatLessonNumberList(items)}</span>
          </article>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderGranCursosFilters(
  filters = {},
  visibleCount = 0,
  totalCount = 0,
) {
  const current = state.granCursosPlanFilters;
  const priorities = filters.priorities || [];
  const axes = filters.axes || [];
  const themes = filters.themes || [];
  return `
    <section class="gran-filter-panel">
      <div class="gran-filter-head">
        <strong>Filtros</strong>
        <span>${visibleCount.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")} aulas</span>
      </div>
      <div class="gran-quick-filters" aria-label="Filtros rápidos do plano Gran Cursos">
        ${renderGranQuickFilterButton("start", "Começar agora", "Essenciais não assistidas")}
        ${renderGranQuickFilterButton("core", "Núcleo PRF mais cobrado", "Eixos centrais de maior incidência")}
        ${renderGranQuickFilterButton("traps", "Pegadinhas", "Pontos clássicos de confusão")}
        ${renderGranQuickFilterButton("", "Plano completo", "Todas as aulas na ordem recomendada")}
      </div>
      <div class="gran-filter-grid">
        <label class="compact-field">
          <span>Prioridade</span>
          <select data-gran-filter="priority">
            <option value="">Todas</option>
            ${priorities
              .map((item) => {
                const value = item.priority || item.value || "";
                const total = item.total ?? item.count ?? 0;
                return `<option value="${escapeAttr(value)}" ${current.priority === value ? "selected" : ""}>${escapeHtml(item.label || value)} (${Number(total).toLocaleString("pt-BR")})</option>`;
              })
              .join("")}
          </select>
        </label>
        <label class="compact-field">
          <span>Status</span>
          <select data-gran-filter="status">
            <option value="">Todos</option>
            <option value="pending" ${current.status === "pending" ? "selected" : ""}>Pendentes</option>
            <option value="watched" ${current.status === "watched" ? "selected" : ""}>Assistidas</option>
          </select>
        </label>
        <label class="compact-field">
          <span>Eixo</span>
          <select data-gran-filter="axis">
            <option value="">Todos</option>
            ${axes
              .map((item) => {
                const value = item.axis || item.value || "";
                const total = item.total ?? item.count ?? 0;
                return `<option value="${escapeAttr(value)}" ${current.axis === value ? "selected" : ""}>${escapeHtml(value)} (${Number(total).toLocaleString("pt-BR")})</option>`;
              })
              .join("")}
          </select>
        </label>
        <label class="compact-field">
          <span>Tema</span>
          <select data-gran-filter="theme">
            <option value="">Todos</option>
            ${themes
              .map((item) => {
                const value = item.theme || item.value || "";
                const total = item.total ?? item.count ?? 0;
                return `<option value="${escapeAttr(value)}" ${current.theme === value ? "selected" : ""}>${escapeHtml(value)} (${Number(total).toLocaleString("pt-BR")})</option>`;
              })
              .join("")}
          </select>
        </label>
        <label class="compact-field">
          <span>Aula</span>
          <input data-gran-filter="lesson" type="search" value="${escapeAttr(current.lesson)}" placeholder="Ex.: 105">
        </label>
        <label class="compact-field">
          <span>Artigo/ref.</span>
          <input data-gran-filter="reference" type="search" value="${escapeAttr(current.reference)}" placeholder="Ex.: Art. 99">
        </label>
        <label class="compact-field gran-filter-wide">
          <span>Texto livre</span>
          <input data-gran-filter="q" type="search" value="${escapeAttr(current.q)}" placeholder="Titulo, eixo, tema, observacao...">
        </label>
      </div>
    </section>
  `;
}

function renderGranQuickFilterButton(value, label, detail) {
  const active = state.granCursosPlanFilters.quick === value;
  return `
    <button class="gran-quick-filter ${active ? "is-active" : ""} ${value === "start" ? "is-primary" : ""}" type="button" data-gran-quick="${escapeAttr(value)}">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(detail)}</span>
    </button>
  `;
}

function renderGranCursosActions() {
  const current = state.granCursosPlanFilters;
  const hasAxis = Boolean(current.axis);
  const hasPriority = Boolean(baseGranPriority(current.priority));
  return `
    <section class="gran-plan-actions" aria-label="Acoes do plano">
      <button class="button button-secondary" type="button" data-gran-action="clear-filters">Limpar filtros</button>
      <button class="button button-secondary" type="button" data-gran-action="copy-roadmap">Copiar roteiro</button>
      <button class="button button-secondary" type="button" data-gran-action="export-csv">Exportar CSV</button>
      <button class="button" type="button" data-gran-action="mark-axis" ${hasAxis ? "" : "disabled"}>Marcar eixo</button>
      <button class="button button-secondary" type="button" data-gran-action="unmark-axis" ${hasAxis ? "" : "disabled"}>Desmarcar eixo</button>
      <button class="button" type="button" data-gran-action="mark-priority" ${hasPriority ? "" : "disabled"}>Marcar prioridade</button>
      <button class="button button-secondary" type="button" data-gran-action="unmark-priority" ${hasPriority ? "" : "disabled"}>Desmarcar prioridade</button>
      <button class="button button-danger" type="button" data-gran-action="reset">Zerar assistidas</button>
    </section>
  `;
}

function renderGranCursosTable(lessons = []) {
  if (!lessons.length) {
    return '<p class="empty">Nenhuma aula encontrada com os filtros atuais.</p>';
  }
  return `
    <section class="gran-plan-table-wrap" aria-label="Aulas Gran Cursos">
      <table class="gran-plan-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Ordem</th>
            <th>Aula Gran</th>
            <th>Prioridade</th>
            <th>Ciclo</th>
            <th>Eixo e tema</th>
            <th>Titulo</th>
            <th>Duracao</th>
          </tr>
        </thead>
        <tbody>
          ${lessons.map(renderGranCursosLessonRow).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderGranCursosLessonRow(lesson = {}) {
  const watched = Boolean(lesson.watched);
  const priority = lesson.priority || "";
  const reviewNote =
    priority === "REVISAO_RAPIDA"
      ? "Use depois do conteúdo principal ou para fechamento de lacunas."
      : "";
  return `
    <tr class="${watched ? "is-watched" : ""}">
      <td>
        <label class="gran-watch-control">
          <input type="checkbox" data-gran-watch="${Number(lesson.lesson_number)}" ${watched ? "checked" : ""}>
          <span class="gran-status-badge ${watched ? "" : "gran-status-pending"}">${watchedLabel(watched)}</span>
        </label>
      </td>
      <td><strong>#${Number(lesson.recommended_order || 0).toLocaleString("pt-BR")}</strong></td>
      <td><strong>${Number(lesson.lesson_number || 0).toLocaleString("pt-BR")}</strong></td>
      <td>
        <span class="gran-priority-badge ${priorityClass(priority)}">${escapeHtml(lesson.priority_label || priority)}</span>
        <span class="gran-incidence-badge ${incidenceClass(lesson.incidence_level)}">${escapeHtml(incidenceLabel(lesson.incidence_level))}</span>
      </td>
      <td>${escapeHtml(lesson.study_cycle || "")}</td>
      <td>
        <span class="gran-axis-badge">${escapeHtml(lesson.axis || "")}</span>
        <small>${escapeHtml(lesson.theme || "")}</small>
      </td>
      <td>
        <strong>${escapeHtml(lesson.title || "")}</strong>
        <small>${escapeHtml(lesson.incidence_reason || "")}</small>
        ${reviewNote ? `<em>${escapeHtml(reviewNote)}</em>` : ""}
        ${lesson.notes ? `<em>${escapeHtml(lesson.notes)}</em>` : ""}
      </td>
      <td>${escapeHtml(lesson.duration || "sem tempo")}</td>
    </tr>
  `;
}

function bindGranCursosPlanControls() {
  if (!els.granCursosPlanBody) return;
  els.granCursosPlanBody
    .querySelectorAll("[data-gran-filter]")
    .forEach((input) => {
      const applyFilter = () => {
        state.granCursosPlanFilters[input.dataset.granFilter] = input.value;
        renderGranCursosPlan();
      };
      input.addEventListener("change", applyFilter);
      if (input.tagName !== "SELECT") {
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") applyFilter();
        });
      }
    });
  els.granCursosPlanBody
    .querySelectorAll("[data-gran-quick]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        state.granCursosPlanFilters.quick = button.dataset.granQuick;
        renderGranCursosPlan();
      });
    });
  els.granCursosPlanBody
    .querySelectorAll("[data-gran-watch]")
    .forEach((input) => {
      input.addEventListener("change", () => {
        saveGranCursosLessonProgress(
          Number(input.dataset.granWatch),
          input.checked,
        );
      });
    });
  els.granCursosPlanBody
    .querySelectorAll("[data-gran-action]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        handleGranCursosAction(button.dataset.granAction),
      );
    });
}

async function saveGranCursosLessonProgress(lessonNumber, watched) {
  try {
    const data = await api("/api/gran-cursos-transito-prf/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonNumber, watched }),
    });
    state.granCursosPlan = data;
    renderGranCursosPlan();
  } catch (error) {
    alert(`Nao foi possivel salvar o progresso: ${error.message}`);
    await loadGranCursosPlan();
  }
}

async function handleGranCursosAction(action) {
  const current = state.granCursosPlanFilters;
  try {
    if (action === "clear-filters") {
      state.granCursosPlanFilters = {
        quick: "",
        priority: "",
        status: "",
        axis: "",
        theme: "",
        lesson: "",
        reference: "",
        q: "",
      };
      renderGranCursosPlan();
      return;
    }
    if (action === "export-csv") {
      exportGranCursosCsv();
      return;
    }
    if (action === "copy-roadmap") {
      await copyGranCursosRoadmap();
      return;
    }
    if (action === "reset") {
      const confirmed = window.confirm(
        "Confirmar reset do progresso das aulas Gran Cursos? Isso nao altera questoes, gabaritos ou estatisticas.",
      );
      if (!confirmed) return;
      state.granCursosPlan = await api(
        "/api/gran-cursos-transito-prf/progress/reset",
        { method: "POST" },
      );
      renderGranCursosPlan();
      return;
    }
    const watched = action.startsWith("mark-");
    const body = { watched };
    if (action.endsWith("axis")) {
      if (!current.axis) return;
      body.axis = current.axis;
    } else if (action.endsWith("priority")) {
      const priority = baseGranPriority(current.priority);
      if (!priority) return;
      body.priority = priority;
    } else {
      return;
    }
    state.granCursosPlan = await api(
      "/api/gran-cursos-transito-prf/progress/bulk",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    renderGranCursosPlan();
  } catch (error) {
    alert(`Nao foi possivel executar a acao: ${error.message}`);
  }
}

function filterGranCursosLessons(lessons = []) {
  const current = state.granCursosPlanFilters || {};
  const priority = baseGranPriority(current.priority);
  const status = current.status || "";
  const lessonQuery = normalizeAnswerText(current.lesson);
  const referenceQuery = normalizeAnswerText(current.reference);
  const textQuery = normalizeAnswerText(current.q);
  return lessons.filter((lesson) => {
    const lessonNumber = Number(lesson.lesson_number || 0);
    if (
      current.quick === "start" &&
      (lesson.priority !== "ESSENCIAL" || lesson.watched)
    )
      return false;
    if (current.quick === "core" && !GRAN_CORE_LESSON_NUMBERS.has(lessonNumber))
      return false;
    if (
      current.quick === "traps" &&
      !GRAN_TRAP_LESSON_NUMBERS.has(lessonNumber)
    )
      return false;
    if (priority && lesson.priority !== priority) return false;
    if (status === "watched" && !lesson.watched) return false;
    if (status === "pending" && lesson.watched) return false;
    if (current.axis && lesson.axis !== current.axis) return false;
    if (current.theme && lesson.theme !== current.theme) return false;
    if (
      lessonQuery &&
      !String(lesson.lesson_number || "").includes(lessonQuery)
    )
      return false;
    const referenceHaystack = normalizeAnswerText(
      [
        lesson.title,
        lesson.original_title,
        lesson.normalized_title,
        lesson.theme,
      ].join(" "),
    );
    if (referenceQuery && !referenceHaystack.includes(referenceQuery))
      return false;
    const haystack = normalizeAnswerText(
      [
        lesson.lesson_number,
        lesson.title,
        lesson.provider,
        lesson.discipline,
        lesson.professor,
        lesson.priority_label,
        lesson.study_cycle,
        lesson.axis,
        lesson.theme,
        lesson.incidence_reason,
        lesson.notes,
        lesson.source,
      ].join(" "),
    );
    if (textQuery && !haystack.includes(textQuery)) return false;
    return true;
  });
}

function sortGranCursosLessonsByRecommendation(lessons = []) {
  return [...lessons].sort((left, right) => {
    const orderDiff =
      Number(left.recommended_order || 9999) -
      Number(right.recommended_order || 9999);
    if (orderDiff) return orderDiff;
    const weightDiff =
      Number(right.priority_weight || 0) - Number(left.priority_weight || 0);
    if (weightDiff) return weightDiff;
    return Number(left.lesson_number || 0) - Number(right.lesson_number || 0);
  });
}

function exportGranCursosCsv() {
  const lessons = filterGranCursosLessons(
    sortGranCursosLessonsByRecommendation(state.granCursosPlan?.lessons || []),
  );
  const header = [
    "lesson_number",
    "title",
    "provider",
    "discipline",
    "professor",
    "duration",
    "priority",
    "priority_label",
    "priority_weight",
    "incidence_level",
    "study_cycle",
    "axis",
    "theme",
    "recommended_order",
    "watched",
  ];
  const rows = lessons.map((lesson) =>
    header
      .map((key) =>
        csvCell(
          key === "watched"
            ? watchedLabel(Boolean(lesson.watched))
            : lesson[key],
        ),
      )
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plano-aulas-gran-cursos-transito-prf.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyGranCursosRoadmap() {
  const lessons = filterGranCursosLessons(
    sortGranCursosLessonsByRecommendation(state.granCursosPlan?.lessons || []),
  );
  const lines = [
    "Plano de Aulas Gran Cursos - Trânsito PRF",
    "Roteiro em ordem recomendada por incidência",
    "Aviso: A prioridade é por tema/eixo de incidência, não significa que a aula específica tenha caído em prova.",
    "",
    ...lessons.map((lesson) =>
      [
        `#${Number(lesson.recommended_order || 0).toLocaleString("pt-BR")}`,
        `Aula Gran ${Number(lesson.lesson_number || 0).toLocaleString("pt-BR")}`,
        lesson.priority_label || lesson.priority || "",
        incidenceLabel(lesson.incidence_level),
        lesson.axis || "",
        lesson.title || "",
      ]
        .filter(Boolean)
        .join(" | "),
    ),
  ];
  const text = lines.join("\n");
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function watchedLabel(watched) {
  return watched ? "Assistida" : "Pendente";
}

function baseGranPriority(value) {
  return String(value || "").replace(/_.+$/, "");
}

function priorityClass(priority) {
  return (
    {
      ESSENCIAL: "is-essential",
      IMPORTANTE: "is-important",
      REVISAO_RAPIDA: "is-review",
      essential: "is-essential",
      important: "is-important",
      review: "is-review",
    }[priority] || ""
  );
}

function incidenceLabel(level) {
  return (
    {
      ALTISSIMA: "Incidência altíssima",
      ALTA: "Incidência alta",
      MEDIA: "Incidência média",
      BAIXA: "Incidência baixa",
    }[level] || "Incidência não classificada"
  );
}

function incidenceClass(level) {
  return (
    {
      ALTISSIMA: "is-very-high",
      ALTA: "is-high",
      MEDIA: "is-medium",
      BAIXA: "is-low",
    }[level] || ""
  );
}

function formatLessonNumberList(items = []) {
  const numbers = items
    .map((item) => Number(item.lesson_number || 0))
    .filter(Boolean);
  if (numbers.length <= 8) return `Aulas ${numbers.join(", ")}`;
  return `Aulas ${numbers.slice(0, 8).join(", ")}...`;
}

function formatDurationLong(seconds) {
  const total = Number(seconds || 0);
  if (!total) return "tempo indisponivel";
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (!hours) return `${minutes}min`;
  return `${hours}h${String(minutes).padStart(2, "0")}min`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function loadContranMapList() {
  if (!els.contranMapStatus || !els.contranMapResults) return;
  state.contranMapLastQuery = "";
  els.contranMapInfo.textContent = "carregando mapa";
  els.contranMapStatus.textContent =
    "Carregando todos os mapeamentos CONTRAN PRF 2021...";
  els.contranMapResults.innerHTML = "";
  const data = await api("/api/contran-prf-2021/map");
  const rows = data.rows || [];
  state.contranMapRows = rows;
  renderContranCurrentNormList(rows, {
    status: rows.length
      ? "Lista das normas vigentes correspondentes ao edital PRF 2021. Use a busca para localizar uma resolução antiga, norma atual ou tema."
      : data.reason || "Nenhum mapeamento carregado.",
  });
  updateContranMapUrl();
}

async function ensureContranMapRows() {
  if (state.contranMapRows.length) return state.contranMapRows;
  const data = await api("/api/contran-prf-2021/map");
  state.contranMapRows = data.rows || [];
  return state.contranMapRows;
}

function renderContranCurrentNormList(rows, options = {}) {
  const groups = buildContranCurrentNormGroups(rows);
  els.contranMapInfo.textContent = `${groups.length.toLocaleString("pt-BR")} norma${groups.length === 1 ? "" : "s"} vigente${groups.length === 1 ? "" : "s"} · ${rows.length.toLocaleString("pt-BR")} mapeamento${rows.length === 1 ? "" : "s"}`;
  els.contranMapStatus.textContent =
    options.status ||
    (groups.length
      ? "Normas atuais carregadas."
      : "Nenhum mapeamento carregado.");
  els.contranMapResults.innerHTML = groups.length
    ? groups.map(renderContranCurrentNormCard).join("")
    : renderContranNotFoundCard(options.emptyLabel || "a busca informada");
}

async function searchContranMap(query, options = {}) {
  const rawQuery = String(query || "").trim();
  state.contranMapLastQuery = rawQuery;
  if (!rawQuery) {
    await loadContranMapList();
    return;
  }
  els.contranMapInfo.textContent = "filtrando";
  els.contranMapStatus.textContent =
    "Filtrando normas vigentes do mapa CONTRAN PRF 2021...";
  const rows = await ensureContranMapRows();
  const filtered = filterContranMapRows(rows, rawQuery);
  renderContranCurrentNormList(filtered, {
    status: filtered.length
      ? `Resultado para "${rawQuery}".`
      : `Nenhuma norma vigente correspondente encontrada para "${rawQuery}".`,
    emptyLabel: rawQuery,
  });
  if (options.updateUrl !== false) updateContranMapUrl();
}

function buildContranCurrentNormGroups(rows = []) {
  const groups = new Map();
  rows.forEach((item) => {
    const targetRef = formatContranRef(item.targetNumber, item.targetYear);
    const key = `${item.targetOrgan || "CONTRAN"}:${targetRef}`;
    if (!groups.has(key)) {
      groups.set(key, {
        targetOrgan: item.targetOrgan || "CONTRAN",
        targetRef,
        targetTitle: item.targetTitle || "",
        targetOfficialUrl: item.targetOfficialUrl || "",
        relationKinds: new Set(),
        scopes: new Set(),
        notes: new Set(),
        sources: [],
      });
    }
    const group = groups.get(key);
    group.relationKinds.add(contranRelationLabel(item.relation));
    group.scopes.add(contranScopeLabel(item));
    if (item.notes) group.notes.add(item.notes);
    group.sources.push(item);
  });
  return [...groups.values()].sort((a, b) =>
    compareContranRef(a.targetRef, b.targetRef),
  );
}

function renderContranCurrentNormCard(group) {
  const sourceRefs = group.sources
    .map((item) => formatContranRef(item.sourceNumber, item.sourceYear))
    .filter(Boolean);
  const relation = [...group.relationKinds].filter(Boolean).join(", ");
  const scopes = [...group.scopes].filter(Boolean);
  const notes = [...group.notes].filter(Boolean);
  const questionStats = contranGroupQuestionStats(group);
  const examStats = contranGroupExamQuestionStats(group);
  const prf2021Direct = contranExamBucket(
    examStats.directByExam,
    "prf_2021_objetiva",
  );
  const annexLinks = collectContranAnnexLinks(group.sources);
  const exclusionNotices = group.sources
    .map((item) => {
      const notice = contranExcludedNotice(item);
      const ref = formatContranRef(item.sourceNumber, item.sourceYear);
      return notice ? `${ref}: ${notice}` : "";
    })
    .filter(Boolean);
  return `
    <article class="contran-current-card">
      <div class="contran-current-head">
        <div>
          <strong>Resolução CONTRAN ${escapeHtml(group.targetRef)}</strong>
          <span>${escapeHtml(group.targetTitle || "Sem título informado")}</span>
        </div>
        ${group.targetOfficialUrl ? `<a class="button button-secondary" href="${escapeAttr(group.targetOfficialUrl)}" target="_blank" rel="noreferrer">Abrir norma</a>` : ""}
      </div>
      <div class="contran-current-meta">
        <span><strong>${sourceRefs.length}</strong> ${sourceRefs.length === 1 ? "item" : "itens"} do edital</span>
        <span>${escapeHtml(relation || "status não informado")}</span>
        <span><strong>${Number(prf2021Direct.count || 0).toLocaleString("pt-BR")}</strong> PRF 2021 objetiva</span>
        <span><strong>${Number(questionStats.allTrafficQuestions || 0).toLocaleString("pt-BR")}</strong> base inteira</span>
      </div>
      ${annexLinks.length ? renderContranAnnexLinks(annexLinks) : ""}
      ${
        exclusionNotices.length
          ? `
        <div class="contran-scope-warning">
          <strong>Conteúdo excluído pelo edital</strong>
          <span>${escapeHtml(exclusionNotices.join(" "))}</span>
        </div>
      `
          : ""
      }
      <dl class="contran-norm-fields">
        <div><dt>Resoluções do edital PRF 2021</dt><dd>${sourceRefs.map((ref) => `<button class="contran-ref-chip" type="button" data-action="contran-map-search" data-ref="${escapeAttr(ref)}">${escapeHtml(ref)}</button>`).join(" ")}</dd></div>
        <div><dt>Escopo</dt><dd>${escapeHtml(scopes.join("; ") || "texto integral")}</dd></div>
        ${renderContranExamStatsFields(examStats)}
        <div><dt>Base inteira de questões</dt><dd>${escapeHtml(contranQuestionStatsLabel(questionStats))}</dd></div>
        <div><dt>Do que trata</dt><dd>${escapeHtml(group.targetTitle || group.sources[0]?.sourceTitleHint || "Sem descrição cadastrada.")}</dd></div>
        <div><dt>Observações</dt><dd>${escapeHtml(notes.join(" ") || "Sem observações específicas.")}</dd></div>
      </dl>
    </article>
  `;
}

function filterContranMapRows(rows, query) {
  const normalizedQuery = normalizeContranSearchText(query);
  const refs = new Set(detectContranPrf2021References(query));
  return rows.filter((item) => {
    const sourceRef = formatContranRef(item.sourceNumber, item.sourceYear);
    const targetRef = formatContranRef(item.targetNumber, item.targetYear);
    if (refs.has(sourceRef) || refs.has(targetRef)) return true;
    const haystack = normalizeContranSearchText(
      [
        sourceRef,
        targetRef,
        item.targetTitle,
        item.sourceTitleHint,
        item.editalScope,
        item.notes,
        contranRelationLabel(item.relation),
        (item.annexLinks || [])
          .map((link) => `${link.label || ""} ${link.url || ""}`)
          .join(" "),
        normalizeContranAliases(item.sourceAliases).join(" "),
      ].join(" "),
    );
    return haystack.includes(normalizedQuery);
  });
}

function renderContranPrf2021NormCard(item = {}, { mode = "compact" } = {}) {
  const sourceRef = formatContranRef(item.sourceNumber, item.sourceYear);
  const targetRef = formatContranRef(item.targetNumber, item.targetYear);
  const relationLabel = contranRelationLabel(item.relation);
  const scope = contranScopeLabel(item);
  const aliases = normalizeContranAliases(item.sourceAliases);
  const annexLinks = normalizeContranAnnexLinks(item.annexLinks);
  const exclusionNotice = contranExcludedNotice(item);
  const questionStats = contranItemQuestionStats(item);
  const examStats = contranItemExamQuestionStats(item);
  const title =
    item.relation === "permanece_vigente"
      ? "Norma do edital permanece vigente"
      : "Atualização normativa CONTRAN";
  if (mode === "compact") {
    return `
      <article class="contran-norm-card is-compact">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(sourceRef)} → ${escapeHtml(targetRef || "sem alvo")}</span>
        </div>
        <small>${escapeHtml([relationLabel, scope].filter(Boolean).join(" · "))}</small>
        <small>${escapeHtml(contranExamStatsShortLabel(examStats))}</small>
        <small>${escapeHtml(contranQuestionStatsLabel(questionStats))}</small>
        ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
        ${exclusionNotice ? `<p class="contran-scope-warning is-compact">${escapeHtml(exclusionNotice)}</p>` : ""}
      </article>
    `;
  }
  return `
    <article class="contran-norm-card">
      <div class="contran-norm-card-head">
        <div>
          <strong>${escapeHtml(sourceRef)}</strong>
          <span>Norma do edital PRF 2021</span>
        </div>
        <span class="contran-arrow">→</span>
        <div>
          <strong>${escapeHtml(targetRef)}</strong>
          <span>${escapeHtml(item.targetTitle || "Norma CONTRAN vigente correspondente")}</span>
        </div>
      </div>
      <dl class="contran-norm-fields">
        <div><dt>Status</dt><dd>${escapeHtml(relationLabel)}</dd></div>
        <div><dt>Escopo</dt><dd>${escapeHtml(scope || "texto integral")}</dd></div>
        ${renderContranExamStatsFields(examStats)}
        <div><dt>Base inteira de questões</dt><dd>${escapeHtml(contranQuestionStatsLabel(questionStats))}</dd></div>
        <div><dt>Observações</dt><dd>${escapeHtml(item.notes || item.sourceTitleHint || "Sem observações específicas.")}</dd></div>
        <div><dt>Aliases</dt><dd>${escapeHtml(aliases.length ? aliases.join(", ") : "Sem aliases cadastrados.")}</dd></div>
      </dl>
      ${annexLinks.length ? renderContranAnnexLinks(annexLinks) : ""}
      ${
        exclusionNotice
          ? `
        <div class="contran-scope-warning">
          <strong>Conteúdo excluído pelo edital</strong>
          <span>${escapeHtml(exclusionNotice)}</span>
        </div>
      `
          : ""
      }
      ${item.targetOfficialUrl ? `<a class="button button-secondary" href="${escapeAttr(item.targetOfficialUrl)}" target="_blank" rel="noreferrer">Abrir norma oficial</a>` : ""}
    </article>
  `;
}

function renderContranNotFoundCard(ref) {
  return `
    <article class="contran-norm-card is-empty">
      <strong>Mapeamento não encontrado</strong>
      <p>Não há correspondência cadastrada para ${escapeHtml(ref || "a referência informada")} no mapa CONTRAN PRF 2021.</p>
    </article>
  `;
}

function detectContranPrf2021References(text) {
  const value = String(text || "");
  const refs = [];
  const seen = new Set();
  const patterns = [
    /\b(?:resolu[cç][aã]o|res\.?)\s*(?:contran\s*)?(?:n[ºo]\.?\s*)?(\d{1,4}(?:\.\d{3})?)\s*\/\s*(\d{2,4})\b/gi,
    /\bcontran\s*(?:n[ºo]\.?\s*)?(\d{1,4}(?:\.\d{3})?)\s*\/\s*(\d{2,4})\b/gi,
    /\b(\d{1,4}(?:\.\d{3})?)\s*\/\s*(19\d{2}|20\d{2})\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      let year = match[2];
      if (year.length === 2)
        year = Number(year) > 80 ? `19${year}` : `20${year}`;
      const number =
        String(match[1] || "").replace(/^0+(?=\d)/, "") ||
        String(match[1] || "");
      const ref = `${number}/${year}`;
      if (seen.has(ref)) continue;
      seen.add(ref);
      refs.push(ref);
      if (refs.length >= 12) return refs;
    }
  }
  return refs;
}

function formatContranRef(number, year) {
  return number && year ? `${number}/${year}` : "";
}

function compareContranRef(a, b) {
  const parse = (ref) => {
    const [number, year] = String(ref || "").split("/");
    return {
      year: Number(year || 0),
      number: Number(String(number || "").replace(/\./g, "")) || 0,
      raw: String(ref || ""),
    };
  };
  const left = parse(a);
  const right = parse(b);
  return (
    left.year - right.year ||
    left.number - right.number ||
    left.raw.localeCompare(right.raw, "pt-BR")
  );
}

function normalizeContranSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function contranRelationLabel(relation) {
  return (
    {
      permanece_vigente: "permanece vigente",
      substituida_ou_consolidada: "substituída/consolidada",
      substituida_por_cadeia_anual: "substituída por cadeia anual",
    }[relation] ||
    relation ||
    "status não informado"
  );
}

function contranScopeLabel(item = {}) {
  if (item.editalScope && item.editalScope !== "texto integral")
    return item.editalScope;
  const policy = item.scopePolicy || {};
  if (policy.exclude_annexes_from_original_edital) return "exceto anexos";
  if (policy.exclude_fichas_from_original_edital) return "exceto fichas";
  if (policy.include_only_current_equivalent)
    return policy.include_only_current_equivalent;
  return item.editalScope || "texto integral";
}

function normalizeContranAliases(aliases) {
  if (!Array.isArray(aliases)) return [];
  return aliases
    .map((alias) => {
      if (typeof alias === "string") return alias;
      return formatContranRef(
        alias.number || alias.old_number || alias.source_number,
        alias.year || alias.old_year || alias.source_year,
      );
    })
    .filter(Boolean);
}

const CONTRAN_EXAM_KEYS = [
  "prf_2021_objetiva",
  "prf_2019_objetiva",
  "prf_2013_objetiva",
];
const CONTRAN_EXAM_LABELS = {
  prf_2021_objetiva: "Prova objetiva PRF 2021",
  prf_2019_objetiva: "Prova objetiva PRF 2019",
  prf_2013_objetiva: "Prova objetiva PRF 2013",
};

function emptyContranExamBucket() {
  return { count: 0, items: [], normsAtExam: [] };
}

function emptyContranExamStats() {
  const directByExam = {};
  const linkedByExam = {};
  const topicEquivalentByExam = {};
  CONTRAN_EXAM_KEYS.forEach((key) => {
    directByExam[key] = emptyContranExamBucket();
    linkedByExam[key] = emptyContranExamBucket();
    topicEquivalentByExam[key] = emptyContranExamBucket();
  });
  return {
    topicIds: [],
    topicLabels: [],
    currentNormReferences: [],
    directByExam,
    linkedByExam,
    topicEquivalentByExam,
  };
}

function contranItemExamQuestionStats(item = {}) {
  return mergeContranExamStats([item.examQuestionStats]);
}

function contranGroupExamQuestionStats(group = {}) {
  return mergeContranExamStats(
    (group.sources || []).map((item) => item.examQuestionStats),
  );
}

function mergeContranExamStats(statsItems = []) {
  const itemSets = {
    directByExam: Object.fromEntries(
      CONTRAN_EXAM_KEYS.map((key) => [key, new Set()]),
    ),
    linkedByExam: Object.fromEntries(
      CONTRAN_EXAM_KEYS.map((key) => [key, new Set()]),
    ),
    topicEquivalentByExam: Object.fromEntries(
      CONTRAN_EXAM_KEYS.map((key) => [key, new Set()]),
    ),
  };
  const countFallbacks = {
    directByExam: Object.fromEntries(CONTRAN_EXAM_KEYS.map((key) => [key, 0])),
    linkedByExam: Object.fromEntries(CONTRAN_EXAM_KEYS.map((key) => [key, 0])),
    topicEquivalentByExam: Object.fromEntries(
      CONTRAN_EXAM_KEYS.map((key) => [key, 0]),
    ),
  };
  const normSets = Object.fromEntries(
    CONTRAN_EXAM_KEYS.map((key) => [key, new Set()]),
  );
  const topicIds = new Set();
  const topicLabels = new Set();
  const currentNormReferences = new Set();

  statsItems.filter(Boolean).forEach((stats) => {
    if (stats.topicId) topicIds.add(stats.topicId);
    if (stats.topicLabel) topicLabels.add(stats.topicLabel);
    if (stats.currentNormReference)
      currentNormReferences.add(stats.currentNormReference);
    ["directByExam", "linkedByExam", "topicEquivalentByExam"].forEach(
      (field) => {
        CONTRAN_EXAM_KEYS.forEach((examKey) => {
          const bucket = contranExamBucket(stats[field], examKey);
          if (bucket.items.length) {
            bucket.items.forEach((item) => itemSets[field][examKey].add(item));
          } else {
            countFallbacks[field][examKey] += Number(bucket.count || 0);
          }
          if (field === "topicEquivalentByExam") {
            (bucket.normsAtExam || []).forEach((norm) =>
              normSets[examKey].add(norm),
            );
          }
        });
      },
    );
  });

  const merged = emptyContranExamStats();
  merged.topicIds = [...topicIds];
  merged.topicLabels = [...topicLabels];
  merged.currentNormReferences = [...currentNormReferences];
  ["directByExam", "linkedByExam", "topicEquivalentByExam"].forEach((field) => {
    CONTRAN_EXAM_KEYS.forEach((examKey) => {
      const items = [...itemSets[field][examKey]].sort((a, b) => a - b);
      merged[field][examKey] = {
        count: items.length || countFallbacks[field][examKey],
        items,
        normsAtExam:
          field === "topicEquivalentByExam" ? [...normSets[examKey]] : [],
      };
    });
  });
  return merged;
}

function contranExamBucket(source = {}, examKey) {
  const bucket = source?.[examKey] || {};
  const items = Array.isArray(bucket.items)
    ? [
        ...new Set(
          bucket.items
            .map(Number)
            .filter((item) => Number.isFinite(item) && item > 0),
        ),
      ].sort((a, b) => a - b)
    : [];
  return {
    count: Number.isFinite(Number(bucket.count))
      ? Number(bucket.count)
      : items.length,
    items,
    normsAtExam: Array.isArray(bucket.normsAtExam)
      ? bucket.normsAtExam.filter(Boolean)
      : [],
  };
}

function renderContranExamStatsFields(stats = {}) {
  return CONTRAN_EXAM_KEYS.filter((examKey) => {
    const direct = contranExamBucket(stats.directByExam, examKey);
    const equivalent = contranExamBucket(stats.topicEquivalentByExam, examKey);
    return (
      examKey === "prf_2021_objetiva" ||
      direct.count > 0 ||
      equivalent.count > 0
    );
  })
    .map((examKey) => {
      const direct = contranExamBucket(stats.directByExam, examKey);
      const equivalent = contranExamBucket(
        stats.topicEquivalentByExam,
        examKey,
      );
      return `<div><dt>${escapeHtml(CONTRAN_EXAM_LABELS[examKey] || examKey)}</dt><dd>${escapeHtml(contranExamStatsDetailedLabel(direct, equivalent))}</dd></div>`;
    })
    .join("");
}

function contranExamStatsDetailedLabel(direct, equivalent) {
  const parts = [contranExamBucketLabel(direct, "direta")];
  if (
    equivalent.count > 0 &&
    !sameNumberArray(direct.items, equivalent.items)
  ) {
    const normLabel = equivalent.normsAtExam?.length
      ? `; norma da época: ${equivalent.normsAtExam.join(", ")}`
      : "";
    parts.push(
      `tema equivalente: ${contranExamBucketLabel(equivalent, "por tema equivalente")}${normLabel}`,
    );
  }
  return parts.join(" · ");
}

function contranExamStatsShortLabel(stats = {}) {
  const direct2021 = contranExamBucket(stats.directByExam, "prf_2021_objetiva");
  return `PRF 2021 objetiva: ${contranExamBucketLabel(direct2021, "direta")}`;
}

function contranExamBucketLabel(bucket = {}, kind = "direta") {
  const count = Number(bucket.count || 0);
  const noun = count === 1 ? "questão" : "questões";
  const kindLabel =
    kind === "direta" ? (count === 1 ? "direta" : "diretas") : kind;
  const itemLabel = bucket.items?.length
    ? ` - itens ${bucket.items.join(", ")}`
    : "";
  return `${count.toLocaleString("pt-BR")} ${noun} ${kindLabel}${itemLabel}`;
}

function sameNumberArray(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => Number(item) === Number(right[index]));
}

function emptyContranQuestionStats() {
  return {
    allTrafficQuestions: 0,
    prfQuestions: 0,
    prf2021Questions: 0,
    linkedCards: 0,
  };
}

function mergeContranQuestionStatsByMax(items = []) {
  return items.reduce(
    (merged, item) => ({
      allTrafficQuestions: Math.max(
        merged.allTrafficQuestions,
        Number(item?.allTrafficQuestions || 0),
      ),
      prfQuestions: Math.max(
        merged.prfQuestions,
        Number(item?.prfQuestions || 0),
      ),
      prf2021Questions: Math.max(
        merged.prf2021Questions,
        Number(item?.prf2021Questions || 0),
      ),
      linkedCards: Math.max(merged.linkedCards, Number(item?.linkedCards || 0)),
    }),
    emptyContranQuestionStats(),
  );
}

function contranItemQuestionStats(item = {}) {
  return mergeContranQuestionStatsByMax([
    item.targetQuestionStats,
    item.sourceQuestionStats,
  ]);
}

function contranGroupQuestionStats(group = {}) {
  return mergeContranQuestionStatsByMax(
    (group.sources || []).flatMap((item) => [
      item.targetQuestionStats,
      item.sourceQuestionStats,
    ]),
  );
}

function contranQuestionStatsLabel(stats = {}) {
  const prf = Number(stats.prfQuestions || 0);
  const allTraffic = Number(stats.allTrafficQuestions || 0);
  const parts = [
    `${allTraffic.toLocaleString("pt-BR")} ${allTraffic === 1 ? "questão" : "questões"} na base inteira de trânsito`,
  ];
  if (prf > 0) {
    parts.push(
      `${prf.toLocaleString("pt-BR")} ${prf === 1 ? "questão" : "questões"} PRF na base ampla`,
    );
  }
  return parts.join(" · ");
}

function normalizeContranAnnexLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => {
      if (typeof link === "string")
        return { label: "Anexo oficial", url: link };
      return {
        label: String(link?.label || "Anexo oficial").trim(),
        url: String(link?.url || "").trim(),
      };
    })
    .filter((link) => link.url);
}

function collectContranAnnexLinks(items = []) {
  const seen = new Set();
  const links = [];
  items.forEach((item) => {
    normalizeContranAnnexLinks(item.annexLinks).forEach((link) => {
      const key = `${link.label}|${link.url}`;
      if (seen.has(key)) return;
      seen.add(key);
      links.push(link);
    });
  });
  return links;
}

function renderContranAnnexLinks(links = []) {
  const normalized = normalizeContranAnnexLinks(links);
  if (!normalized.length) return "";
  return `
    <div class="contran-annex-links">
      <span>Anexos oficiais</span>
      <div>
        ${normalized.map((link) => `<a class="contran-annex-link" href="${escapeAttr(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`).join("")}
      </div>
    </div>
  `;
}

function contranExcludedNotice(item = {}) {
  if (item.excludedContentNotice) return item.excludedContentNotice;
  const policy = item.scopePolicy || {};
  const parts = [];
  if (item.annexesExcluded || policy.exclude_annexes_from_original_edital)
    parts.push("anexos excluídos pelo edital PRF 2021");
  if (item.fichasExcluded || policy.exclude_fichas_from_original_edital)
    parts.push("fichas excluídas pelo edital PRF 2021");
  if (!parts.length) return "";
  const equivalent = policy.include_only_current_equivalent
    ? ` Recorte aplicável: ${policy.include_only_current_equivalent}.`
    : "";
  return `${parts.join(" e ")}. Não use esse conteúdo excluído para o item original do edital.${equivalent}`;
}

function renderPager() {
  const absoluteIndex = state.rows.length
    ? (state.page - 1) * PAGE_SIZE + state.rowIndex + 1
    : 0;
  els.pageLabel.textContent = `${absoluteIndex} / ${state.total}`;
  els.prevPage.disabled = absoluteIndex <= 1;
  els.nextPage.disabled = absoluteIndex >= state.total;
}

function statMarkup(value, label) {
  const displayValue =
    typeof value === "number"
      ? value.toLocaleString("pt-BR")
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
  els.studyTimeTodayMeta.textContent = `${todayAttempts.toLocaleString("pt-BR")} tentativa${todayAttempts === 1 ? "" : "s"} hoje`;
  els.studyTimeTotalMeta.textContent = [
    `${timedAttempts.toLocaleString("pt-BR")} tentativa${timedAttempts === 1 ? "" : "s"}`,
    cappedAttempts
      ? `${cappedAttempts.toLocaleString("pt-BR")} ajustada${cappedAttempts === 1 ? "" : "s"}`
      : "",
    maxAttemptMinutes ? `teto ${maxAttemptMinutes}min` : "",
  ]
    .filter(Boolean)
    .join(" - ");
  setStudyTimeTab(state.studyTimeTab);
}

function getLiveStudyTimeMs() {
  if (!state.selectedId || state.answerResult || !state.questionTimerRunning)
    return 0;
  const elapsedMs = getQuestionElapsedMs();
  return Math.max(0, elapsedMs);
}

function setStudyTimeTab(tab) {
  state.studyTimeTab = tab === "total" ? "total" : "today";
  const isTotal = state.studyTimeTab === "total";
  els.studyTimeTodayTab?.classList.toggle("is-active", !isTotal);
  els.studyTimeTotalTab?.classList.toggle("is-active", isTotal);
  els.studyTimeTodayTab?.setAttribute("aria-selected", String(!isTotal));
  els.studyTimeTotalTab?.setAttribute("aria-selected", String(isTotal));
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
  return (
    {
      review_soon: "revisar em breve",
      repair_now: "reparar agora",
      advance: "avancar",
      mastered: "dominada",
    }[value] || "registrada"
  );
}

function masteryLabel(score) {
  if (score >= 85) return "Dominado";
  if (score >= 65) return "Bom";
  if (score >= 40) return "Em consolidação";
  if (score > 0) return "Frágil";
  return "Novo";
}

/**
 * O Postgres serializa timestamptz como "2026-06-18 15:55:04.797687+00":
 * espaço no lugar do T e fuso sem os minutos, que o Date() rejeita.
 * O SQLite grava "2026-06-18 15:55:04", sem fuso.
 */
function parseDbDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const text = raw.replace(" ", "T");
  // Sem hora não há fuso: "2026-06-18" terminaria em "-18" e viraria fuso.
  const normalized = text.includes("T")
    ? text.replace(/([+-]\d{2})$/, "$1:00").replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isReviewDue(value) {
  const date = parseDbDate(value);
  return Boolean(date) && date.getTime() <= Date.now();
}

function confidenceLabel(value) {
  return (
    {
      sure: "certeza",
      doubt: "duvida",
      guess: "chute",
    }[value] || value
  );
}

function errorTypeLabel(value) {
  return (
    {
      content: "conteudo",
      interpretation: "interpretacao",
      confusion: "confusao",
      memory: "decoreba",
      outdated: "desatualizada",
      misclick: "clique errado",
      other: "outro",
    }[value] || value
  );
}

function normalizeAnswer(value) {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  if (text.includes("CERTO")) return "CERTO";
  if (text.includes("ERRADO")) return "ERRADO";
  const letter = text.match(/\b[A-E]\b/);
  return letter ? letter[0] : text;
}

function cssEscape(value) {
  return window.CSS?.escape
    ? window.CSS.escape(String(value))
    : String(value).replace(/["\\]/g, "\\$&");
}

function formatDate(value) {
  const date = parseDbDate(value);
  if (!date) {
    return "sem data";
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatFullDate(value) {
  const date = parseDbDate(value);
  if (!date) {
    return "sem data";
  }
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildSessionId() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `${stamp}-study`;
}

function subjectRowMarkup(row, index) {
  const answered = Number(row.answered || 0);
  const total = Number(row.total || 0);
  const answeredPct = total ? Math.round((answered / total) * 100) : 0;
  const details = [
    `${total.toLocaleString("pt-BR")} questoes`,
    `${Number(row.comments || 0).toLocaleString("pt-BR")} comentarios historicos`,
    Number(row.ai_comments || 0)
      ? `${Number(row.ai_comments).toLocaleString("pt-BR")} comentarios IA`
      : "",
    Number(row.outdated || 0)
      ? `${Number(row.outdated).toLocaleString("pt-BR")} desatualizadas`
      : "",
    Number(row.canceled || 0)
      ? `${Number(row.canceled).toLocaleString("pt-BR")} anuladas`
      : "",
    `${answeredPct}% resolvidas`,
  ]
    .filter(Boolean)
    .join(" - ");

  return `
    <button
      class="subject-row"
      type="button"
      data-materia="${escapeAttr(row.materia || "")}"
      data-assunto="${escapeAttr(row.assunto || "")}"
    >
      <span class="subject-rank">${index + 1}</span>
      <span class="subject-main">
        <strong>${escapeHtml(row.assunto || "Sem assunto")}</strong>
        <small>${escapeHtml(row.materia || "")}</small>
      </span>
      <span class="subject-details">${escapeHtml(details)}</span>
    </button>
  `;
}

function strategicRowMarkup(row, index) {
  const details = [
    `peso ${Number(row.expected_pct || 0).toLocaleString("pt-BR")}%`,
    `${Number(row.valid_questions || 0).toLocaleString("pt-BR")} validas`,
    `${Number(row.valid_with_answer || 0).toLocaleString("pt-BR")} com gabarito`,
    `dominio ${Math.round(Number(row.mastery_score || 0) * 100)}%`,
    row.status || "",
  ]
    .filter(Boolean)
    .join(" - ");

  return `
    <div class="subject-row is-static">
      <span class="subject-rank">${index + 1}</span>
      <span class="subject-main">
        <strong>${escapeHtml(row.subject_label || row.subject_key || "")}</strong>
        <small>${escapeHtml(row.subject_key || "")}</small>
      </span>
      <span class="subject-details">${escapeHtml(details)}</span>
    </div>
  `;
}

function coverageRowMarkup(row) {
  return `
    <div class="coverage-row status-${escapeAttr(row.status || "ok")}">
      <span class="coverage-main">
        <strong>${escapeHtml(row.subject_label || row.subject_key || "")}</strong>
        <small>${escapeHtml(row.status || "ok")}</small>
      </span>
      <span>${Number(row.expected_pct || 0).toLocaleString("pt-BR")}%</span>
      <span>${Number(row.expected_items || 0).toLocaleString("pt-BR")}</span>
      <span>${Number(row.local_questions || 0).toLocaleString("pt-BR")}</span>
      <span>${Number(row.valid_questions || 0).toLocaleString("pt-BR")}</span>
      <span>${Number(row.valid_with_answer || 0).toLocaleString("pt-BR")}</span>
      <span>${Math.round(Number(row.mastery_score || 0) * 100)}%</span>
      <span>${Number(row.due_reviews || 0).toLocaleString("pt-BR")}</span>
    </div>
  `;
}

function coverageHeaderMarkup() {
  const columns = [
    [
      "Disciplina",
      "Matéria ou bloco do perfil de prova. A linha também mostra o status estratégico.",
    ],
    ["Peso", "Percentual esperado dessa disciplina no perfil selecionado."],
    ["Itens", "Quantidade estimada de itens da disciplina na prova."],
    ["Base", "Total de questões mapeadas no banco para essa disciplina."],
    [
      "Válidas",
      "Questões aproveitáveis para estudo, sem anuladas nem desatualizadas.",
    ],
    [
      "Com gabarito",
      "Questões válidas que possuem gabarito utilizável pelo sistema.",
    ],
    [
      "Domínio",
      "Média de domínio calculada pelas suas tentativas nessa disciplina.",
    ],
    [
      "Revisão",
      "Quantidade de questões dessa disciplina vencidas para revisar hoje.",
    ],
  ];
  return `
    <div class="coverage-row coverage-header" role="row">
      ${columns
        .map(
          ([label, description]) => `
        <span title="${escapeAttr(description)}">
          <strong>${escapeHtml(label)}</strong>
        </span>
      `,
        )
        .join("")}
    </div>
  `;
}

function coverageLegendMarkup() {
  const items = [
    ["Peso", "percentual esperado no perfil."],
    ["Itens", "quantidade estimada na prova."],
    ["Base", "questões mapeadas no banco."],
    ["Válidas", "questões aproveitáveis para estudo."],
    ["Com gabarito", "questões válidas com resposta utilizável."],
    ["Domínio", "média do seu desempenho."],
    ["Revisão", "questões vencidas para revisar hoje."],
  ];
  return legendMarkup(items);
}

function theoryCoverageRowMarkup(row) {
  const total = Number(row.total || 0);
  const covered = Number(row.covered || 0);
  const pct = total ? Math.round((covered / total) * 100) : 0;
  const status =
    pct >= 70
      ? "ok"
      : pct >= 30
        ? "sub-representada"
        : "sem_gabarito_suficiente";
  return `
    <div class="coverage-row theory-coverage-row status-${escapeAttr(status)}">
      <span class="coverage-main">
        <strong>${escapeHtml(row.assunto || "Sem assunto")}</strong>
        <small>${escapeHtml(row.materia || "")}</small>
      </span>
      <span>${covered.toLocaleString("pt-BR")}</span>
      <span>${total.toLocaleString("pt-BR")}</span>
      <span>${Math.max(0, total - covered).toLocaleString("pt-BR")}</span>
      <span>${pct}%</span>
      <span>${Number(row.wrongAttempts || 0).toLocaleString("pt-BR")}</span>
      <span></span>
      <span></span>
    </div>
  `;
}

function theoryCoverageHeaderMarkup() {
  const columns = [
    ["Assunto", "Matéria e assunto analisados na camada de teoria."],
    [
      "Cobertas",
      "Questões do assunto com teoria rápida específica ou apoio validado.",
    ],
    ["Total", "Total de questões consideradas nesse assunto."],
    ["Lacunas", "Questões ainda sem apoio teórico específico."],
    ["Cobertura", "Percentual de questões do assunto com apoio teórico."],
    ["Erros", "Tentativas erradas registradas nesse assunto."],
  ];
  return `
    <div class="coverage-row coverage-header theory-coverage-header" role="row">
      ${columns
        .map(
          ([label, description]) => `
        <span title="${escapeAttr(description)}">
          <strong>${escapeHtml(label)}</strong>
        </span>
      `,
        )
        .join("")}
      <span></span>
      <span></span>
    </div>
  `;
}

function theoryCoverageLegendMarkup() {
  const items = [
    ["Cobertas", "questões com apoio teórico específico."],
    ["Total", "questões analisadas no assunto."],
    ["Lacunas", "questões sem teoria específica."],
    ["Cobertura", "percentual coberto."],
    ["Erros", "erros já registrados no assunto."],
  ];
  return legendMarkup(items);
}

function normativeRowMarkup(row) {
  const tone = normativeRowTone(row);
  const questionId = resolveQuestionId(row);
  const href = questionId ? questionLink(questionId) : "#";
  const details = [
    row.banca || "",
    row.ano || "",
    row.tipo || "",
    row.mudancaGabarito ? `mudança: ${row.mudancaGabarito}` : "",
    row.teachingExists
      ? `comentário: ${row.teachingReviewStatus || "pendente"}`
      : "sem comentário atualizado",
    row.reviewStatus ? `status: ${reviewStatusLabel(row.reviewStatus)}` : "",
  ]
    .filter(Boolean)
    .join(" - ");

  return `
    <div class="normative-row ${tone}">
      <span class="normative-row-main">
        <strong>#${Number(row.questionId || 0).toLocaleString("pt-BR")} - ${escapeHtml(row.assunto || "Sem assunto")}</strong>
        <small>${escapeHtml(row.materia || "")}</small>
        <small>${escapeHtml(row.statementPreview || "")}</small>
      </span>
      <span>${escapeHtml(row.gabaritoBanco || "-")}</span>
      <span>${escapeHtml(row.teachingCurrentAnswer || row.gabaritoAtualizadoProvavel || "-")}</span>
      <span>${escapeHtml(row.teachingStudyRecommendation ? teachingRecommendationLabel(row.teachingStudyRecommendation) : row.recomendacao || "-")}</span>
      <span>${escapeHtml(row.teachingSafetyLevel ? safetyLabel(row.teachingSafetyLevel) : row.nivelSeguranca || "-")}</span>
      <span>${escapeHtml(details)}</span>
      ${
        questionId
          ? `<a class="button button-secondary" href="${escapeAttr(href)}" data-question-id="${escapeAttr(questionId)}">Abrir</a>`
          : '<span class="empty">ID indisponivel</span>'
      }
    </div>
  `;
}

function normativeHeaderMarkup() {
  const columns = [
    ["Questão", "ID, assunto, matéria e prévia do enunciado."],
    ["Histórico", "Gabarito original ou histórico do banco."],
    ["Atual", "Gabarito atualizado provável ou confirmado."],
    ["Recomendação", "Como a questão deve ser usada no estudo atual."],
    ["Segurança", "Nível de segurança da análise normativa."],
    [
      "Detalhes",
      "Banca, ano, tipo, mudança de gabarito, comentário e status de revisão.",
    ],
    ["Ação", "Abre a questão para conferência."],
  ];
  return `
    <div class="normative-row normative-header" role="row">
      ${columns
        .map(
          ([label, description]) => `
        <span title="${escapeAttr(description)}">
          <strong>${escapeHtml(label)}</strong>
        </span>
      `,
        )
        .join("")}
    </div>
  `;
}

function normativeLegendMarkup() {
  const items = [
    ["Histórico", "gabarito original do banco."],
    ["Atual", "gabarito pela legislação vigente quando houver segurança."],
    ["Recomendação", "orienta estudar, revisar manualmente ou descartar."],
    ["Segurança", "confiabilidade da análise."],
    ["Detalhes", "metadados e status de revisão."],
  ];
  return legendMarkup(items);
}

function legendMarkup(items) {
  return `
    <div class="coverage-legend">
      ${items.map(([label, description]) => `<span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(description)}</span>`).join("")}
    </div>
  `;
}

function normativeRowTone(row) {
  const status = normalizeAnswerText(row.teachingStatus);
  const recommendation = normalizeAnswerText(
    row.teachingStudyRecommendation || row.recomendacao,
  );
  const security = normalizeAnswerText(
    row.teachingSafetyLevel || row.nivelSeguranca,
  );
  const changed = normalizeAnswerText(row.mudancaGabarito);
  if (
    status === "discard" ||
    recommendation.includes("discard") ||
    recommendation.includes("descartar")
  )
    return "is-danger";
  if (
    status === "needs_manual_review" ||
    recommendation.includes("manual") ||
    security === "baixo" ||
    security === "low"
  )
    return "is-warning";
  if (row.teachingAnswerChanged || changed.startsWith("sim"))
    return "is-changed";
  return "is-ok";
}

function reviewStatusLabel(value) {
  return (
    {
      pending: "pendente",
      approved: "aprovada",
      rejected: "rejeitada",
      manual_review: "revisão manual",
      needs_research: "pesquisar",
      adapted: "adaptada",
      discarded: "descartada",
    }[value] ||
    value ||
    "pendente"
  );
}

function answerPolicyLabel(value) {
  return (
    {
      current_law_probable: "regra atual provável",
      not_assertive_manual_review: "revisão manual",
      discard_original: "descartar",
      current_safe: "regra atual segura",
      current_with_adaptation: "regra atual com adaptação",
      historical_only: "somente histórico",
      manual_review: "revisão manual",
      discard: "descartar",
      do_not_autocorrect: "não autocorrigir",
    }[value] ||
    value ||
    "não informado"
  );
}

function adaptationStatusLabel(value) {
  return (
    {
      manual_review_required: "revisão manual",
      adapted_statement_needed: "adaptar enunciado",
      outdated_but_materially_same: "materialmente semelhante",
      no_adaptation_needed: "sem adaptação",
      adapt_statement: "adaptar enunciado",
      adapt_legal_reference: "adaptar fundamento",
      adapt_alternatives: "adaptar alternativas",
      manual_review: "revisão manual",
      discard: "descartar",
      needs_review: "revisar",
    }[value] ||
    value ||
    "não informado"
  );
}

function teachingRecommendationLabel(value) {
  if (value && value.length > 40) return value;
  return (
    {
      study_current_rule: "estudar pela regra atual",
      study_with_warning: "estudar com alerta",
      manual_review: "revisão manual",
      discard: "descartar",
    }[value] ||
    value ||
    "não informado"
  );
}

function teachingStatusLabel(value) {
  return (
    {
      ready: "pronto",
      needs_manual_review: "revisão manual",
      discard: "descartar",
    }[value] ||
    value ||
    "não informado"
  );
}

function articleExactnessLabel(value) {
  return (
    {
      exact: "artigo exato",
      topic_safe: "tema seguro",
      topic_only: "somente fundamento geral",
      manual: "revisão manual",
    }[value] ||
    value ||
    "não informado"
  );
}

function currentAnswerLabel(value) {
  const answer = String(value || "").trim();
  if (!answer) return "não definido com segurança";
  if (answer === "CERTO" || answer === "ERRADO") return answer;
  if (/^[A-E]$/.test(answer)) return `alternativa ${answer}`;
  return answer;
}

function safetyLabel(value) {
  return (
    {
      high: "alta",
      medium: "média",
      low: "baixa",
      manual: "manual",
    }[value] ||
    value ||
    "não informado"
  );
}

function normalizeAnswerText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function markdownLiteToHtml(markdown) {
  const lines = String(markdown || "")
    .replace(/\r/g, "")
    .split("\n");
  const chunks = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    chunks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    chunks.push(
      `<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`,
    );
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
    paragraph.push(trimmed.replace(/^#{1,4}\s+/, ""));
  }

  flushParagraph();
  flushList();
  return chunks.join("");
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

async function api(url, options) {
  const isStatsGet = url === "/api/stats" && !options;
  if (isStatsGet && inflightStats.promise) {
    return inflightStats.promise;
  }
  if (isStatsGet) {
    inflightStats.promise = fetchJson(url, options).finally(() => {
      inflightStats.promise = null;
    });
    return inflightStats.promise;
  }
  return fetchJson(url, options);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = "";
    try {
      const text = await response.text();
      detail = text ? `: ${text.slice(0, 300)}` : "";
    } catch {
      detail = "";
    }
    throw new Error(`HTTP ${response.status}${detail}`);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

/* ============================================================
   Simulado Cebraspe — módulo autocontido (1ª onda do roadmap)
   Prova completa sem feedback, com branco, confiança obrigatória,
   cronômetro e relatório pós-prova (política de chute + fadiga).
   ============================================================ */
(function examSimulationModule() {
  const STORAGE_KEY = "examSim.active";
  let sim = null; // { id, questionIds, index, endsAt, size }
  let itemStartedAt = 0;
  let selectedAnswer = null; // 'CERTO' | 'ERRADO' | letra | 'BRANCO'
  let selectedConfidence = null;
  let timerHandle = null;

  const button = document.getElementById("examSimButton");
  if (button) {
    button.addEventListener("click", openLauncher);
  }

  function overlay() {
    let el = document.getElementById("examSimOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "examSimOverlay";
      el.className = "exam-sim-overlay";
      document.body.appendChild(el);
    }
    el.hidden = false;
    return el;
  }

  function closeOverlay() {
    const el = document.getElementById("examSimOverlay");
    if (el) el.hidden = true;
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function saveState() {
    if (sim) localStorage.setItem(STORAGE_KEY, JSON.stringify(sim));
    else localStorage.removeItem(STORAGE_KEY);
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function openLauncher() {
    const pending = loadState();
    const resumeHtml = pending
      ? `<button class="button button-secondary" data-action="resume">Retomar simulado em andamento (item ${pending.index + 1}/${pending.questionIds.length})</button>`
      : "";
    overlay().innerHTML = `
      <div class="exam-sim-card">
        <h2>Simulado Cebraspe</h2>
        <p>Prova no formato real: certo/errado, sem feedback durante a prova,
           opção de deixar em branco (errar desconta 1 ponto) e relatório final
           com a sua melhor política de marcação.</p>
        <div class="exam-sim-launch-options">
          <button class="button button-primary" data-size="120">Prova completa — 120 itens / 4h</button>
          <button class="button button-secondary" data-size="60">Meia prova — 60 itens / 2h</button>
          <button class="button button-secondary" data-size="30">Treino rápido — 30 itens / 1h</button>
          ${resumeHtml}
        </div>
        <button class="button button-ghost exam-sim-close" data-action="close">Cancelar</button>
      </div>`;
    overlay().onclick = async (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.action === "close") return closeOverlay();
      if (target.dataset.action === "resume") return resumeSimulation(pending);
      if (target.dataset.size) return startSimulation(Number(target.dataset.size));
    };
  }

  async function startSimulation(size) {
    overlay().innerHTML = `<div class="exam-sim-card"><p>Montando a prova (${size} itens)…</p></div>`;
    try {
      const data = await api("/api/exam-simulations/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ size }),
      });
      if (data.error) throw new Error(data.error);
      const durationMs = size * 2 * 60 * 1000; // ritmo Cebraspe: 2 min/item
      sim = {
        id: data.id,
        questionIds: data.questionIds,
        index: 0,
        endsAt: Date.now() + durationMs,
        size: data.totalItems,
      };
      saveState();
      renderItem();
    } catch (error) {
      overlay().innerHTML = `<div class="exam-sim-card"><p>Erro ao iniciar: ${escapeHtml(error.message)}</p>
        <button class="button button-secondary" onclick="document.getElementById('examSimOverlay').hidden=true">Fechar</button></div>`;
    }
  }

  async function resumeSimulation(pending) {
    try {
      const state = await api(`/api/exam-simulations/${pending.id}`);
      if (state.error || state.finished) {
        localStorage.removeItem(STORAGE_KEY);
        return openLauncher();
      }
      sim = pending;
      const answered = new Set(
        (state.items || [])
          .filter((item) => item.answer_letter !== null && item.answer_letter !== undefined)
          .map((item) => item.question_id)
      );
      const nextIndex = sim.questionIds.findIndex((id) => !answered.has(id));
      sim.index = nextIndex === -1 ? sim.questionIds.length : nextIndex;
      saveState();
      if (sim.index >= sim.questionIds.length) return finishSimulation();
      renderItem();
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      openLauncher();
    }
  }

  function startTimer() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      const el = document.getElementById("examSimTimer");
      if (!el || !sim) return;
      const remaining = sim.endsAt - Date.now();
      if (remaining <= 0) {
        clearInterval(timerHandle);
        timerHandle = null;
        finishSimulation();
        return;
      }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      el.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      el.classList.toggle("exam-sim-timer-warning", remaining < 15 * 60 * 1000);
    }, 1000);
  }

  async function renderItem() {
    if (!sim) return;
    if (sim.index >= sim.questionIds.length) return finishSimulation();
    selectedAnswer = null;
    selectedConfidence = null;
    const questionId = sim.questionIds[sim.index];
    overlay().innerHTML = `<div class="exam-sim-card"><p>Carregando item ${sim.index + 1}…</p></div>`;
    let question;
    try {
      question = await api(`/api/questions/${questionId}`);
    } catch (error) {
      overlay().innerHTML = `<div class="exam-sim-card"><p>Erro ao carregar a questão ${questionId}: ${escapeHtml(error.message)}</p>
        <div class="exam-sim-actions"><button class="button button-secondary" data-action="skip">Pular item</button></div></div>`;
      overlay().onclick = (event) => {
        if (event.target.closest("[data-action='skip']")) {
          sim.index += 1;
          saveState();
          renderItem();
        }
      };
      return;
    }

    const meta = question.metadata || {};
    const alternatives = question.alternatives || [];
    const isCertoErrado = alternatives.length === 2
      && alternatives.some((alt) => /certo/i.test(alt.text || ""))
      && alternatives.some((alt) => /errado/i.test(alt.text || ""));
    const answerButtons = isCertoErrado
      ? `<button class="exam-sim-answer" data-answer="CERTO">CERTO</button>
         <button class="exam-sim-answer" data-answer="ERRADO">ERRADO</button>`
      : alternatives
          .map((alt) => `<button class="exam-sim-answer exam-sim-answer-letter" data-answer="${escapeAttr(alt.letter)}">
              <strong>${escapeHtml(alt.letter)}</strong> ${escapeHtml((alt.text || "").slice(0, 220))}
            </button>`)
          .join("");

    overlay().innerHTML = `
      <div class="exam-sim-card exam-sim-question">
        <div class="exam-sim-header">
          <span class="exam-sim-progress">Item ${sim.index + 1} / ${sim.questionIds.length}</span>
          <span class="exam-sim-timer" id="examSimTimer">--:--:--</span>
          <button class="button button-ghost exam-sim-abandon" data-action="abandon" title="Encerra e corrige o que foi feito">Encerrar prova</button>
        </div>
        <div class="exam-sim-meta">${escapeHtml(meta.materia || "")}</div>
        <div class="exam-sim-statement">${question.statementHtml || escapeHtml(question.statementText || "")}</div>
        <div class="exam-sim-answers">${answerButtons}
          <button class="exam-sim-answer exam-sim-blank" data-answer="BRANCO">DEIXAR EM BRANCO</button>
        </div>
        <div class="exam-sim-confidence" id="examSimConfidence" hidden>
          <span>Confiança:</span>
          <button data-confidence="sure">Certeza</button>
          <button data-confidence="doubt">Dúvida</button>
          <button data-confidence="guess">Chute</button>
        </div>
        <div class="exam-sim-actions">
          <button class="button button-primary" id="examSimConfirm" disabled>Confirmar e avançar</button>
        </div>
      </div>`;
    itemStartedAt = Date.now();
    startTimer();

    overlay().onclick = (event) => {
      const answerButton = event.target.closest(".exam-sim-answer");
      const confidenceButton = event.target.closest("[data-confidence]");
      const confirmButton = event.target.closest("#examSimConfirm");
      const abandonButton = event.target.closest("[data-action='abandon']");
      if (abandonButton) {
        if (confirm("Encerrar a prova agora e corrigir o que foi feito?")) finishSimulation();
        return;
      }
      if (answerButton) {
        selectedAnswer = answerButton.dataset.answer;
        overlay().querySelectorAll(".exam-sim-answer").forEach((el) => el.classList.toggle("selected", el === answerButton));
        const confidenceRow = document.getElementById("examSimConfidence");
        const isBlank = selectedAnswer === "BRANCO";
        confidenceRow.hidden = isBlank;
        if (isBlank) selectedConfidence = null;
        updateConfirmState();
      }
      if (confidenceButton) {
        selectedConfidence = confidenceButton.dataset.confidence;
        overlay().querySelectorAll("[data-confidence]").forEach((el) => el.classList.toggle("selected", el === confidenceButton));
        updateConfirmState();
      }
      if (confirmButton && !confirmButton.disabled) submitItem(question, isCertoErrado);
    };
  }

  function updateConfirmState() {
    const confirmButton = document.getElementById("examSimConfirm");
    if (!confirmButton) return;
    const ready = selectedAnswer === "BRANCO" || (selectedAnswer && selectedConfidence);
    confirmButton.disabled = !ready;
  }

  async function submitItem(question, isCertoErrado) {
    const questionId = sim.questionIds[sim.index];
    const blank = selectedAnswer === "BRANCO";
    let answer = selectedAnswer;
    if (!blank && isCertoErrado) {
      const target = (question.alternatives || []).find((alt) =>
        selectedAnswer === "CERTO" ? /certo/i.test(alt.text || "") : /errado/i.test(alt.text || "")
      );
      answer = target ? target.letter : selectedAnswer;
    }
    try {
      await api(`/api/exam-simulations/${sim.id}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId,
          blank,
          answer: blank ? "" : answer,
          confidence: blank ? "" : selectedConfidence,
          elapsedMs: Date.now() - itemStartedAt,
        }),
      });
    } catch (error) {
      alert(`Erro ao salvar o item: ${error.message}`);
      return;
    }
    sim.index += 1;
    saveState();
    renderItem();
  }

  async function finishSimulation() {
    if (!sim) return;
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
    overlay().innerHTML = `<div class="exam-sim-card"><p>Corrigindo a prova…</p></div>`;
    let report;
    try {
      report = await api(`/api/exam-simulations/${sim.id}/finish`, { method: "POST" });
    } catch (error) {
      overlay().innerHTML = `<div class="exam-sim-card"><p>Erro na correção: ${escapeHtml(error.message)}</p></div>`;
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    sim = null;
    renderReport(report);
  }

  function renderReport(report) {
    const cutoffs = report.cutoffs || { block1: 15, block2: 10, block3: 10, total: 50 };
    const blockRow = (label, score, cutoff) => {
      const ok = Number(score) >= cutoff;
      return `<tr class="${ok ? "ok" : "fail"}"><td>${label}</td><td>${score}</td><td>${cutoff}</td><td>${ok ? "✔" : "✘"}</td></tr>`;
    };
    const policies = (report.markingPolicies || [])
      .map((policy, index) => `<li class="${index === 0 ? "best" : ""}">${escapeHtml(policy.label)}: <strong>${policy.score} pts</strong>${index === 0 ? " ← melhor" : ""}</li>`)
      .join("");
    const fatigue = (report.fatigue || [])
      .map((quarter) => {
        const answered = Number(quarter.answered || 0);
        const accuracy = answered - Number(quarter.blank || 0) > 0
          ? Math.round((Number(quarter.correct || 0) / (answered - Number(quarter.blank || 0))) * 100)
          : null;
        return `<tr><td>${quarter.quarter}º quarto</td><td>${quarter.score}</td><td>${accuracy === null ? "—" : `${accuracy}%`}</td><td>${Math.round(Number(quarter.avg_elapsed_ms || 0) / 1000)}s</td></tr>`;
      })
      .join("");
    const dangerous = (report.dangerousSubjects || [])
      .slice(0, 5)
      .map((subject) => `<li>${escapeHtml(subject.subject_label || subject.subject_key)} (${subject.wrong_count} erros, saldo ${subject.score})</li>`)
      .join("");
    const gap = report.reference2021?.gapToLastCall;
    const projected = report.reference2021?.projectedScale;

    overlay().innerHTML = `
      <div class="exam-sim-card exam-sim-report">
        <h2>Resultado do simulado</h2>
        <p class="exam-sim-score ${report.passedCutoffs ? "ok" : "fail"}">
          ${report.scoreTotal} pontos — ${report.passedCutoffs ? "passaria nos cortes ✔" : "não passaria nos cortes ✘"}
        </p>
        <p>${report.correctCount} certas · ${report.wrongCount} erradas · ${report.blankCount} em branco
        ${projected !== null && projected !== undefined ? ` · projeção em escala 120 itens: <strong>${projected}</strong> (último aprovado 2021: 73, gap ${gap >= 0 ? "+" : ""}${gap})` : ""}</p>
        <h3>Blocos</h3>
        <table class="exam-sim-table">
          <tr><th>Bloco</th><th>Pontos</th><th>Corte</th><th></th></tr>
          ${blockRow("Bloco 1", report.scoreBlock1, cutoffs.block1)}
          ${blockRow("Bloco 2", report.scoreBlock2, cutoffs.block2)}
          ${blockRow("Bloco 3", report.scoreBlock3, cutoffs.block3)}
          ${blockRow("Total", report.scoreTotal, cutoffs.total)}
        </table>
        <h3>Política de marcação (contrafactual)</h3>
        <ul class="exam-sim-policies">${policies}</ul>
        <h3>Fadiga ao longo da prova</h3>
        <table class="exam-sim-table">
          <tr><th>Trecho</th><th>Saldo</th><th>Acerto</th><th>Tempo médio</th></tr>
          ${fatigue}
        </table>
        ${dangerous ? `<h3>Assuntos que mais tiraram pontos</h3><ul>${dangerous}</ul>` : ""}
        <div class="exam-sim-actions">
          <button class="button button-primary" data-action="close">Fechar</button>
        </div>
      </div>`;
    overlay().onclick = (event) => {
      if (event.target.closest("[data-action='close']")) closeOverlay();
    };
  }
})();

/* ============================================================
   Otimizador de pontos + Calibração Cebraspe (1ª onda)
   Reusa o overlay/estilos do simulado.
   ============================================================ */
(function studyInsightsModule() {
  const optimizerButton = document.getElementById("pointsOptimizerButton");
  const calibrationButton = document.getElementById("calibrationReportButton");
  if (optimizerButton) optimizerButton.addEventListener("click", showOptimizer);
  if (calibrationButton) calibrationButton.addEventListener("click", showCalibration);

  function insightsOverlay(html) {
    let el = document.getElementById("examSimOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "examSimOverlay";
      el.className = "exam-sim-overlay";
      document.body.appendChild(el);
    }
    el.hidden = false;
    el.innerHTML = html;
    el.onclick = (event) => {
      if (event.target.closest("[data-action='close']")) el.hidden = true;
    };
    return el;
  }

  const closeButtonHtml = `<div class="exam-sim-actions"><button class="button button-primary" data-action="close">Fechar</button></div>`;

  async function showOptimizer() {
    insightsOverlay(`<div class="exam-sim-card"><p>Calculando onde cada hora vale mais pontos…</p></div>`);
    let data;
    try {
      data = await api("/api/points-optimizer");
    } catch (error) {
      insightsOverlay(`<div class="exam-sim-card"><p>Erro: ${escapeHtml(error.message)}</p>${closeButtonHtml}</div>`);
      return;
    }
    const gap = data.reference2021?.gapToLastCall ?? 0;
    const rows = (data.subjects || [])
      .map((subject) => `
        <tr>
          <td>${escapeHtml(subject.subjectLabel)}${subject.lowData ? ' <span title="Menos de 10 respostas — estimativa incerta">⚠</span>' : ""}</td>
          <td>${subject.expectedItems}</td>
          <td>${Math.round(subject.accuracy * 100)}%</td>
          <td>${subject.expectedPoints}</td>
          <td><strong>${subject.potentialGain}</strong></td>
          <td>${subject.markingAdvice === "marcar" ? "marcar" : subject.markingAdvice === "em_branco" ? "em branco" : "neutro"}</td>
        </tr>`)
      .join("");
    insightsOverlay(`
      <div class="exam-sim-card exam-sim-report">
        <h2>Onde ganhar pontos</h2>
        <p class="exam-sim-score ${gap >= 0 ? "ok" : "fail"}">
          Nota projetada: ${data.projectedScore} pts
          <small>(último aprovado 2021: 73 · gap ${gap >= 0 ? "+" : ""}${gap})</small>
        </p>
        <p>Ordenado por <strong>ganho potencial</strong>: pontos extras disponíveis se o assunto chegar a 95% de acerto.
           Estude de cima para baixo — é onde cada hora compra mais pontos.</p>
        <table class="exam-sim-table" style="max-width:100%">
          <tr><th>Assunto</th><th>Itens na prova</th><th>Acerto</th><th>Pts projetados</th><th>Ganho potencial</th><th>Na prova</th></tr>
          ${rows}
        </table>
        ${closeButtonHtml}
      </div>`);
  }

  async function showCalibration() {
    insightsOverlay(`<div class="exam-sim-card"><p>Analisando sua calibração…</p></div>`);
    let data;
    try {
      data = await api("/api/cebraspe-risk-report");
    } catch (error) {
      insightsOverlay(`<div class="exam-sim-card"><p>Erro: ${escapeHtml(error.message)}</p>${closeButtonHtml}</div>`);
      return;
    }
    const labels = { sure: "Certeza", doubt: "Dúvida", guess: "Chute" };
    const calibrationRows = (data.calibration || [])
      .map((row) => {
        const overconfident = row.gap !== null && row.gap < -0.05;
        return `<tr class="${overconfident ? "fail" : "ok"}">
          <td>${labels[row.confidence] || row.confidence}</td>
          <td>${Math.round(row.claimedProbability * 100)}%</td>
          <td>${row.actualAccuracy === null ? "—" : `${Math.round(row.actualAccuracy * 100)}%`}</td>
          <td>${row.gap === null ? "—" : `${row.gap > 0 ? "+" : ""}${Math.round(row.gap * 100)} pp`}</td>
          <td>${row.sampleSize}</td>
        </tr>`;
      })
      .join("");
    const policySections = Object.entries(data.markingPolicy || {})
      .map(([materia, rows]) => {
        const items = rows
          .map((row) => `<li>${labels[row.confidence] || row.confidence}: ${Math.round(row.accuracy * 100)}% de acerto →
            <strong>${row.advice === "marcar" ? "marque" : row.advice === "em_branco" ? "deixe em branco" : "zona neutra"}</strong>
            <small>(n=${row.sampleSize})</small></li>`)
          .join("");
        return `<h4>${escapeHtml(materia)}</h4><ul>${items}</ul>`;
      })
      .join("");
    insightsOverlay(`
      <div class="exam-sim-card exam-sim-report">
        <h2>Calibração Cebraspe</h2>
        <p>Numa prova que desconta 1 ponto por erro, saber <em>quando confiar em si</em> vale pontos.
           Linhas vermelhas = excesso de confiança (acerto real abaixo do declarado).</p>
        <table class="exam-sim-table">
          <tr><th>Confiança</th><th>Declarado</th><th>Real</th><th>Gap</th><th>Amostra</th></tr>
          ${calibrationRows}
        </table>
        <h3>Política de marcação por matéria</h3>
        ${policySections || "<p>Ainda não há amostra suficiente por matéria (mínimo 3 respostas por nível).</p>"}
        ${closeButtonHtml}
      </div>`);
  }
})();

/* ============================================================
   Flashcards cloze de lei seca (FSRS) — 2ª onda
   ============================================================ */
(function lawClozeModule() {
  const button = document.getElementById("lawClozeButton");
  if (!button) return;
  button.addEventListener("click", showNext);

  function clozeOverlay(html) {
    let el = document.getElementById("examSimOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "examSimOverlay";
      el.className = "exam-sim-overlay";
      document.body.appendChild(el);
    }
    el.hidden = false;
    el.innerHTML = html;
    return el;
  }

  async function showNext() {
    clozeOverlay(`<div class="exam-sim-card"><p>Buscando o próximo card…</p></div>`);
    let data;
    try {
      data = await api("/api/law-cloze/next");
    } catch (error) {
      clozeOverlay(`<div class="exam-sim-card"><p>Erro: ${escapeHtml(error.message)}</p>
        <div class="exam-sim-actions"><button class="button button-primary" data-action="close">Fechar</button></div></div>`)
        .onclick = closeHandler;
      return;
    }
    if (!data.available) {
      clozeOverlay(`<div class="exam-sim-card"><h2>Flashcards de memorização</h2>
        <p>${escapeHtml(data.reason || "Nenhum card disponível agora. Tudo revisado — volte quando houver revisões vencidas.")}</p>
        <div class="exam-sim-actions"><button class="button button-primary" data-action="close">Fechar</button></div></div>`)
        .onclick = closeHandler;
      return;
    }

    const card = data.card;
    const el = clozeOverlay(`
      <div class="exam-sim-card law-cloze-card">
        <div class="exam-sim-header">
          <span class="exam-sim-progress">${data.dueCount} vencidos · ${data.newCount} novos${data.isNew ? " · CARD NOVO" : ""}</span>
          <button class="button button-ghost" data-action="close">Sair</button>
        </div>
        <div class="exam-sim-meta">${escapeHtml(card.sourceLabel)} ${escapeHtml(card.ref || "")} · ${escapeHtml(card.hint || card.category)}</div>
        <div class="exam-sim-statement law-cloze-text">${escapeHtml(card.clozeText)}</div>
        <div class="exam-sim-actions" id="lawClozeReveal">
          <button class="button button-primary" data-action="reveal">Mostrar resposta</button>
        </div>
        <div id="lawClozeAnswerBlock" hidden>
          <p class="law-cloze-answer">Resposta: <strong>${escapeHtml(card.answer)}</strong></p>
          <div class="exam-sim-actions law-cloze-ratings">
            <button class="button button-secondary" data-rating="again">Errei</button>
            <button class="button button-secondary" data-rating="hard">Difícil</button>
            <button class="button button-primary" data-rating="good">Bom</button>
            <button class="button button-secondary" data-rating="easy">Fácil</button>
          </div>
          <div class="exam-sim-actions" style="justify-content:center;margin-top:8px">
            <button class="button button-ghost" data-action="theory">📖 Ver regra completa</button>
          </div>
          <div id="lawClozeTheory" class="law-cloze-theory" hidden></div>
        </div>
      </div>`);

    el.onclick = async (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.action === "close") return closeHandler(event);
      if (target.dataset.action === "reveal") {
        document.getElementById("lawClozeReveal").hidden = true;
        document.getElementById("lawClozeAnswerBlock").hidden = false;
        return;
      }
      if (target.dataset.action === "theory") {
        const box = document.getElementById("lawClozeTheory");
        box.hidden = false;
        box.innerHTML = "Buscando…";
        try {
          const theory = await api(`/api/law-cloze/${card.id}/theory`);
          if (theory.type === "law") {
            const siblings = (theory.siblings || [])
              .map((item) => `<p><strong>${escapeHtml(item.ref || "")}</strong> ${escapeHtml(item.text)}</p>`)
              .join("");
            box.innerHTML = `
              <h4>${escapeHtml(theory.sourceLabel)} ${escapeHtml(theory.ref || "")}</h4>
              ${theory.articleText ? `<p><strong>${escapeHtml(theory.articleText)}</strong></p>` : ""}
              ${siblings || `<p>${escapeHtml(theory.sectionText || "")}</p>`}`;
          } else if (theory.type === "grammar") {
            box.innerHTML = theory.pdf
              ? `<p><a href="${escapeAttr(theory.pdf.url)}" target="_blank" rel="noopener">📄 ${escapeHtml(theory.pdf.title)}</a> — abre na página da regra.</p>
                 ${theory.pdf.excerpt ? `<p><em>${escapeHtml(theory.pdf.excerpt)}</em></p>` : ""}`
              : `<p>Tópico: <strong>${escapeHtml(theory.topic || "")}</strong>. ${escapeHtml(theory.note || "")}</p>`;
          } else {
            box.innerHTML = "Teoria não disponível para este card.";
          }
        } catch (error) {
          box.innerHTML = `Erro: ${escapeHtml(error.message)}`;
        }
        return;
      }
      if (target.dataset.rating) {
        try {
          const result = await api(`/api/law-cloze/${card.id}/answer`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ rating: target.dataset.rating }),
          });
          document.dispatchEvent(new CustomEvent("study:progress"));
          if (result.intervalDays) {
            target.textContent = `+${result.intervalDays}d`;
            setTimeout(showNext, 350);
            return;
          }
        } catch (error) {
          alert(`Erro ao salvar: ${error.message}`);
        }
        showNext();
      }
    };
  }

  function closeHandler(event) {
    if (event.target.closest("[data-action='close']")) {
      const el = document.getElementById("examSimOverlay");
      if (el) el.hidden = true;
    }
  }
})();

/* ============================================================
   IA pós-erro: diagnóstico + tutor socrático (3ª onda)
   Intercepta respostas erradas e oferece ajuda de IA num toast.
   ============================================================ */
(function aiPostErrorModule() {
  let aiOn = false;
  fetch("/api/ai/status").then((response) => response.json())
    .then((data) => { aiOn = Boolean(data.available); })
    .catch(() => {});

  const ANSWER_RE = /^\/api\/questions\/(\d+)\/answer$/;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    try {
      const urlPath = new URL(typeof input === "string" ? input : input.url, location.origin).pathname;
      const match = urlPath.match(ANSWER_RE);
      if (aiOn && match && (init?.method || "GET").toUpperCase() === "POST" && response.ok) {
        const clone = response.clone();
        clone.json().then((data) => {
          if (data && data.isCorrect === 0) showErrorToast(Number(match[1]));
        }).catch(() => {});
      }
    } catch {}
    return response;
  };

  function showErrorToast(questionId) {
    dismissToast();
    const toast = document.createElement("div");
    toast.id = "aiErrorToast";
    toast.className = "ai-error-toast";
    toast.innerHTML = `
      <span>Errou? A IA pode ajudar:</span>
      <button type="button" data-ai="diagnose">Diagnóstico</button>
      <button type="button" data-ai="tutor">Tutor socrático</button>
      <button type="button" data-ai="dismiss" aria-label="Fechar">×</button>`;
    document.body.appendChild(toast);
    toast.onclick = (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.ai === "dismiss") return dismissToast();
      if (button.dataset.ai === "diagnose") { dismissToast(); showDiagnosis(questionId); }
      if (button.dataset.ai === "tutor") { dismissToast(); openTutor(questionId); }
    };
    setTimeout(dismissToast, 20000);
  }

  function dismissToast() {
    const el = document.getElementById("aiErrorToast");
    if (el) el.remove();
  }

  function aiOverlay(html) {
    let el = document.getElementById("examSimOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "examSimOverlay";
      el.className = "exam-sim-overlay";
      document.body.appendChild(el);
    }
    el.hidden = false;
    el.innerHTML = html;
    return el;
  }

  const errorTypeLabels = {
    content: "Conteúdo (não sabia a regra)",
    interpretation: "Interpretação do enunciado",
    confusion: "Confusão entre conceitos",
    memory: "Memória (sabia, mas esqueceu)",
    outdated: "Lei desatualizada",
    attention: "Atenção / leitura apressada",
    other: "Outro",
  };

  async function showDiagnosis(questionId) {
    const el = aiOverlay(`<div class="exam-sim-card"><p>Analisando seu erro…</p></div>`);
    let data;
    try {
      data = await api(`/api/questions/${questionId}/diagnose-error`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    } catch (error) {
      data = { error: error.message };
    }
    if (data.error || !data.available) {
      aiOverlay(`<div class="exam-sim-card"><p>${escapeHtml(data.error || data.reason || "Diagnóstico indisponível.")}</p>
        <div class="exam-sim-actions"><button class="button button-primary" data-action="close">Fechar</button></div></div>`);
    } else {
      aiOverlay(`
        <div class="exam-sim-card">
          <h2>Diagnóstico do erro</h2>
          <p><strong>Tipo:</strong> ${escapeHtml(errorTypeLabels[data.errorType] || data.errorType)}</p>
          ${data.trapPattern ? `<p><strong>Padrão de pegadinha:</strong> ${escapeHtml(data.trapPattern)}</p>` : ""}
          <p>${escapeHtml(data.explanation || "")}</p>
          <p><small>Gerado por IA (${escapeHtml(data.provider || "")}) — confira sempre com o comentário do professor.</small></p>
          <div class="exam-sim-actions">
            <button class="button button-secondary" data-ai-tutor="${questionId}">Abrir tutor socrático</button>
            <button class="button button-primary" data-action="close">Fechar</button>
          </div>
        </div>`);
    }
    document.getElementById("examSimOverlay").onclick = (event) => {
      if (event.target.closest("[data-action='close']")) document.getElementById("examSimOverlay").hidden = true;
      const tutorButton = event.target.closest("[data-ai-tutor]");
      if (tutorButton) openTutor(Number(tutorButton.dataset.aiTutor));
    };
  }

  function openTutor(questionId) {
    const messages = [];
    renderTutor(questionId, messages, true);
  }

  async function renderTutor(questionId, messages, requestReply) {
    const historyHtml = messages
      .map((message) => `<div class="tutor-msg tutor-${message.role}">${escapeHtml(message.text)}</div>`)
      .join("");
    const el = aiOverlay(`
      <div class="exam-sim-card tutor-card">
        <div class="exam-sim-header">
          <h2>Tutor socrático</h2>
          <button class="button button-ghost" data-action="close">Sair</button>
        </div>
        <div class="tutor-history" id="tutorHistory">${historyHtml}${requestReply ? '<div class="tutor-msg tutor-assistant tutor-typing">pensando…</div>' : ""}</div>
        <div class="tutor-input-row">
          <input type="text" id="tutorInput" placeholder="Responda à pergunta do tutor…" ${requestReply ? "disabled" : ""} />
          <button class="button button-primary" id="tutorSend" ${requestReply ? "disabled" : ""}>Enviar</button>
        </div>
      </div>`);
    el.onclick = (event) => {
      if (event.target.closest("[data-action='close']")) el.hidden = true;
      if (event.target.closest("#tutorSend")) sendUserMessage();
    };
    const input = document.getElementById("tutorInput");
    if (input) {
      input.onkeydown = (event) => { if (event.key === "Enter") sendUserMessage(); };
      if (!requestReply) input.focus();
    }
    const history = document.getElementById("tutorHistory");
    if (history) history.scrollTop = history.scrollHeight;

    function sendUserMessage() {
      const value = String(document.getElementById("tutorInput")?.value || "").trim();
      if (!value) return;
      messages.push({ role: "user", text: value });
      renderTutor(questionId, messages, true);
    }

    if (requestReply) {
      try {
        const data = await api(`/api/questions/${questionId}/tutor`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages }),
        });
        messages.push({ role: "assistant", text: data.reply || data.error || data.reason || "Sem resposta." });
      } catch (error) {
        messages.push({ role: "assistant", text: `Erro: ${error.message}` });
      }
      renderTutor(questionId, messages, false);
    }
  }
})();

/* ============================================================
   Discursiva + Modo reta final (4ª onda)
   ============================================================ */
(function essayAndStretchModule() {
  const essayButton = document.getElementById("essayButton");
  const stretchButton = document.getElementById("finalStretchButton");
  if (essayButton) essayButton.addEventListener("click", openEssay);
  if (stretchButton) stretchButton.addEventListener("click", openStretch);

  let essayStartedAt = 0;

  function modalOverlay(html) {
    let el = document.getElementById("examSimOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "examSimOverlay";
      el.className = "exam-sim-overlay";
      document.body.appendChild(el);
    }
    el.hidden = false;
    el.innerHTML = html;
    el.onclick = (event) => {
      if (event.target.closest("[data-action='close']")) el.hidden = true;
    };
    return el;
  }

  async function openEssay() {
    let data;
    try {
      data = await api("/api/essays/themes");
    } catch (error) {
      return modalOverlay(`<div class="exam-sim-card"><p>Erro: ${escapeHtml(error.message)}</p>
        <div class="exam-sim-actions"><button class="button button-primary" data-action="close">Fechar</button></div></div>`);
    }
    let history = { submissions: [] };
    try { history = await api("/api/essays/history"); } catch {}
    const options = data.themes
      .map((theme) => `<option value="${escapeHtml(theme.id)}" ${theme.id === data.suggestionId ? "selected" : ""}>${escapeHtml(theme.title)}</option>`)
      .join("");
    const historyHtml = (history.submissions || []).slice(0, 5)
      .map((item) => `<li>${escapeHtml(String(item.created_at).slice(0, 10))} — ${escapeHtml(item.theme_title.slice(0, 60))}… <strong>${item.score}/10</strong></li>`)
      .join("");
    const el = modalOverlay(`
      <div class="exam-sim-card essay-card">
        <div class="exam-sim-header">
          <h2>Discursiva</h2>
          <button class="button button-ghost" data-action="close">Sair</button>
        </div>
        ${data.aiAvailable ? "" : `<p class="essay-warning">IA não configurada — você pode escrever, mas a correção automática exige AI_PROVIDER no .env.</p>`}
        <label>Tema:
          <select id="essayTheme">${options}</select>
        </label>
        <div id="essayDossier" class="essay-dossier"></div>
        <div class="essay-meta-row">
          <span id="essayLineCount">0 / 30 linhas</span>
          <span id="essayTimer">00:00</span>
        </div>
        <textarea id="essayText" rows="14" placeholder="Escreva sua dissertação aqui (até 30 linhas). Dica: introdução com contextualização, um parágrafo por quesito, conclusão com proposta."></textarea>
        <div class="exam-sim-actions">
          <button class="button button-primary" id="essaySubmit" ${data.aiAvailable ? "" : "disabled"}>Enviar para correção</button>
        </div>
        ${historyHtml ? `<h3>Últimas redações</h3><ul class="essay-history">${historyHtml}</ul>` : ""}
      </div>`);

    essayStartedAt = Date.now();
    const timerHandle = setInterval(() => {
      const timer = document.getElementById("essayTimer");
      if (!timer) { clearInterval(timerHandle); return; }
      const seconds = Math.floor((Date.now() - essayStartedAt) / 1000);
      timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }, 1000);

    const textarea = document.getElementById("essayText");
    textarea.addEventListener("input", () => {
      const lines = textarea.value.split("\n").filter((line) => line.trim()).length;
      const counter = document.getElementById("essayLineCount");
      counter.textContent = `${lines} / 30 linhas`;
      counter.style.color = lines > 30 ? "#c0392b" : "";
    });

    const themeSelect = document.getElementById("essayTheme");
    renderDossier(themeSelect.value);
    themeSelect.addEventListener("change", () => renderDossier(themeSelect.value));

    el.addEventListener("click", async (event) => {
      if (!event.target.closest("#essaySubmit")) return;
      const button = document.getElementById("essaySubmit");
      button.disabled = true;
      button.textContent = "Corrigindo…";
      try {
        const result = await api("/api/essays/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            themeId: document.getElementById("essayTheme").value,
            text: textarea.value,
            elapsedMs: Date.now() - essayStartedAt,
          }),
        });
        if (result.error || !result.available) throw new Error(result.error || result.reason);
        renderEssayReport(result);
      } catch (error) {
        alert(`Erro na correção: ${error.message}`);
        button.disabled = false;
        button.textContent = "Enviar para correção";
      }
    });
  }

  const VERIFICACAO_SELO = {
    primaria: { rotulo: "fonte primária conferida", classe: "selo-ok" },
    secundaria: { rotulo: "confira antes de citar", classe: "selo-alerta" },
    curadoria: { rotulo: "formulação autoral", classe: "selo-neutro" },
  };

  function seloHtml(verificacao) {
    const selo = VERIFICACAO_SELO[verificacao];
    if (!selo) return "";
    return `<span class="dossie-selo ${selo.classe}">${escapeHtml(selo.rotulo)}</span>`;
  }

  function ancoraHtml(ancora) {
    if (ancora.missing) {
      return `<li class="dossie-ancora is-missing">Âncora ausente no compêndio: ${escapeHtml(ancora.sectionKey)}</li>`;
    }
    const filhos = (ancora.children || [])
      .map((child) => `<p class="dossie-lei-filho">${escapeHtml(child.text)}</p>`)
      .join("");
    const vigencia = ancora.isRevoked
      ? `<span class="dossie-selo selo-alerta">revogado</span>`
      : `<span class="dossie-selo selo-ok">em vigor</span>`;
    return `
      <li class="dossie-ancora">
        <details>
          <summary><strong>${escapeHtml(ancora.label || ancora.displayRef)}</strong> ${vigencia}</summary>
          <p class="dossie-lei">${escapeHtml(ancora.text)}</p>
          ${filhos}
        </details>
        <p class="dossie-uso">${escapeHtml(ancora.comoUsar)}</p>
      </li>`;
  }

  function dadoHtml(dado) {
    return `
      <li class="dossie-dado">
        <p class="dossie-dado-valor"><strong>${escapeHtml(dado.afirmacao)}:</strong> ${escapeHtml(dado.valor)}</p>
        <p class="dossie-fonte">
          ${escapeHtml(dado.fonte)} (${escapeHtml(String(dado.ano))}) ${seloHtml(dado.verificacao)}
          ${dado.url ? `<a href="${escapeAttr(dado.url)}" target="_blank" rel="noopener">fonte</a>` : ""}
        </p>
        <p class="dossie-uso">${escapeHtml(dado.comoUsar || "")}</p>
      </li>`;
  }

  function quesitoHtml(bloco, indice) {
    const argumentos = (bloco.argumentos || [])
      .map((argumento) => `
        <li>
          <p class="dossie-tese">${escapeHtml(argumento.tese)}</p>
          <p>${escapeHtml(argumento.desenvolvimento)}</p>
        </li>`)
      .join("");
    const armadilhas = (bloco.armadilhas || [])
      .map((armadilha) => `<li>${escapeHtml(armadilha)}</li>`)
      .join("");
    return `
      <details class="dossie-quesito">
        <summary><strong>Quesito ${indice + 1}</strong> — ${escapeHtml(bloco.quesito)}</summary>
        <ol class="dossie-argumentos">${argumentos}</ol>
        ${armadilhas ? `<p class="dossie-subtitulo">Armadilhas</p><ul class="dossie-armadilhas">${armadilhas}</ul>` : ""}
      </details>`;
  }

  async function renderDossier(themeId) {
    const container = document.getElementById("essayDossier");
    if (!container) return;
    container.innerHTML = `<p class="dossie-carregando">Carregando repertório…</p>`;

    let data;
    try {
      data = await api(`/api/essays/themes/${encodeURIComponent(themeId)}/dossier`);
    } catch (error) {
      container.innerHTML = `<p class="dossie-vazio">Não foi possível carregar o repertório: ${escapeHtml(error.message)}</p>`;
      return;
    }
    if (!data.available) {
      container.innerHTML = `<p class="dossie-vazio">${escapeHtml(data.reason || data.error || "Sem repertório para este tema.")}</p>`;
      return;
    }

    const dossie = data.dossier;
    const proposta = dossie.propostaIntervencao || {};
    const repertorio = (dossie.repertorio || [])
      .map((item) => `<li><strong>${escapeHtml(item.nome)}</strong> ${seloHtml(item.verificacao)}<br>${escapeHtml(item.uso)}</li>`)
      .join("");

    container.innerHTML = `
      <details class="dossie" open>
        <summary class="dossie-titulo">Repertório do tema <small>(${escapeHtml(data.version)})</small></summary>

        <p class="dossie-tese-central">${escapeHtml(dossie.teseCentral)}</p>

        <p class="dossie-subtitulo">Fundamento legal <small>texto lido do compêndio, sempre vigente</small></p>
        <ul class="dossie-ancoras">${data.ancoras.map(ancoraHtml).join("")}</ul>

        <p class="dossie-subtitulo">Dados citáveis</p>
        <ul class="dossie-dados">${(dossie.dados || []).map(dadoHtml).join("")}</ul>

        <p class="dossie-subtitulo">Como atacar cada quesito</p>
        ${(dossie.quesitos || []).map(quesitoHtml).join("")}

        <p class="dossie-subtitulo">Proposta de intervenção</p>
        <p class="dossie-proposta">
          <strong>Agente:</strong> ${escapeHtml(proposta.agente || "")}<br>
          <strong>Ação:</strong> ${escapeHtml(proposta.acao || "")}<br>
          <strong>Meio:</strong> ${escapeHtml(proposta.meio || "")}<br>
          <strong>Finalidade:</strong> ${escapeHtml(proposta.finalidade || "")}<br>
          <strong>Detalhamento:</strong> ${escapeHtml(proposta.detalhamento || "")}
        </p>

        <p class="dossie-subtitulo">Repertório citável</p>
        <ul class="dossie-repertorio">${repertorio}</ul>

        <p class="dossie-subtitulo">Conclusão</p>
        <p>${escapeHtml(dossie.conclusaoModelo || "")}</p>
      </details>`;
  }

  function renderEssayReport(result) {
    const correction = result.correction || {};
    const quesitos = (correction.quesitos || [])
      .map((quesito) => `<tr><td>${escapeHtml(quesito.nome)}</td><td>${quesito.nota} / ${quesito.max}</td><td>${escapeHtml(quesito.comentario || "")}</td></tr>`)
      .join("");
    const erros = (correction.erros_gramaticais || []).slice(0, 15)
      .map((erro) => `<li><em>"${escapeHtml(erro.trecho)}"</em> → ${escapeHtml(erro.correcao)} <small>(${escapeHtml(erro.tipo || "")})</small></li>`)
      .join("");
    modalOverlay(`
      <div class="exam-sim-card essay-card">
        <h2>Correção — ${escapeHtml(result.themeTitle.slice(0, 70))}</h2>
        <p class="exam-sim-score ${result.passed ? "ok" : "fail"}">
          Nota ${result.score} / 10 — ${result.passed ? "acima" : "ABAIXO"} do corte típico (5,0)
        </p>
        <table class="exam-sim-table" style="max-width:100%">
          <tr><th>Quesito</th><th>Nota</th><th>Comentário</th></tr>
          ${quesitos}
          ${correction.apresentacao ? `<tr><td>Apresentação/estrutura</td><td>${correction.apresentacao.nota} / ${correction.apresentacao.max}</td><td>${escapeHtml(correction.apresentacao.comentario || "")}</td></tr>` : ""}
        </table>
        ${erros ? `<h3>Erros de língua (${(correction.erros_gramaticais || []).length})</h3><ul>${erros}</ul>` : "<p>Nenhum erro gramatical apontado.</p>"}
        ${result.grammarCardsCreated ? `<p class="essay-warning" style="background: var(--success-soft)">✚ ${result.grammarCardsCreated} erro(s) viraram flashcards personalizados — aparecem em "Flashcards de memorização", agendados por repetição espaçada.</p>` : ""}
        <h3>Comentário geral</h3>
        <p>${escapeHtml(correction.comentario_geral || "")}</p>
        <p><small>Correção por IA (${escapeHtml(result.provider || "")}) segundo rubrica estilo Cebraspe — use como treino, não como nota oficial.</small></p>
        <div class="exam-sim-actions"><button class="button button-primary" data-action="close">Fechar</button></div>
      </div>`);
  }

  async function openStretch() {
    let status;
    try {
      status = await api("/api/final-stretch");
    } catch (error) {
      return modalOverlay(`<div class="exam-sim-card"><p>Erro: ${escapeHtml(error.message)}</p>
        <div class="exam-sim-actions"><button class="button button-primary" data-action="close">Fechar</button></div></div>`);
    }
    renderStretch(status);
  }

  function renderStretch(status) {
    const checklist = (status.checklist || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const el = modalOverlay(`
      <div class="exam-sim-card">
        <div class="exam-sim-header">
          <h2>Modo reta final</h2>
          <button class="button button-ghost" data-action="close">Sair</button>
        </div>
        <p>Defina a data da prova. A 30 dias, o sistema aperta a retenção-alvo das revisões (88% → 92%)
           e comprime todos os intervalos para caberem antes da prova.</p>
        <div class="essay-meta-row">
          <label>Data da prova: <input type="date" id="stretchDate" value="${escapeHtml(status.examDate || "")}"></label>
          <button class="button button-primary" id="stretchSave">Salvar</button>
          ${status.enabled ? `<button class="button button-secondary" id="stretchClear">Limpar</button>` : ""}
        </div>
        ${status.enabled ? `
          <p class="exam-sim-score ${status.finalStretchActive ? "fail" : "ok"}">
            ${status.daysLeft > 0 ? `${status.daysLeft} dias até a prova` : "Data no passado — atualize"}
            ${status.finalStretchActive ? " · RETA FINAL ATIVA" : ""}
          </p>
          <ul>${checklist}</ul>` : ""}
      </div>`);
    el.addEventListener("click", async (event) => {
      if (event.target.closest("#stretchSave")) {
        const value = document.getElementById("stretchDate").value;
        const updated = await api("/api/final-stretch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ examDate: value }) });
        renderStretch(updated);
      }
      if (event.target.closest("#stretchClear")) {
        const updated = await api("/api/final-stretch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ examDate: "" }) });
        renderStretch(updated);
      }
    });
  }
})();

/* ============================================================
   Painel "Hoje" — resumo acionável no topo (UI 2026-07)
   ============================================================ */
(function todayPanelModule() {
  const panel = document.getElementById("todayPanel");
  if (!panel) return;

  let refreshSeq = 0;
  let lastBank = {};

  // /api/stats é lento (segundos). Os contadores do dia dependem só de
  // /api/today-summary, então pinta assim que ele chega e repinta quando
  // o banco responder — em vez de esperar o mais lento dos dois.
  async function refresh() {
    const seq = ++refreshSeq;
    let data;
    try {
      data = await api("/api/today-summary");
    } catch {
      panel.hidden = true;
      return;
    }
    if (seq !== refreshSeq) return;
    render(data, lastBank);

    api("/api/stats").then((bank) => {
      if (seq !== refreshSeq) return;
      lastBank = bank;
      render(data, bank);
    }).catch(() => {});
  }

  function render(data, bank) {
    const accuracy = data.answersToday > 0
      ? Math.round((data.correctToday / data.answersToday) * 100)
      : null;
    const minutesToday = Math.round((data.timeTodayMs || 0) / 60000);
    const chips = [];

    if (data.projected) {
      const gap = data.projected.gap;
      chips.push(`
        <button type="button" class="today-chip ${gap >= 0 ? "chip-ok" : "chip-warn"}" data-today="optimizer"
          title="Nota projetada na escala da prova de 2021 (corte do último aprovado: 73). Onde ganhar mais: ${escapeAttr(data.projected.topSubject)}">
          <strong>${data.projected.score}</strong> proj. <small>${gap >= 0 ? "+" : ""}${gap}</small>
        </button>`);
    }
    chips.push(`
      <button type="button" class="today-chip ${data.dueQuestions > 0 ? "chip-due" : ""}" data-today="reviews"
        title="Questões com revisão vencida (FSRS) — clique para revisar">
        <strong>${data.dueQuestions}</strong> revisar
      </button>`);
    if (Number(bank.repairQuestions || 0) > 0) {
      chips.push(`
        <button type="button" class="today-chip" data-today="repair"
          title="Questões erradas aguardando reparo — clique para atacar">
          <strong>${bank.repairQuestions}</strong> erros
        </button>`);
    }
    if (data.clozeDue + data.clozeNew > 0) {
      const clozeCount = data.clozeDue > 0 ? data.clozeDue : data.clozeNew;
      chips.push(`
        <button type="button" class="today-chip ${data.clozeDue > 0 ? "chip-due" : ""}" data-today="cloze"
          title="Flashcards (letra de lei + gramática): ${data.clozeDue} vencidos, ${data.clozeNew} novos — clique para estudar">
          <strong>${clozeCount}</strong> flashcards${data.clozeDue > 0 ? "" : " <small>novos</small>"}
        </button>`);
    }
    chips.push(`
      <span class="today-chip chip-passive" title="Sessão de hoje: questões · acerto · tempo líquido">
        <strong>${data.answersToday}</strong> hoje${accuracy === null ? "" : ` <small>${accuracy}%</small>`}${minutesToday > 0 ? ` <small>${minutesToday}min</small>` : ""}
      </span>`);
    if (data.streakDays > 1) {
      chips.push(`
        <span class="today-chip chip-passive" title="Dias consecutivos de estudo">
          🔥 <strong>${data.streakDays}</strong>
        </span>`);
    }
    if (data.daysLeft !== null && data.daysLeft > 0) {
      chips.push(`
        <button type="button" class="today-chip ${data.finalStretchActive ? "chip-warn" : "chip-passive"}" data-today="stretch"
          title="Dias até a prova${data.finalStretchActive ? " — RETA FINAL ATIVA" : ""}">
          <strong>${data.daysLeft}</strong> dias p/ prova
        </button>`);
    }
    const ready = Number(bank.readyToStudy ?? bank.knownAnswers ?? 0);
    if (ready > 0) {
      chips.push(`
        <span class="today-chip chip-passive chip-bank"
          title="Banco: ${ready.toLocaleString("pt-BR")} prontas para estudar · ${Number(bank.answered || 0).toLocaleString("pt-BR")} resolvidas${bank.contranPrfUnpublished ? ` · ${bank.contranPrfUnpublished} inéditas` : ""}">
          ${ready.toLocaleString("pt-BR")} no banco
        </span>`);
    }

    panel.innerHTML = chips.join("");
    panel.hidden = false;
    // esconde o strip antigo — a informação útil já está nos chips acima
    const legacyStats = document.getElementById("stats");
    if (legacyStats) legacyStats.style.display = "none";
  }

  panel.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-today]");
    if (!chip) return;
    const action = chip.dataset.today;
    if (action === "reviews") document.getElementById("dueReviews")?.click();
    if (action === "repair") document.getElementById("repairQueue")?.click();
    if (action === "cloze") document.getElementById("lawClozeButton")?.click();
    if (action === "optimizer") document.getElementById("pointsOptimizerButton")?.click();
    if (action === "stretch") document.getElementById("finalStretchButton")?.click();
  });

  refresh();
  setInterval(refresh, 5 * 60 * 1000);
  document.addEventListener("study:progress", () => { refresh(); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
})();

/* ============================================================
   Monitor de vigência das resoluções CONTRAN (2026-07)
   Avisa quando o mapa de resoluções envelhece e lista as
   resoluções já substituídas (norma antiga -> norma atual).
   ============================================================ */
(function contranCurrencyMonitorModule() {
  const panel = document.getElementById("contranCurrencyMonitor");
  if (!panel) return;

  const dias = (n) =>
    n === null || n === undefined
      ? "em data desconhecida"
      : n === 0
        ? "hoje"
        : `há ${n} dia${n === 1 ? "" : "s"}`;

  function render(data) {
    if (!data || !data.available) {
      panel.hidden = true;
      return;
    }
    const ac = data.autoCheck || {};
    const flagged = Array.isArray(ac.flagged) ? ac.flagged : [];
    const checkFailed = ac.ran && !ac.ok;
    const checkStale = !ac.ran || ac.stale;
    const alert = flagged.length > 0 || checkFailed || checkStale || Boolean(data.stale);
    if (!alert && !(data.supersededCount > 0)) {
      panel.hidden = true;
      return;
    }

    const statusIcon = flagged.length > 0 || checkFailed ? "⚠️" : checkStale ? "🟡" : "🟢";
    const statusLine = !ac.ran
      ? "verificação automática ainda não rodou"
      : checkFailed
        ? `verificação automática falhou (${dias(ac.ageDays)})`
        : `verificado automaticamente ${dias(ac.ageDays)}`;

    // Cada candidato ganha ações: aplicar substituição (um clique) ou ignorar.
    const flaggedHtml = flagged.length
      ? `<div class="ccm-flagged">
           <strong>${flagged.length} resoluç${flagged.length === 1 ? "ão a revisar" : "ões a revisar"}</strong>
           — sumiram da lista oficial (revogação/substituição ou dado do mapa a corrigir):
           <ul class="ccm-list">${flagged
             .map(
               (f) => `
             <li class="ccm-flag-item" data-flag="${escapeAttr(f.resolution)}">
               <div><strong>Res. ${escapeHtml(f.resolution)}</strong>${f.title ? ` <small>${escapeHtml(f.title)}</small>` : ""}</div>
               <form class="ccm-apply" data-target="${escapeAttr(f.resolution)}">
                 <span>Substituir por Res.</span>
                 <input type="text" inputmode="numeric" placeholder="nº" class="ccm-num" aria-label="Número da nova resolução" size="5" />
                 <span>/</span>
                 <input type="text" inputmode="numeric" placeholder="ano" class="ccm-year" aria-label="Ano" size="4" />
                 <button type="submit" class="button button-primary ccm-btn">Aplicar</button>
                 <button type="button" class="button button-ghost ccm-btn" data-dismiss="${escapeAttr(f.resolution)}">Ignorar</button>
                 <a href="${escapeAttr(data.officialIndexUrl)}" target="_blank" rel="noopener">índice oficial</a>
                 <span class="ccm-apply-msg"></span>
               </form>
             </li>`,
             )
             .join("")}</ul>
         </div>`
      : "";

    const supersededHtml = (data.superseded || [])
      .map(
        (r) => `
      <li>
        <span><strong>Res. ${escapeHtml(r.source)}</strong> → Res. ${escapeHtml(r.target)}</span>
        ${r.titleHint || r.targetTitle ? `<small>${escapeHtml(r.titleHint || r.targetTitle)}</small>` : ""}
        ${r.officialUrl ? `<a href="${escapeAttr(r.officialUrl)}" target="_blank" rel="noopener">norma atual</a>` : ""}
      </li>`,
      )
      .join("");

    panel.innerHTML = `
      <details class="ccm"${flagged.length || checkFailed ? " open" : ""}>
        <summary class="ccm-summary ${flagged.length || checkFailed ? "is-stale" : "is-ok"}">
          ${statusIcon} Resoluções CONTRAN — ${escapeHtml(statusLine)}
          ${flagged.length ? `<span class="ccm-count">${flagged.length} a revisar</span>` : `<span class="ccm-count">${ac.officialCount || 0} conferidas</span>`}
          ${ac.dismissedCount ? `<span class="ccm-count">${ac.dismissedCount} ignoradas</span>` : ""}
        </summary>
        ${flaggedHtml}
        ${
          checkStale && ac.ran
            ? `<p class="ccm-warn">A verificação automática não roda há um tempo. Confira o agendamento (Vercel Cron) ou o <a href="${escapeAttr(data.officialIndexUrl)}" target="_blank" rel="noopener">índice oficial</a>.</p>`
            : ""
        }
        <p class="ccm-note">Verificação automática contra a lista oficial do SENATRAN. As ${data.supersededCount} substituições já mapeadas (norma antiga → atual):</p>
        <ul class="ccm-list">${supersededHtml}</ul>
      </details>`;
    panel.hidden = false;
  }

  // Aplicar substituição
  panel.addEventListener("submit", async (event) => {
    const form = event.target.closest(".ccm-apply");
    if (!form) return;
    event.preventDefault();
    const target = form.dataset.target;
    const newNumber = form.querySelector(".ccm-num")?.value?.trim();
    const newYear = form.querySelector(".ccm-year")?.value?.trim();
    const msg = form.querySelector(".ccm-apply-msg");
    const btn = form.querySelector("button[type=submit]");
    if (msg) msg.textContent = "aplicando…";
    if (btn) btn.disabled = true;
    try {
      const res = await api("/api/contran-resolutions/apply-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, newNumber, newYear }),
      });
      if (!res.ok) {
        if (msg) msg.textContent = res.error || "falhou";
        if (btn) btn.disabled = false;
        return;
      }
      render(res.summary);
    } catch (error) {
      if (msg) msg.textContent = `erro: ${error.message}`;
      if (btn) btn.disabled = false;
    }
  });

  // Ignorar (falso positivo)
  panel.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-dismiss]");
    if (!btn) return;
    event.preventDefault();
    btn.disabled = true;
    try {
      const res = await api("/api/contran-resolutions/dismiss-flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: btn.dataset.dismiss }),
      });
      if (res.ok) render(res.summary);
      else btn.disabled = false;
    } catch {
      btn.disabled = false;
    }
  });

  api("/api/contran-resolutions/currency").then(render).catch(() => {});
})();
