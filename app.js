/* ============================================================
   EngWord — leveled English dictionary & study suite (OpenAI)
   - CEFR level quiz (press "h" on the test to skip)
   - Collins-style definitions, Longman-style synonyms, English only
   - AI picture per word; click reveals English + Korean meaning
   - Word of the day, listen (TTS)
   - Practice: spaced-repetition flashcards + AI-generated quiz
   - Writing Coach: correction with leveled explanations
   - AI Tutor: chat about grammar, words and nuance
   ============================================================ */

const LS = {
  KEY: "engword_api_key",
  LEVEL: "engword_level",
  BOOK: "engword_book",
  TEXT_MODEL: "engword_text_model",
  IMAGE_MODEL: "engword_image_model",
  WOTD: "engword_wotd",
  LANG: "engword_lang",
  OAUTH_PROXY: "engword_oauth_proxy",
};

// OpenAI Codex public OAuth client (same as the Codex CLI / OpenClaw / Hermes).
const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OAUTH_ISSUER = "https://auth.openai.com";
const OAUTH_DEVICE_PAGE = "https://auth.openai.com/codex/device";

// OpenAI model ids. If a key can't use them, the 404 auto-retry below
// falls back to whatever models the account actually has.
const DEFAULT_TEXT_MODEL = "gpt-5-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const API_BASE = "https://api.openai.com/v1";

// One-time migration from the Gemini version of this app: clear stored
// Gemini model ids and a stored Gemini key so OpenAI defaults take effect.
if (localStorage.getItem("engword_model_v") !== "3") {
  localStorage.removeItem(LS.TEXT_MODEL);
  localStorage.removeItem(LS.IMAGE_MODEL);
  const oldKey = localStorage.getItem(LS.KEY) || "";
  if (oldKey.startsWith("AIza")) localStorage.removeItem(LS.KEY); // Gemini key
  localStorage.setItem("engword_model_v", "3");
}

const state = {
  apiKey: localStorage.getItem(LS.KEY) || "",
  level: localStorage.getItem(LS.LEVEL) || "", // "A1".."C2", "ANY", or "" (not tested yet)
  textModel: localStorage.getItem(LS.TEXT_MODEL) || DEFAULT_TEXT_MODEL,
  imageModel: localStorage.getItem(LS.IMAGE_MODEL) || DEFAULT_IMAGE_MODEL,
  quizIndex: 0,
  quizScore: 0,
  currentEntry: null,
  currentTerm: null,
  currentView: "",
  // practice
  flashDeck: [],
  flashIndex: 0,
  aiQuiz: [],
  aiQuizIndex: 0,
  aiQuizScore: 0,
  // tutor
  tutorHistory: [],
  // UI language ("en" | "ko")
  lang: localStorage.getItem(LS.LANG) || "en",
  oauthProxy: localStorage.getItem(LS.OAUTH_PROXY) || "",
  oauthPolling: false,
};

const $ = (id) => document.getElementById(id);

/* ============================================================
   Level test — score maps to CEFR level
   ============================================================ */
const QUIZ = [
  { q: 'Choose the correct sentence.',
    options: ["She have a cat.", "She has a cat.", "She haves a cat.", "She is have a cat."], answer: 1 },
  { q: '"I ____ to the cinema yesterday."',
    options: ["go", "goes", "went", "gone"], answer: 2 },
  { q: 'Which word is closest in meaning to "purchase"?',
    options: ["sell", "buy", "borrow", "build"], answer: 1 },
  { q: '"If I ____ more time, I would learn the piano."',
    options: ["have", "had", "will have", "would have"], answer: 1 },
  { q: 'Choose the best word: "The evidence was too ____ to draw a firm conclusion."',
    options: ["scarce", "plenty", "many", "much"], answer: 0 },
  { q: '"Hardly ____ the station when the train left."',
    options: ["I had reached", "had I reached", "I reached", "did I reached"], answer: 1 },
  { q: 'Which word means "to make a problem less severe"?',
    options: ["aggravate", "mitigate", "instigate", "delegate"], answer: 1 },
  { q: '"His remarks were so ____ that even his allies winced."',
    options: ["congenial", "caustic", "credulous", "cordial"], answer: 1 },
];

const LEVEL_BY_SCORE = ["A1", "A1", "A2", "B1", "B1", "B2", "C1", "C2", "C2"]; // index = score 0..8

const LEVEL_DESC = {
  A1: "Beginner — explanations use very simple, common words and short sentences.",
  A2: "Elementary — explanations use simple everyday English.",
  B1: "Intermediate — explanations use clear, natural English.",
  B2: "Upper-intermediate — explanations use natural English with some advanced words.",
  C1: "Advanced — explanations use rich, precise English.",
  C2: "Proficient — explanations use full native-level English.",
  ANY: "No level — explanations use clear, natural English for everyone.",
};

/* ============================================================
   UI language (한/영 toggle) — dictionary content stays English
   ============================================================ */
const I18N = {
  // English values mirror the HTML defaults; Korean swaps the UI chrome only.
  ko: {
    "nav.dictionary": "사전", "nav.practice": "연습", "nav.writing": "작문&nbsp;",
    "nav.coach": "코치", "nav.ai": "AI&nbsp;", "nav.tutor": "튜터",
    "nav.wordbook": "단어장", "nav.settings": "설정", "nav.terms": "용어",

    "terms.title": "전문 용어를 풀어드립니다",
    "terms.sub": "AI · 컴퓨터 · 마케팅 · 기술 · 과학 · 비즈니스 — 영어·라틴어·외래어 용어를 설명합니다.",
    "terms.ph": "용어를 입력하세요… 예: API, latency, CRM, de facto",
    "terms.btn": "질의", "terms.field.auto": "자동", "terms.loading": "용어를 설명하는 중…",
    "term.def": "정의", "term.origin": "어원 <span class=\"tag\">영어 · 라틴어 · 외래어</span>",
    "term.related": "관련 용어", "term.usage": "실제 쓰임", "term.other": "다른 뜻",
    "term.ko.show": "한국어 뜻 보기", "term.ko.hide": "한국어 뜻 숨기기",

    "ob.title": "내 레벨에 딱 맞는<br /><em>영어 단어 학습.</em>",
    "ob.sub": "콜린스식 정의 · 롱맨식 동의어 · AI 그림 · 나만의 단어장 · 작문 코치 &amp; 튜터",
    "ob.getstarted": "시작하기",
    "ob.keyinfo": "<strong>OpenAI API 키</strong>를 붙여넣으세요. 키는 이 브라우저에만 저장되며 OpenAI API로만 전송됩니다.",
    "ob.savekey": "키 저장하고 시작",
    "ob.keyhint": "키 발급: <a href=\"https://platform.openai.com/api-keys\" target=\"_blank\" rel=\"noopener\">platform.openai.com/api-keys</a>",

    "test.eyebrow": "레벨 테스트", "test.title": "빠른 레벨 확인",
    "test.desc": "몇 가지 짧은 질문에 답하면 설명이 내 레벨(A1–C2)에 맞춰집니다.",
    "test.skiphint": "<kbd>h</kbd> 키를 누르면 언제든 테스트를 건너뛰고 레벨 없이 진행합니다.",
    "test.yourlevel": "내 레벨:", "test.start": "단어 검색 시작 →", "test.skip": "건너뛰기 (h)",

    "hero.title": "어떤 단어가 궁금하세요?",
    "hero.sub1": "내 레벨", "hero.sub2": "에 맞춘 쉬운 영어 설명 — 동의어, 어원, 그림과 함께.",
    "search.ph": "영어 단어를 입력하세요… 예: resilient", "search.btn": "검색",
    "wotd.eyebrow": "오늘의 단어",
    "wotd.teaser.default": "매일 내 레벨에 맞는 새 단어를 골라드립니다.",
    "wotd.reveal": "오늘의 단어 보기", "wotd.open": "사전에서 열기 →", "wotd.picking": "단어를 고르는 중…",
    "lookup.loading": "“{w}” 찾는 중…",

    "entry.saved": "★ 단어장에 저장됨",
    "entry.def": "정의 <span class=\"tag\">Collins 스타일</span>",
    "entry.syn": "동의어 <span class=\"tag\">Longman 스타일</span>",
    "entry.origin": "어원 <span class=\"tag\">Etymology</span>",
    "entry.idioms": "숙어 &amp; 구문", "entry.sents": "유사 문장",
    "entry.picture": "그림", "entry.keep": "이어서 학습",
    "entry.cta.flash": "🃏 플래시카드 복습", "entry.cta.coach": "✍️ 문장으로 써보기", "entry.cta.tutor": "💬 AI 튜터에게 질문",
    "entry.imghint": "그림을 누르면 영어와 한국어 설명이 나옵니다.",
    "entry.drawbtn": "🎨 이미지로 보기",
    "entry.back": "← 그림으로", "entry.drawing": "단어를 그리는 중…", "entry.imgfail": "그림을 그리지 못했습니다.",

    "prac.eyebrow": "연습", "prac.title": "단어를 완전히 내 것으로",
    "prac.sub": "간격 반복 플래시카드와 내 단어장 기반 AI 퀴즈로 복습합니다.",
    "prac.flash.title": "플래시카드",
    "prac.flash.desc": "저장한 단어를 간격 반복으로 복습합니다. 어려운 단어는 더 자주 나옵니다.",
    "prac.flash.btn": "복습 시작",
    "prac.quiz.title": "AI 퀴즈",
    "prac.quiz.desc": "저장한 단어로 AI가 객관식 퀴즈를 출제합니다 — 뜻, 동의어, 빈칸 채우기.",
    "prac.quiz.btn": "퀴즈 만들기",
    "prac.fliphint": "카드를 누르면 뒤집힙니다.", "prac.end": "복습 종료",
    "prac.due": "저장한 단어 {total}개 중 {due}개가 복습할 차례입니다.",
    "prac.savefirst": "먼저 사전에서 단어를 저장하세요.",
    "prac.quizfrom": "최근 단어 {n}개로 퀴즈를 만듭니다.",
    "prac.card": "카드 {i} / {n}",
    "prac.empty": "단어장이 비어 있습니다 — 먼저 단어를 검색해보세요.",
    "grade.again": "다시", "grade.again.s": "10분 후", "grade.good": "알맞음",
    "grade.good.s": "다음 단계", "grade.easy": "쉬움", "grade.easy.s": "단계 건너뜀",
    "prac.quiz.loading": "퀴즈를 만드는 중…", "prac.quiz.done": "퀴즈 완료 🎉",
    "prac.quiz.new": "새 퀴즈", "prac.quiz.back": "연습으로",
    "quiz.next": "다음 →", "quiz.result": "결과 보기 →",
    "quiz.correct": "✓ 정답! ", "quiz.wrong": "✗ 아쉽네요. ",

    "coach.eyebrow": "작문 코치", "coach.title": "쓰면 다듬어드립니다",
    "coach.sub": "영어로 문장이나 짧은 글을 써보세요. 코치가 교정하고, 수정 이유를 내 레벨에 맞게 설명하고, 더 자연스러운 표현을 알려줍니다.",
    "coach.ph": "배운 단어로 문장을 만들어보세요… 예: 'Even the failure, she kept resilient and tried again.'",
    "coach.btn": "내 글 검사", "coach.loading": "글을 읽는 중…",
    "coach.corrected": "교정본", "coach.changed": "무엇이 왜 바뀌었나", "coach.natural": "더 자연스러운 표현",
    "coach.perfect": "고칠 게 없어요 — 훌륭합니다! 🎉",
    "coach.tryword": "“{w}” 단어로 문장을 만들어보세요.",

    "tutor.eyebrow": "AI 튜터", "tutor.title": "영어에 관해 무엇이든 물어보세요",
    "tutor.sub": "문법, 단어 선택, 뉘앙스, 예문 — 내 레벨에 맞춰 답해드립니다.",
    "tutor.greet": "안녕하세요! 영어 튜터예요. 문법, 단어, 뉘앙스 등 무엇이든 물어보세요 — 예: <em>\"What's the difference between 'resilient' and 'tough'?\"</em>",
    "tutor.ph": "영어로 질문해보세요…", "tutor.send": "보내기", "tutor.thinking": "생각 중…",

    "book.eyebrow": "내 단어장", "book.title": "내가 찾아본 모든 단어",
    "book.sub": "자동으로 저장되어 언제든 복습할 수 있습니다.",
    "tab.words": "단어집", "tab.ety": "어원", "tab.idioms": "숙어",
    "tab.syn": "동의어", "tab.sents": "유사 문장",
    "book.kind.all": "전체", "book.kind.word": "📖 사전", "book.kind.term": "🧩 용어",
    "book.empty": "단어장이 비어 있습니다.<br>사전에서 단어를 검색하면 자동으로 저장됩니다.",
    "book.export": "⬇ 단어장 백업 (JSON)", "book.import": "⬆ 백업 불러오기",
    "book.exported": "단어 {n}개를 백업 파일로 저장했습니다. 파일을 안전한 곳에 보관하세요.",
    "book.imported": "가져오기 완료: 새 단어 {a}개, 갱신 {u}개.",
    "book.importfail": "EngWord 백업 파일이 아닌 것 같습니다.",
    "book.delete": "삭제",
    "book.none.ety": "저장된 어원이 없습니다.", "book.none.idioms": "저장된 숙어가 없습니다.",
    "book.none.syn": "저장된 동의어가 없습니다.", "book.none.sents": "저장된 문장이 없습니다.",

    "set.eyebrow": "설정", "set.title": "내 설정",
    "set.oauth": "🔓 ChatGPT로 로그인 (OpenAI)",
    "set.oauthproxy": "OAuth 프록시 URL (Cloudflare Worker)",
    "set.oauthproxyhint": "ChatGPT 로그인에 한 번 필요합니다. 저장소의 worker.js를 Cloudflare에 무료 배포한 뒤 그 URL을 여기에 붙여넣으세요.",
    "oauth.needproxy": "먼저 아래 <strong>OAuth 프록시 URL</strong>에 Cloudflare Worker 주소를 입력하세요. (worker.js를 배포)",
    "oauth.starting": "로그인 코드를 받는 중…",
    "oauth.entercode": "새 탭에서 OpenAI(구글 로그인 가능)에 로그인한 뒤, 이 코드를 입력하세요: <strong style=\"font-size:18px\">{code}</strong><br>승인하면 자동으로 연결됩니다. 이 창을 닫지 마세요…",
    "oauth.finishing": "로그인 확인 중…",
    "oauth.success": "ChatGPT 계정으로 연결되었습니다. 이제 바로 사용할 수 있어요!",
    "oauth.timeout": "시간이 초과되었습니다. 다시 시도해주세요.",
    "oauth.proxyfail": "프록시 요청 실패 — Worker URL과 배포 상태를 확인하세요.",
    "oauth.exchangefail": "토큰 교환에 실패했습니다.",
    "oauth.keyfail": "API 키 발급에 실패했습니다.",
    "oauth.nokey": "키를 받지 못했습니다. 이 계정은 API 사용이 불가능할 수 있습니다.",
    "oauth.hint": "OpenAI의 비공개 Codex 엔드포인트를 사용하므로 계정/지역에 따라 동작하지 않을 수 있습니다. 그럴 땐 위의 API 키 방식을 사용하세요.",
    "set.lang": "화면 언어 / Language",
    "set.update": "키 변경", "set.text": "텍스트 모델", "set.image": "이미지 모델",
    "set.detect": "모델 자동 감지", "set.test": "연결 테스트",
    "set.hint": "“model not found” 에러가 나면 <strong>모델 자동 감지</strong>를 누르세요 — 내 키로 쓸 수 있는 최신 모델로 자동 전환합니다.",
    "set.retake": "레벨 테스트 다시 보기", "set.clear": "저장된 단어 모두 삭제",
    "set.keyok": "API 키가 변경되었습니다.", "set.keybad": "올바른 API 키가 아닌 것 같습니다.",
    "set.textok": "텍스트 모델이 변경되었습니다.", "set.imageok": "이미지 모델이 변경되었습니다.",
    "set.cleared": "단어장을 비웠습니다.",
    "set.confirmclear": "저장된 단어를 모두 삭제할까요? 되돌릴 수 없습니다.",
    "level.label": "레벨 ",

    "foot.1": "<strong>EngWord</strong> · 핀테크놀러지 AI 교육 · 나만의 영어 사전 &amp; 튜터",
    "foot.2": "설명은 영어로만 · 그림과 퀴즈는 OpenAI · 키는 브라우저 밖으로 나가지 않습니다",
  },
  en: {
    "lookup.loading": "Looking up “{w}”…",
    "entry.drawing": "Drawing the word…", "entry.imgfail": "Could not draw the picture.",
    "wotd.teaser.default": "A fresh word picked for your level, every day.",
    "terms.loading": "Explaining the term…",
    "term.ko.show": "Show Korean meaning", "term.ko.hide": "Hide Korean meaning",
    "wotd.reveal": "Reveal today's word", "wotd.open": "Open in dictionary →",
    "wotd.picking": "Picking a word for you…",
    "prac.due": "{due} of {total} saved words are due for review.",
    "prac.savefirst": "Save some words in the Dictionary first.",
    "prac.quizfrom": "Quiz will be built from your {n} most recent words.",
    "prac.card": "Card {i} of {n}",
    "prac.empty": "Your wordbook is empty — look up some words first.",
    "quiz.next": "Next →", "quiz.result": "See result →",
    "quiz.correct": "✓ Correct! ", "quiz.wrong": "✗ Not quite. ",
    "coach.perfect": "Nothing to fix — great job! 🎉",
    "coach.tryword": "Try writing a sentence with “{w}”.",
    "tutor.thinking": "Thinking…",
    "book.empty": "Your wordbook is empty.<br>Look up a word in the Dictionary and it will be saved here automatically.",
    "book.exported": "Backup file with {n} words downloaded. Keep it somewhere safe.",
    "book.imported": "Imported: {a} new words, {u} updated.",
    "book.importfail": "That file doesn't look like an EngWord backup.",
    "book.delete": "delete",
    "book.none.ety": "No etymology saved.", "book.none.idioms": "No idioms saved.",
    "book.none.syn": "No synonyms saved.", "book.none.sents": "No sentences saved.",
    "oauth.needproxy": "First enter your Cloudflare Worker address in <strong>OAuth proxy URL</strong> below (deploy worker.js).",
    "oauth.starting": "Requesting a sign-in code…",
    "oauth.entercode": "In the new tab, sign in to OpenAI (Google login works), then enter this code: <strong style=\"font-size:18px\">{code}</strong><br>Approve it and you'll be connected automatically. Keep this page open…",
    "oauth.finishing": "Confirming sign-in…",
    "oauth.success": "Connected with your ChatGPT account. You're ready to go!",
    "oauth.timeout": "Timed out. Please try again.",
    "oauth.proxyfail": "Proxy request failed — check the Worker URL and that it is deployed.",
    "oauth.exchangefail": "Token exchange failed.",
    "oauth.keyfail": "Could not obtain an API key.",
    "oauth.nokey": "No key was returned. This account may not have API access.",
    "oauth.hint": "This uses OpenAI's private Codex endpoints, so it may not work for every account/region. If it fails, use the API key method above.",
    "set.keyok": "API key updated.", "set.keybad": "That doesn't look like a valid API key.",
    "set.textok": "Text model updated.", "set.imageok": "Image model updated.",
    "set.cleared": "Wordbook cleared.",
    "set.confirmclear": "Delete ALL saved words? This cannot be undone.",
    "level.label": "Level ",
  },
};

// Default English text lives in the HTML; remember it so we can restore it.
const I18N_DEFAULTS = {};
document.querySelectorAll("[data-i18n]").forEach((el) => {
  I18N_DEFAULTS[el.dataset.i18n] = el.innerHTML;
});
document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
  I18N_DEFAULTS["ph:" + el.dataset.i18nPh] = el.placeholder;
});

function t(key, vars) {
  let s = I18N[state.lang]?.[key] ?? I18N.en[key] ?? I18N_DEFAULTS[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

function applyLang() {
  document.documentElement.lang = state.lang === "ko" ? "ko" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const k = el.dataset.i18n;
    el.innerHTML = state.lang === "ko" ? (I18N.ko[k] ?? I18N_DEFAULTS[k]) : (I18N_DEFAULTS[k] ?? I18N.en[k] ?? "");
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const k = el.dataset.i18nPh;
    el.placeholder = state.lang === "ko" ? (I18N.ko[k] ?? I18N_DEFAULTS["ph:" + k]) : I18N_DEFAULTS["ph:" + k];
  });
  $("langToggle").textContent = state.lang === "ko" ? "EN" : "한";
  $("langEnBtn").classList.toggle("sel", state.lang === "en");
  $("langKoBtn").classList.toggle("sel", state.lang === "ko");
  updateLevelBadge();
  // refresh dynamic texts on the visible view
  if (state.currentView === "lookup") renderWotdCard();
  if (state.currentView === "practice") renderPracticeHome();
  if (state.currentView === "mybook") renderBook(currentTab);
  if (state.currentView === "terms" && state.currentTerm) renderTermEntry(state.currentTerm);
}

function setLang(l) {
  state.lang = l;
  localStorage.setItem(LS.LANG, l);
  applyLang();
}

$("langToggle").addEventListener("click", () => setLang(state.lang === "ko" ? "en" : "ko"));
$("langEnBtn").addEventListener("click", () => setLang("en"));
$("langKoBtn").addEventListener("click", () => setLang("ko"));

/* ============================================================
   View switching
   ============================================================ */
function show(view) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $("view-" + view).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view));
  if (view === "mybook") renderBook(currentTab);
  if (view === "settings") fillSettings();
  if (view === "practice") renderPracticeHome();
  if (view === "lookup") renderWotdCard();
}

function updateLevelBadge() {
  const lv = state.level;
  $("levelBadge").textContent = t("level.label") + (lv ? (lv === "ANY" ? "·" : lv) : "—");
  $("levelInline").textContent = lv && lv !== "ANY" ? ` (${lv})` : "";
}

function boot() {
  applyLang();
  updateLevelBadge();
  if (!state.apiKey) show("apikey");
  else if (!state.level) startQuiz();
  else show("lookup");
}

/* ============================================================
   API key
   ============================================================ */
function saveKey(value, errEl) {
  const key = value.trim();
  if (key.length < 20) {
    if (errEl) errEl.textContent = "That doesn't look like a valid API key.";
    return false;
  }
  state.apiKey = key;
  localStorage.setItem(LS.KEY, key);
  return true;
}

$("saveKeyBtn").addEventListener("click", () => {
  if (saveKey($("apiKeyInput").value, $("apiKeyError"))) {
    state.level ? show("lookup") : startQuiz();
  }
});
$("apiKeyInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("saveKeyBtn").click();
});

/* ============================================================
   Placement quiz
   ============================================================ */
function startQuiz() {
  state.quizIndex = 0;
  state.quizScore = 0;
  $("quizBox").classList.remove("hidden");
  $("quizResult").classList.add("hidden");
  show("test");
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const i = state.quizIndex;
  const item = QUIZ[i];
  $("quizProgress").textContent = `${i + 1} / ${QUIZ.length}`;
  $("quizBarFill").style.width = `${(i / QUIZ.length) * 100}%`;
  $("quizQuestion").textContent = item.q;
  const box = $("quizOptions");
  box.innerHTML = "";
  item.options.forEach((opt, idx) => {
    const b = document.createElement("button");
    b.textContent = opt;
    b.addEventListener("click", () => answerQuiz(idx));
    box.appendChild(b);
  });
}

function answerQuiz(idx) {
  if (idx === QUIZ[state.quizIndex].answer) state.quizScore++;
  state.quizIndex++;
  if (state.quizIndex < QUIZ.length) renderQuizQuestion();
  else finishQuiz();
}

function finishQuiz() {
  const level = LEVEL_BY_SCORE[state.quizScore];
  setLevel(level);
  $("quizBox").classList.add("hidden");
  $("quizResult").classList.remove("hidden");
  $("quizLevel").textContent = level;
  $("quizLevelDesc").textContent = LEVEL_DESC[level];
}

function setLevel(level) {
  state.level = level;
  localStorage.setItem(LS.LEVEL, level);
  updateLevelBadge();
}

function skipQuiz() {
  setLevel("ANY");
  show("lookup");
  $("wordInput").focus();
}

$("skipTestBtn").addEventListener("click", skipQuiz);
$("startLookupBtn").addEventListener("click", () => { show("lookup"); $("wordInput").focus(); });

// Press "h" on the test screen to skip the quiz entirely.
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "h") return;
  const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (!typing && state.currentView === "test") skipQuiz();
});

/* ============================================================
   OpenAI calls — with model auto-detection & 404 auto-retry
   ============================================================ */
function openaiFetch(path, body) {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

async function listModels() {
  const res = await fetch(`${API_BASE}/models`, {
    headers: { Authorization: `Bearer ${state.apiKey}` },
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res));
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}

function modelVersion(id) {
  const m = id.match(/gpt-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function pickTextModel(ids) {
  const candidates = ids.filter((id) =>
    /^gpt-/.test(id) &&
    !/image|dall-e|audio|realtime|tts|whisper|embed|moderation|transcribe|search|sora|instruct/.test(id));
  const score = (id) =>
    modelVersion(id) * 100 +
    (/mini/.test(id) ? 20 : 0) + (/nano/.test(id) ? 15 : 0) -
    (/preview|chat-latest|\d{4}/.test(id) ? 1 : 0); // prefer stable, undated aliases
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

function pickImageModel(ids) {
  const candidates = ids.filter((id) => /^(gpt-image|dall-e)/.test(id));
  const score = (id) =>
    (/^gpt-image/.test(id) ? 1000 : 0) + modelVersion(id.replace("gpt-image", "gpt")) +
    (/dall-e-3/.test(id) ? 500 : /dall-e/.test(id) ? 100 : 0) -
    (/preview|\d{4}/.test(id) ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

// Query the account's real model list and switch to the best available ones.
async function autoDetectModels() {
  const ids = await listModels();
  const text = pickTextModel(ids);
  const image = pickImageModel(ids);
  if (text) { state.textModel = text; localStorage.setItem(LS.TEXT_MODEL, text); }
  if (image) { state.imageModel = image; localStorage.setItem(LS.IMAGE_MODEL, image); }
  return { text, image, count: ids.length };
}

// Chat completion; on 404 (model not on this account) auto-detect and retry once.
async function chatComplete(messages, wantJson) {
  const body = { model: state.textModel, messages };
  if (wantJson) body.response_format = { type: "json_object" };
  let res = await openaiFetch("/chat/completions", body);
  if (res.status === 404) {
    await autoDetectModels().catch(() => {});
    if (state.textModel !== body.model) {
      body.model = state.textModel;
      res = await openaiFetch("/chat/completions", body);
    }
  }
  if (!res.ok) throw new Error(await apiErrorMessage(res));
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function aiText(prompt) {
  let text = await chatComplete([{ role: "user", content: prompt }], true);
  // Some models wrap JSON in ```json fences despite response_format.
  text = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(text); }
  catch { throw new Error("The model returned an unexpected answer — please try again."); }
}

// Plain-text chat with history, for the AI Tutor.
function aiChat(history) {
  return chatComplete(history.map((m) => ({
    role: m.role === "model" ? "assistant" : m.role,
    content: m.text,
  })), false);
}

async function aiImage(prompt) {
  // gpt-image-1 needs a verified org on some accounts; fall back to DALL·E.
  const models = [...new Set([state.imageModel, "gpt-image-1", "dall-e-3", "dall-e-2"])];
  let lastErr = null;
  for (const model of models) {
    const body = { model, prompt, n: 1, size: "1024x1024" };
    if (/^dall-e/.test(model)) body.response_format = "b64_json";
    const res = await openaiFetch("/images/generations", body);
    if (res.ok) {
      const data = await res.json();
      const item = data?.data?.[0];
      if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
      if (item?.url) return item.url;
      lastErr = new Error("The image model returned no image.");
      continue;
    }
    lastErr = new Error(await apiErrorMessage(res));
    // Only model-access problems are worth retrying with another model.
    if (![400, 403, 404].includes(res.status)) throw lastErr;
  }
  throw lastErr;
}

async function apiErrorMessage(res) {
  let msg = `API error (${res.status})`;
  try {
    const j = await res.json();
    if (j?.error?.message) msg += ": " + j.error.message;
  } catch { /* keep generic message */ }
  if (res.status === 401) msg += " — your API key was refused; check it in Settings.";
  if (res.status === 403) msg += " — your account can't use this model; try “Auto-detect best models” in Settings.";
  if (res.status === 404) msg += " — that model doesn't exist on your account; use “Auto-detect best models” in Settings.";
  if (res.status === 429) msg += " — rate limit or no credit on your OpenAI account; check billing and try again.";
  return msg;
}

function levelInstruction() {
  if (!state.level || state.level === "ANY") {
    return "Write all explanations in clear, natural English suitable for any learner.";
  }
  return `The learner's CEFR level is ${state.level}. Write every definition, note and example using vocabulary and grammar that a ${state.level} learner can understand comfortably. ${LEVEL_DESC[state.level]}`;
}

/* ============================================================
   Text-to-speech (browser, free)
   ============================================================ */
function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  speechSynthesis.speak(u);
}
$("speakWordBtn").addEventListener("click", () => speak(state.currentEntry?.word));

/* ============================================================
   Lookup flow
   ============================================================ */
function lookupPrompt(word) {
  return `You are an expert English learner's dictionary, combining the style of the Collins COBUILD dictionary and the Longman dictionary.

Create a complete dictionary entry for the word: "${word}"

${levelInstruction()}

STRICT RULES:
- Everything in fields other than "koreanExplanation" must be written in ENGLISH ONLY. Do not use Korean or any other language there.
- Definitions must be COLLINS COBUILD style: full natural sentences that show the word in use, e.g. "If you persevere with something, you keep trying to do it and do not give up." or "A harbour is an area of water next to the coast where ships can stay safely."
- Synonyms must be LONGMAN thesaurus style: each synonym gets a short note explaining HOW it differs in nuance, register or typical use, plus one example sentence.

Return ONLY a JSON object with exactly this shape:
{
  "word": "the word, corrected spelling if needed",
  "pronunciation": "IPA, e.g. /rɪˈzɪliənt/",
  "partOfSpeech": "main part of speech (e.g. adjective)",
  "definitions": [
    { "definition": "Collins-style full-sentence definition", "example": "one natural example sentence" }
  ],
  "synonyms": [
    { "word": "synonym", "note": "Longman-style nuance note in English", "example": "example sentence" }
  ],
  "etymology": "2-4 sentences on the word's origin and how its meaning developed, in English",
  "idioms": [
    { "phrase": "idiom or common phrase using the word", "meaning": "what it means", "example": "example sentence" }
  ],
  "similarSentences": ["4-6 natural sentences using the word or expressing similar ideas"],
  "imagePrompt": "a vivid, concrete description of a single picture that visually explains this word's core meaning (no text in the image)",
  "shortEnglish": "one very simple English sentence stating what the word means",
  "koreanExplanation": "단어의 뜻과 핵심 쓰임을 한국어 2-3문장으로 설명"
}

Give 2-4 definitions, 3-5 synonyms, 1-3 idioms (use related common phrases if the word has no true idioms).`;
}

async function lookup(word) {
  word = word.trim();
  if (!word) return;
  if (!state.apiKey) { show("apikey"); return; }

  $("lookupError").textContent = "";
  $("entry").classList.add("hidden");
  $("loading").classList.remove("hidden");
  $("loadingMsg").textContent = t("lookup.loading", { w: word });
  $("lookupBtn").disabled = true;

  try {
    const entry = await aiText(lookupPrompt(word));
    entry.savedAt = Date.now();
    entry.level = state.level || "ANY";
    state.currentEntry = entry;
    renderEntry(entry);
    saveToBook(entry);
  } catch (err) {
    $("lookupError").textContent = err.message || String(err);
  } finally {
    $("loading").classList.add("hidden");
    $("lookupBtn").disabled = false;
  }
}

async function loadEntryImage(entry) {
  $("drawImgBtn").classList.add("hidden");
  $("imgLoading").classList.remove("hidden");
  $("imgLoading").innerHTML = `<div class="spinner small"></div><p>${t("entry.drawing")}</p>`;
  $("entryImg").classList.add("hidden");
  $("imgReveal").classList.add("hidden");
  try {
    const prompt = `Create one clear, friendly illustration with no words or letters in it. ${entry.imagePrompt || `A simple scene that visually explains the meaning of the English word "${entry.word}".`}`;
    const dataUrl = await aiImage(prompt);
    if (state.currentEntry === entry) {
      $("entryImg").src = dataUrl;
      $("entryImg").classList.remove("hidden");
      $("imgLoading").classList.add("hidden");
    }
  } catch (err) {
    if (state.currentEntry === entry) {
      $("imgLoading").innerHTML = `<p>${t("entry.imgfail")}<br><span class="error">${escapeHtml(err.message || String(err))}</span></p>`;
      $("drawImgBtn").classList.remove("hidden"); // allow retry
    }
  }
}

/* ============================================================
   Entry rendering
   ============================================================ */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderEntry(e) {
  $("entryWord").textContent = e.word || "";
  $("entryPron").textContent = e.pronunciation || "";
  $("entryPos").textContent = e.partOfSpeech || "";

  $("entryDefs").innerHTML = (e.definitions || []).map((d) => `
    <li>
      <span class="def-text">${escapeHtml(d.definition)}</span>
      ${d.example ? `<span class="def-ex">“${escapeHtml(d.example)}”</span>` : ""}
    </li>`).join("");

  $("entrySyns").innerHTML = (e.synonyms || []).map((s) => `
    <div class="syn-item">
      <span class="syn-word">${escapeHtml(s.word)}</span>
      — <span class="syn-note">${escapeHtml(s.note)}</span>
      ${s.example ? `<span class="syn-ex">“${escapeHtml(s.example)}”</span>` : ""}
    </div>`).join("");

  $("entryEtym").textContent = e.etymology || "";

  $("entryIdioms").innerHTML = (e.idioms || []).map((i) => `
    <li>
      <span class="idiom-phrase">${escapeHtml(i.phrase)}</span>
      — <span class="idiom-meaning">${escapeHtml(i.meaning)}</span>
      ${i.example ? `<span class="syn-ex">“${escapeHtml(i.example)}”</span>` : ""}
    </li>`).join("");

  $("entrySents").innerHTML = (e.similarSentences || []).map((s) =>
    `<li>${escapeHtml(s)}</li>`).join("");

  // image box starts empty: the picture is drawn only when the user asks
  resetImageBox();

  // reveal panel content (shown when the picture is clicked)
  $("revealWord").textContent = e.word || "";
  $("revealEn").textContent = e.shortEnglish || (e.definitions?.[0]?.definition ?? "");
  $("revealKo").textContent = e.koreanExplanation || "";
  $("imgReveal").classList.add("hidden");

  $("entry").classList.remove("hidden");
}

function resetImageBox() {
  $("drawImgBtn").classList.remove("hidden");
  $("imgLoading").classList.add("hidden");
  $("entryImg").classList.add("hidden");
  $("entryImg").src = "";
  $("imgReveal").classList.add("hidden");
}

// The picture is generated on demand only.
$("drawImgBtn").addEventListener("click", () => {
  if (state.currentEntry) loadEntryImage(state.currentEntry);
});

// Picture click → show English + Korean explanation; back button returns to picture.
$("entryImg").addEventListener("click", () => $("imgReveal").classList.remove("hidden"));
$("revealBackBtn").addEventListener("click", () => $("imgReveal").classList.add("hidden"));

$("lookupBtn").addEventListener("click", () => lookup($("wordInput").value));
$("wordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookup($("wordInput").value);
});

// side CTAs on the entry
$("practiceCta").addEventListener("click", () => show("practice"));
$("tutorCta").addEventListener("click", () => {
  show("tutor");
  if (state.currentEntry) $("tutorInput").value = `Tell me more about how to use "${state.currentEntry.word}".`;
  $("tutorInput").focus();
});
$("coachCta").addEventListener("click", () => {
  show("coach");
  if (state.currentEntry) {
    $("coachWordHint").textContent = t("coach.tryword", { w: state.currentEntry.word });
  }
  $("coachInput").focus();
});

/* ============================================================
   Word of the day
   ============================================================ */
function todayStr() { return new Date().toISOString().slice(0, 10); }

function getWotdCache() {
  try { return JSON.parse(localStorage.getItem(LS.WOTD)); } catch { return null; }
}

function renderWotdCard() {
  const c = getWotdCache();
  if (c && c.date === todayStr()) {
    $("wotdWord").textContent = c.word;
    $("wotdTeaser").textContent = c.teaser;
    $("wotdBtn").textContent = t("wotd.open");
  } else {
    $("wotdWord").textContent = "—";
    $("wotdTeaser").textContent = t("wotd.teaser.default");
    $("wotdBtn").textContent = t("wotd.reveal");
  }
}

$("wotdBtn").addEventListener("click", async () => {
  const c = getWotdCache();
  if (c && c.date === todayStr()) {
    $("wordInput").value = c.word;
    lookup(c.word);
    return;
  }
  $("wotdBtn").disabled = true;
  $("wotdTeaser").textContent = t("wotd.picking");
  try {
    const known = Object.keys(getBook()).slice(0, 40).join(", ") || "none";
    const data = await aiText(`Pick ONE interesting, genuinely useful English word for a learner.
${levelInstruction()}
Do NOT pick any of these already-known words: ${known}.
Return ONLY JSON: {"word": "the word", "teaser": "one short English sentence (max 15 words) hinting at what it means, without defining it fully"}`);
    localStorage.setItem(LS.WOTD, JSON.stringify({ date: todayStr(), word: data.word, teaser: data.teaser }));
    renderWotdCard();
  } catch (err) {
    $("wotdTeaser").textContent = err.message || String(err);
  } finally {
    $("wotdBtn").disabled = false;
  }
});

/* ============================================================
   Wordbook (localStorage)
   ============================================================ */
function getBook() {
  try { return JSON.parse(localStorage.getItem(LS.BOOK)) || {}; }
  catch { return {}; }
}

function saveToBook(entry) {
  const book = getBook();
  const key = (entry.word || "").toLowerCase();
  entry.srs = book[key]?.srs || { box: 0, due: Date.now() }; // keep review progress
  book[key] = entry;
  localStorage.setItem(LS.BOOK, JSON.stringify(book));
}

function deleteFromBook(key) {
  const book = getBook();
  delete book[key];
  localStorage.setItem(LS.BOOK, JSON.stringify(book));
  renderBook(currentTab);
}

let currentTab = "words";
let bookKind = "all"; // "all" | "word" | "term"

document.querySelectorAll("#kindFilter .kchip").forEach((c) =>
  c.addEventListener("click", () => {
    bookKind = c.dataset.kind;
    document.querySelectorAll("#kindFilter .kchip").forEach((x) =>
      x.classList.toggle("active", x === c));
    renderBook(currentTab);
  }));

document.querySelectorAll("#bookTabs .tab").forEach((t) =>
  t.addEventListener("click", () => {
    currentTab = t.dataset.tab;
    document.querySelectorAll("#bookTabs .tab").forEach((x) =>
      x.classList.toggle("active", x === t));
    renderBook(currentTab);
  }));

function bookEntries() {
  return Object.entries(getBook()).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
}

function renderBook(tab) {
  const box = $("bookContent");
  let entries = bookEntries();
  if (bookKind === "term") entries = entries.filter(([, e]) => e.kind === "term");
  if (bookKind === "word") entries = entries.filter(([, e]) => e.kind !== "term");
  if (!entries.length) {
    box.innerHTML = `<div class="book-empty">${t("book.empty")}</div>`;
    return;
  }

  box.innerHTML = entries.map(([key, e]) => {
    let body = "";
    if (tab === "words") {
      const d = e.definitions?.[0];
      body = d ? `${escapeHtml(d.definition)}${d.example ? ` <em>“${escapeHtml(d.example)}”</em>` : ""}` : "";
    } else if (tab === "etymology") {
      body = escapeHtml(e.etymology || t("book.none.ety"));
    } else if (tab === "idioms") {
      body = (e.idioms || []).map((i) =>
        `<div><strong>${escapeHtml(i.phrase)}</strong> — ${escapeHtml(i.meaning)}</div>`).join("") || t("book.none.idioms");
    } else if (tab === "synonyms") {
      body = (e.synonyms || []).map((s) =>
        `<div><strong>${escapeHtml(s.word)}</strong> — ${escapeHtml(s.note)}</div>`).join("") || t("book.none.syn");
    } else if (tab === "sentences") {
      body = (e.similarSentences || []).map((s) => `<div>• ${escapeHtml(s)}</div>`).join("") || t("book.none.sents");
    }
    const date = e.savedAt ? new Date(e.savedAt).toLocaleDateString() : "";
    return `
      <div class="book-item">
        <div class="bi-head">
          <h3 data-word="${escapeHtml(key)}">${escapeHtml(e.word)}</h3>
          ${e.kind === "term" ? `<span class="term-badge">${t("nav.terms")}</span>` : ""}
          <span class="bi-meta">${escapeHtml(e.partOfSpeech || "")} · ${escapeHtml(e.level || "")} · ${date}</span>
          <button class="bi-del" data-del="${escapeHtml(key)}">${t("book.delete")}</button>
        </div>
        <div class="bi-body">${body}</div>
      </div>`;
  }).join("");

  box.querySelectorAll("h3[data-word]").forEach((h) =>
    h.addEventListener("click", () => openSavedEntry(h.dataset.word)));
  box.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteFromBook(b.dataset.del)));
}

// Re-open a saved entry without calling the API again (only the picture is regenerated).
function openSavedEntry(key) {
  const entry = getBook()[key];
  if (!entry) return;
  if (entry.kind === "term") {
    state.currentTerm = entry;
    show("terms");
    $("termInput").value = entry.word;
    $("termError").textContent = "";
    renderTermEntry(entry);
    return;
  }
  state.currentEntry = entry;
  show("lookup");
  $("wordInput").value = entry.word;
  $("lookupError").textContent = "";
  renderEntry(entry);
}

/* ============================================================
   Terms / terminology — technical, Latin & loanword terms.
   Stored in the same wordbook (kind:"term") so it reuses the
   wordbook, flashcards, AI quiz and backup with no extra work.
   ============================================================ */
let termField = "auto"; // selected domain chip

document.querySelectorAll("#termFields .chip").forEach((c) =>
  c.addEventListener("click", () => {
    termField = c.dataset.field;
    document.querySelectorAll("#termFields .chip").forEach((x) =>
      x.classList.toggle("active", x === c));
  }));

// Modern AI/LLM glossary — keeps acronym lookups current (e.g. MCP must
// resolve to Model Context Protocol, not the 1943 McCulloch-Pitts neuron).
const MODERN_AI_GLOSSARY = `MCP = Model Context Protocol: Anthropic's open standard (2024) that connects AI assistants/agents to external tools, data sources and prompts via MCP servers and clients.
token = the unit of text an LLM reads and writes; text is split into tokens by a tokenizer; pricing and context limits are counted in tokens.
context / context window = the amount of text (in tokens) an LLM can consider at once, including the system prompt, conversation and documents.
vector DB / vector database = a database that stores embeddings (number vectors) and finds similar items fast; the storage layer behind RAG (e.g. Pinecone, pgvector, Chroma).
RAG = Retrieval-Augmented Generation: retrieving relevant documents and adding them to the prompt so the LLM answers with up-to-date, grounded facts.
parser = a component that turns raw text or LLM output into structured data (e.g. parsing a model's JSON or tool-call output); also a compiler stage.
skill / Skills = packaged instructions, scripts and resources that extend what an AI agent can do (e.g. Claude Skills / Agent Skills).
agent = an LLM-powered system that plans multi-step work and calls tools autonomously.
embedding = a vector of numbers representing the meaning of text/images, used for search and RAG.
system prompt = the hidden instruction that sets an LLM's role and rules.
fine-tuning = further training of a base model on custom examples; LoRA = a cheap fine-tuning method.
hallucination = when an LLM states something false as fact.
inference = running a trained model to get outputs (vs training).
prompt engineering = designing inputs to get reliable LLM outputs.
transformer = the neural-network architecture behind modern LLMs ("Attention Is All You Need", 2017).
guardrails = safety filters/constraints around model inputs and outputs.
multimodal = a model that handles text plus images/audio/video.
function calling / tool use = LLM responding with structured calls that run real code or APIs.`;

function termPrompt(term) {
  const scope = termField === "auto"
    ? "Decide which field the term most likely belongs to (AI, computing, marketing, technology, science, business, etc.)."
    : `Explain the term as it is used in the field of ${termField}.`;
  const aiRecency = (termField === "AI" || termField === "auto") ? `
IMPORTANT — RECENCY: For AI and tech terms, ALWAYS prefer the meaning most widely used TODAY in the modern AI/LLM industry (LLMs, agents, RAG, prompting, MCP), NOT older academic meanings. For example, "MCP" must be explained as Model Context Protocol — never as McCulloch-Pitts neuron. If an older or different meaning also exists, put it in "otherMeanings" instead of the main definition.
Trusted reference glossary — when the term matches one of these, use this meaning:
${MODERN_AI_GLOSSARY}
` : "";
  return `You are an expert glossary that explains technical, professional and foreign-origin terms (including English, Latin, Greek and loanwords) for a learner.

Explain this term: "${term}"
${scope}
${aiRecency}
${levelInstruction()}

RULES:
- Write every field except "koreanExplanation" in ENGLISH ONLY.
- The definition must be a clear, full-sentence explanation a learner can understand, not a dictionary fragment.
- "origin" must cover where the term comes from: the language of origin (e.g. Latin, Greek, French, an acronym, a brand name), the literal roots or what the letters stand for, and how it came to its current technical meaning.

Return ONLY a JSON object:
{
  "term": "the term, corrected/expanded if it is an acronym (e.g. \\"API (Application Programming Interface)\\")",
  "pronunciation": "IPA or a simple phonetic hint, e.g. /ˌeɪ.piːˈaɪ/",
  "field": "the domain this term belongs to (e.g. AI, Computing, Marketing)",
  "definition": "full-sentence English explanation of what the term means",
  "example": "one natural sentence showing the term used in context",
  "origin": "2-4 sentences on the term's origin: language/roots/acronym expansion and how its meaning developed",
  "relatedTerms": [ { "word": "related or contrasting term", "note": "how it relates or differs, in English" } ],
  "usage": ["3-4 natural sentences using the term in real professional context"],
  "otherMeanings": ["other meanings this term has in different fields or older usage, each as one short sentence; empty array if none"],
  "shortEnglish": "one very simple English sentence stating what the term means",
  "koreanExplanation": "용어의 뜻과 쓰임을 한국어 2-3문장으로 설명"
}
Give 3-5 related terms.`;
}

async function termLookup(term) {
  term = term.trim();
  if (!term) return;
  if (!state.apiKey) { show("apikey"); return; }

  $("termError").textContent = "";
  $("termEntry").classList.add("hidden");
  $("termLoading").classList.remove("hidden");
  $("termLoadingMsg").textContent = t("terms.loading");
  $("termBtn").disabled = true;

  try {
    const r = await aiText(termPrompt(term));
    // Map the term answer onto the standard entry schema so the wordbook,
    // flashcards, quiz and backup all work without special-casing.
    const entry = {
      word: r.term || term,
      pronunciation: r.pronunciation || "",
      partOfSpeech: r.field || (termField !== "auto" ? termField : "term"),
      definitions: [{ definition: r.definition || "", example: r.example || "" }],
      synonyms: (r.relatedTerms || []).map((x) => ({ word: x.word, note: x.note, example: "" })),
      etymology: r.origin || "",
      idioms: [],
      similarSentences: r.usage || [],
      otherMeanings: r.otherMeanings || [],
      shortEnglish: r.shortEnglish || "",
      koreanExplanation: r.koreanExplanation || "",
      kind: "term",
      field: r.field || termField,
      savedAt: Date.now(),
      level: state.level || "ANY",
    };
    state.currentTerm = entry;
    renderTermEntry(entry);
    saveToBook(entry);
  } catch (err) {
    $("termError").textContent = err.message || String(err);
  } finally {
    $("termLoading").classList.add("hidden");
    $("termBtn").disabled = false;
  }
}

function renderTermEntry(e) {
  $("termWord").textContent = e.word || "";
  $("termPron").textContent = e.pronunciation || "";
  $("termField").textContent = e.field || e.partOfSpeech || "";

  $("termDefs").innerHTML = (e.definitions || []).map((d) => `
    <li>
      <span class="def-text">${escapeHtml(d.definition)}</span>
      ${d.example ? `<span class="def-ex">“${escapeHtml(d.example)}”</span>` : ""}
    </li>`).join("");

  $("termOrigin").textContent = e.etymology || "";

  $("termRelated").innerHTML = (e.synonyms || []).map((s) => `
    <div class="syn-item">
      <span class="syn-word">${escapeHtml(s.word)}</span>
      ${s.note ? `— <span class="syn-note">${escapeHtml(s.note)}</span>` : ""}
    </div>`).join("") || `<span class="muted">—</span>`;

  $("termUsage").innerHTML = (e.similarSentences || []).map((s) =>
    `<li>${escapeHtml(s)}</li>`).join("");

  const others = e.otherMeanings || [];
  $("termOther").innerHTML = others.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  $("termOtherBlock").classList.toggle("hidden", !others.length);

  $("termKo").textContent = e.koreanExplanation || "";
  $("termKo").classList.add("hidden");
  $("termKoToggle").innerHTML = t("term.ko.show");

  $("termEntry").classList.remove("hidden");
}

$("termKoToggle").addEventListener("click", () => {
  const hidden = $("termKo").classList.toggle("hidden");
  $("termKoToggle").innerHTML = hidden ? t("term.ko.show") : t("term.ko.hide");
});
$("termSpeakBtn").addEventListener("click", () => speak(state.currentTerm?.word));
$("termBtn").addEventListener("click", () => termLookup($("termInput").value));
$("termInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") termLookup($("termInput").value);
});

/* ============================================================
   Wordbook backup — export / import as a JSON file
   ============================================================ */
$("exportBtn").addEventListener("click", () => {
  const book = getBook();
  const data = {
    app: "engword", version: 1, exportedAt: new Date().toISOString(),
    level: state.level, book,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `engword-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  $("bookMsg").textContent = t("book.exported", { n: Object.keys(book).length });
});

$("importBtn").addEventListener("click", () => $("importFile").click());

$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const imported = data.book ?? data; // accept a full backup or a raw book object
    if (!imported || typeof imported !== "object" || Array.isArray(imported)) throw new Error("bad");
    const book = getBook();
    let added = 0, updated = 0;
    for (const [k, v] of Object.entries(imported)) {
      if (!v || typeof v !== "object" || !v.word) continue;
      if (!book[k]) added++;
      else if ((v.savedAt || 0) > (book[k].savedAt || 0)) updated++;
      else continue;
      book[k] = v;
    }
    if (!added && !updated && !Object.keys(imported).length) throw new Error("empty");
    localStorage.setItem(LS.BOOK, JSON.stringify(book));
    if (!state.level && data.level) setLevel(data.level);
    renderBook(currentTab);
    $("bookMsg").textContent = t("book.imported", { a: added, u: updated });
  } catch {
    $("bookMsg").textContent = t("book.importfail");
  }
  e.target.value = ""; // allow re-importing the same file
});

/* ============================================================
   Practice — spaced-repetition flashcards
   Leitner boxes: 0..4 → review after 0, 1, 3, 7, 16 days
   ============================================================ */
const SRS_DAYS = [0, 1, 3, 7, 16];

let pracKind = "all"; // practice on: "all" | "word" | "term"

document.querySelectorAll("#pracKindFilter .kchip").forEach((c) =>
  c.addEventListener("click", () => {
    pracKind = c.dataset.kind;
    document.querySelectorAll("#pracKindFilter .kchip").forEach((x) =>
      x.classList.toggle("active", x === c));
    renderPracticeHome();
  }));

// Saved entries narrowed to the selected practice kind.
function pracEntries() {
  let entries = bookEntries();
  if (pracKind === "term") entries = entries.filter(([, e]) => e.kind === "term");
  if (pracKind === "word") entries = entries.filter(([, e]) => e.kind !== "term");
  return entries;
}

function dueEntries() {
  const now = Date.now();
  return pracEntries().filter(([, e]) => !e.srs || (e.srs.due || 0) <= now);
}

function renderPracticeHome() {
  $("practiceHome").classList.remove("hidden");
  $("flashArea").classList.add("hidden");
  $("quizArea").classList.add("hidden");
  $("practiceError").textContent = "";
  const total = pracEntries().length;
  const due = dueEntries().length;
  $("flashDueInfo").textContent = total
    ? t("prac.due", { due, total })
    : t("prac.savefirst");
  $("quizWordsInfo").textContent = total
    ? t("prac.quizfrom", { n: Math.min(total, 8) })
    : t("prac.savefirst");
}

function startFlashcards() {
  const due = dueEntries();
  const deck = (due.length ? due : pracEntries()).map(([key, e]) => ({ key, e }));
  if (!deck.length) {
    $("practiceError").textContent = t("prac.empty");
    return;
  }
  // shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  state.flashDeck = deck;
  state.flashIndex = 0;
  $("practiceHome").classList.add("hidden");
  $("flashArea").classList.remove("hidden");
  renderFlashcard();
}

function renderFlashcard() {
  const item = state.flashDeck[state.flashIndex];
  if (!item) { endFlashcards(); return; }
  const e = item.e;
  $("flashCount").textContent = t("prac.card", { i: state.flashIndex + 1, n: state.flashDeck.length });
  $("flashFront").innerHTML = `<p class="fc-word">${escapeHtml(e.word)}</p><p class="fc-pos">${escapeHtml(e.partOfSpeech || "")}</p>`;
  const d = e.definitions?.[0];
  $("flashBack").innerHTML = `
    <p class="fc-word" style="font-size:26px">${escapeHtml(e.word)}</p>
    <p class="fc-def">${escapeHtml(d?.definition || "")}</p>
    ${d?.example ? `<p class="fc-ex">“${escapeHtml(d.example)}”</p>` : ""}`;
  $("flashFront").classList.remove("hidden");
  $("flashBack").classList.add("hidden");
  $("flashGrades").classList.add("hidden");
  $("flashHint").classList.remove("hidden");
}

$("flashCard").addEventListener("click", () => {
  if (!$("flashBack").classList.contains("hidden")) return;
  $("flashFront").classList.add("hidden");
  $("flashBack").classList.remove("hidden");
  $("flashGrades").classList.remove("hidden");
  $("flashHint").classList.add("hidden");
  speak(state.flashDeck[state.flashIndex]?.e.word);
});

document.querySelectorAll("#flashGrades .grade").forEach((b) =>
  b.addEventListener("click", () => gradeFlashcard(b.dataset.grade)));

function gradeFlashcard(grade) {
  const item = state.flashDeck[state.flashIndex];
  if (!item) return;
  const book = getBook();
  const e = book[item.key];
  if (e) {
    const srs = e.srs || { box: 0, due: 0 };
    if (grade === "again") {
      srs.box = 0;
      srs.due = Date.now() + 10 * 60 * 1000; // 10 minutes
    } else {
      const step = grade === "easy" ? 2 : 1;
      srs.box = Math.min(srs.box + step, SRS_DAYS.length - 1);
      srs.due = Date.now() + SRS_DAYS[srs.box] * 24 * 60 * 60 * 1000;
    }
    e.srs = srs;
    localStorage.setItem(LS.BOOK, JSON.stringify(book));
  }
  state.flashIndex++;
  if (state.flashIndex < state.flashDeck.length) renderFlashcard();
  else endFlashcards();
}

function endFlashcards() {
  renderPracticeHome();
}

$("startFlashBtn").addEventListener("click", startFlashcards);
$("flashQuitBtn").addEventListener("click", endFlashcards);

/* ============================================================
   Practice — AI-generated quiz from the wordbook
   ============================================================ */
async function startAiQuiz() {
  const entries = pracEntries().slice(0, 8);
  if (!entries.length) {
    $("practiceError").textContent = t("prac.empty");
    return;
  }
  $("practiceHome").classList.add("hidden");
  $("quizArea").classList.remove("hidden");
  $("aiQuizLoading").classList.remove("hidden");
  $("aiQuizBox").classList.add("hidden");
  $("aiQuizResult").classList.add("hidden");

  const wordList = entries.map(([, e]) =>
    `- ${e.word}: ${e.definitions?.[0]?.definition || ""}`).join("\n");

  try {
    const data = await aiText(`You are an English vocabulary quiz writer.
${levelInstruction()}

Create a multiple-choice quiz from these words the learner has studied:
${wordList}

Write ${Math.min(entries.length + 2, 8)} varied questions in ENGLISH ONLY. Mix these types:
- "Which word matches this meaning?"
- fill-in-the-blank sentences (the blank is one of the words)
- "Which word is a synonym of ...?"

Each question has exactly 4 options and one correct answer. Wrong options must be plausible.
Return ONLY JSON:
{"questions":[{"question":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"one short sentence saying why the answer is right"}]}`);
    state.aiQuiz = data.questions || [];
    if (!state.aiQuiz.length) throw new Error("The model returned no questions — try again.");
    state.aiQuizIndex = 0;
    state.aiQuizScore = 0;
    $("aiQuizLoading").classList.add("hidden");
    $("aiQuizBox").classList.remove("hidden");
    renderAiQuizQuestion();
  } catch (err) {
    $("aiQuizLoading").classList.add("hidden");
    $("practiceError").textContent = err.message || String(err);
    $("quizArea").classList.add("hidden");
    $("practiceHome").classList.remove("hidden");
  }
}

function renderAiQuizQuestion() {
  const i = state.aiQuizIndex;
  const q = state.aiQuiz[i];
  $("aiQuizProgress").textContent = `${i + 1} / ${state.aiQuiz.length}`;
  $("aiQuizBarFill").style.width = `${(i / state.aiQuiz.length) * 100}%`;
  $("aiQuizQuestion").textContent = q.question;
  $("aiQuizFeedback").classList.add("hidden");
  $("aiQuizNextBtn").classList.add("hidden");
  const box = $("aiQuizOptions");
  box.innerHTML = "";
  q.options.forEach((opt, idx) => {
    const b = document.createElement("button");
    b.textContent = opt;
    b.addEventListener("click", () => answerAiQuiz(idx, b));
    box.appendChild(b);
  });
}

function answerAiQuiz(idx, btn) {
  const q = state.aiQuiz[state.aiQuizIndex];
  const buttons = [...$("aiQuizOptions").children];
  buttons.forEach((b) => (b.disabled = true));
  buttons[q.answerIndex]?.classList.add("correct");
  if (idx === q.answerIndex) {
    state.aiQuizScore++;
  } else {
    btn.classList.add("wrong");
  }
  const fb = $("aiQuizFeedback");
  fb.textContent = (idx === q.answerIndex ? t("quiz.correct") : t("quiz.wrong")) + (q.explanation || "");
  fb.classList.remove("hidden");
  $("aiQuizNextBtn").classList.remove("hidden");
  $("aiQuizNextBtn").textContent = state.aiQuizIndex + 1 < state.aiQuiz.length ? t("quiz.next") : t("quiz.result");
}

$("aiQuizNextBtn").addEventListener("click", () => {
  state.aiQuizIndex++;
  if (state.aiQuizIndex < state.aiQuiz.length) {
    renderAiQuizQuestion();
  } else {
    $("aiQuizBox").classList.add("hidden");
    $("aiQuizResult").classList.remove("hidden");
    $("aiQuizScore").textContent = `${state.aiQuizScore} / ${state.aiQuiz.length}`;
  }
});

$("startAiQuizBtn").addEventListener("click", startAiQuiz);
$("aiQuizAgainBtn").addEventListener("click", startAiQuiz);
$("aiQuizBackBtn").addEventListener("click", renderPracticeHome);

/* ============================================================
   Writing Coach
   ============================================================ */
async function coachCheck() {
  const text = $("coachInput").value.trim();
  if (!text) return;
  if (!state.apiKey) { show("apikey"); return; }

  $("coachError").textContent = "";
  $("coachResult").classList.add("hidden");
  $("coachLoading").classList.remove("hidden");
  $("coachCheckBtn").disabled = true;

  try {
    const data = await aiText(`You are a supportive English writing coach.
${levelInstruction()}

The learner wrote:
"""${text}"""

Correct it and explain, in ENGLISH ONLY. Be encouraging but precise. If the writing is already perfect, say so and still offer a richer alternative.
Return ONLY JSON:
{
  "corrected": "the corrected text",
  "score": 7,
  "issues": [
    { "from": "the original wrong part", "to": "the fixed part", "why": "short, simple explanation of the rule or word choice" }
  ],
  "natural": "a more natural, native-sounding way to express the same idea",
  "tip": "one short tip this learner should remember, based on their mistakes"
}
"score" is 1-10 for grammar + naturalness. "issues" may be empty if nothing was wrong.`);

    $("coachScore").textContent = `${data.score ?? "–"} / 10`;
    $("coachCorrected").textContent = data.corrected || "";
    $("coachIssues").innerHTML = (data.issues || []).length
      ? data.issues.map((i) => `
          <li><span class="ci-from">${escapeHtml(i.from)}</span> → <span class="ci-to">${escapeHtml(i.to)}</span><br>
          <span class="muted">${escapeHtml(i.why)}</span></li>`).join("")
      : `<li>${t("coach.perfect")}</li>`;
    $("coachNatural").textContent = data.natural || "";
    $("coachTip").textContent = data.tip ? "💡 " + data.tip : "";
    $("coachResult").classList.remove("hidden");
  } catch (err) {
    $("coachError").textContent = err.message || String(err);
  } finally {
    $("coachLoading").classList.add("hidden");
    $("coachCheckBtn").disabled = false;
  }
}

$("coachCheckBtn").addEventListener("click", coachCheck);
$("coachInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) coachCheck();
});

/* ============================================================
   AI Tutor chat
   ============================================================ */
function tutorPreamble() {
  return `You are a friendly, expert English tutor inside a dictionary app.
${levelInstruction()}
Rules: answer in ENGLISH ONLY. Keep answers short and clear (2-6 sentences) unless the learner asks for more. Use simple examples. Use **bold** for key words.`;
}

// Minimal safe markdown: bold, code, line breaks (input is HTML-escaped first).
function renderMarkdownLite(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

function appendChat(role, html) {
  const div = document.createElement("div");
  div.className = "chat-msg " + role;
  div.innerHTML = html;
  $("tutorLog").appendChild(div);
  $("tutorLog").scrollTop = $("tutorLog").scrollHeight;
  return div;
}

async function tutorSend() {
  const text = $("tutorInput").value.trim();
  if (!text) return;
  if (!state.apiKey) { show("apikey"); return; }

  $("tutorInput").value = "";
  appendChat("user", renderMarkdownLite(text));
  const typing = appendChat("bot typing", t("tutor.thinking"));
  $("tutorSendBtn").disabled = true;

  // First user turn carries the tutor instructions.
  const userText = state.tutorHistory.length ? text : tutorPreamble() + "\n\nLearner: " + text;
  state.tutorHistory.push({ role: "user", text: userText });

  try {
    const reply = await aiChat(state.tutorHistory);
    state.tutorHistory.push({ role: "model", text: reply });
    typing.className = "chat-msg bot";
    typing.innerHTML = renderMarkdownLite(reply);
  } catch (err) {
    state.tutorHistory.pop(); // let the user retry the same question
    typing.className = "chat-msg bot";
    typing.innerHTML = `<span class="error">${escapeHtml(err.message || String(err))}</span>`;
  } finally {
    $("tutorSendBtn").disabled = false;
    $("tutorLog").scrollTop = $("tutorLog").scrollHeight;
  }
}

$("tutorSendBtn").addEventListener("click", tutorSend);
$("tutorInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") tutorSend();
});

/* ============================================================
   Settings
   ============================================================ */
function fillSettings() {
  $("settingsKeyInput").value = state.apiKey;
  $("textModelInput").value = state.textModel;
  $("imageModelInput").value = state.imageModel;
  $("oauthProxyInput").value = state.oauthProxy;
  $("settingsMsg").textContent = "";
}

$("settingsSaveKeyBtn").addEventListener("click", () => {
  if (saveKey($("settingsKeyInput").value)) $("settingsMsg").textContent = t("set.keyok");
  else $("settingsMsg").textContent = t("set.keybad");
});
$("textModelInput").addEventListener("change", () => {
  state.textModel = $("textModelInput").value.trim() || DEFAULT_TEXT_MODEL;
  localStorage.setItem(LS.TEXT_MODEL, state.textModel);
  $("settingsMsg").textContent = t("set.textok");
});
$("imageModelInput").addEventListener("change", () => {
  state.imageModel = $("imageModelInput").value.trim() || DEFAULT_IMAGE_MODEL;
  localStorage.setItem(LS.IMAGE_MODEL, state.imageModel);
  $("settingsMsg").textContent = t("set.imageok");
});
$("detectModelsBtn").addEventListener("click", async () => {
  $("settingsMsg").textContent = "Checking which models your key can use…";
  try {
    const r = await autoDetectModels();
    fillSettings();
    $("settingsMsg").textContent =
      `Found ${r.count} usable models. Text: ${r.text || "none"} · Image: ${r.image || "none — pictures won't work on this key"}.`;
  } catch (err) {
    $("settingsMsg").textContent = err.message || String(err);
  }
});

$("testApiBtn").addEventListener("click", async () => {
  $("settingsMsg").textContent = "Testing connection…";
  try {
    const reply = await aiChat([{ role: "user", text: "Reply with the single word: OK" }]);
    $("settingsMsg").textContent = `✓ Connection OK — “${reply.trim().slice(0, 40)}” from ${state.textModel}.`;
  } catch (err) {
    $("settingsMsg").textContent = "✗ " + (err.message || String(err));
  }
});

/* ----------------------------------------------------------------
   "Sign in with ChatGPT" — OpenAI Codex device-code OAuth.
   The same flow Codex CLI / OpenClaw / Hermes use. Browsers are blocked
   by CORS on auth.openai.com, so requests go through the user's own
   Cloudflare Worker (worker.js); see Settings → OAuth proxy URL.
   ---------------------------------------------------------------- */
$("oauthProxyInput").addEventListener("change", () => {
  state.oauthProxy = $("oauthProxyInput").value.trim().replace(/\/$/, "");
  localStorage.setItem(LS.OAUTH_PROXY, state.oauthProxy);
});

function oauthPost(path, body) {
  return fetch(state.oauthProxy + "/oai" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chatgptSignIn() {
  if (state.oauthPolling) return;
  if (!state.oauthProxy) {
    $("oauthMsg").innerHTML = t("oauth.needproxy");
    $("oauthProxyInput").focus();
    return;
  }
  state.oauthPolling = true;
  $("oauthBtn").disabled = true;
  try {
    // 1) request a user code
    $("oauthMsg").textContent = t("oauth.starting");
    let res = await oauthPost("/api/accounts/deviceauth/usercode", { client_id: OAUTH_CLIENT_ID });
    if (!res.ok) throw new Error(t("oauth.proxyfail") + " (" + res.status + ")");
    const dev = await res.json();
    const userCode = dev.user_code || dev.usercode;
    const interval = (dev.interval || 5) * 1000;

    // 2) user enters the code on OpenAI's device page (their own login, no CORS)
    window.open(OAUTH_DEVICE_PAGE, "_blank", "noopener");
    $("oauthMsg").innerHTML = t("oauth.entercode", { code: escapeHtml(userCode) });

    // 3) poll until the user approves
    let poll;
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(interval);
      const r = await oauthPost("/api/accounts/deviceauth/token", {
        device_auth_id: dev.device_auth_id, user_code: userCode,
      });
      if (r.status === 200) { poll = await r.json(); break; }
      if (r.status !== 403 && r.status !== 404) throw new Error(t("oauth.proxyfail") + " (" + r.status + ")");
    }
    if (!poll) throw new Error(t("oauth.timeout"));

    // 4) exchange the authorization code (+ PKCE) for tokens
    $("oauthMsg").textContent = t("oauth.finishing");
    res = await oauthPost("/oauth/token", {
      grant_type: "authorization_code",
      code: poll.authorization_code,
      redirect_uri: OAUTH_ISSUER + "/deviceauth/callback",
      client_id: OAUTH_CLIENT_ID,
      code_verifier: poll.code_verifier,
    });
    if (!res.ok) throw new Error(t("oauth.exchangefail") + " (" + res.status + ")");
    const tok = await res.json();

    // 5) trade the id_token for a usable OpenAI API key
    res = await oauthPost("/oauth/token", {
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      client_id: OAUTH_CLIENT_ID,
      requested_token: "openai-api-key",
      subject_token: tok.id_token,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    });
    if (!res.ok) throw new Error(t("oauth.keyfail") + " (" + res.status + ")");
    const keyResp = await res.json();
    const apiKey = keyResp.access_token || keyResp.api_key;
    if (!apiKey) throw new Error(t("oauth.nokey"));

    state.apiKey = apiKey;
    localStorage.setItem(LS.KEY, apiKey);
    $("settingsKeyInput").value = apiKey;
    $("oauthMsg").innerHTML = "✅ " + t("oauth.success");
  } catch (err) {
    $("oauthMsg").innerHTML = "⚠️ " + escapeHtml(err.message || String(err)) + "<br><span class=\"muted\">" + t("oauth.hint") + "</span>";
  } finally {
    state.oauthPolling = false;
    $("oauthBtn").disabled = false;
  }
}

$("oauthBtn").addEventListener("click", chatgptSignIn);

$("retakeTestBtn").addEventListener("click", startQuiz);
$("clearBookBtn").addEventListener("click", () => {
  if (confirm(t("set.confirmclear"))) {
    localStorage.removeItem(LS.BOOK);
    $("settingsMsg").textContent = t("set.cleared");
  }
});

/* ============================================================
   Nav
   ============================================================ */
document.querySelectorAll(".nav-btn").forEach((b) =>
  b.addEventListener("click", () => {
    if (!state.apiKey && b.dataset.view !== "settings") { show("apikey"); return; }
    show(b.dataset.view);
  }));
$("brandHome").addEventListener("click", () => show(state.apiKey ? "lookup" : "apikey"));
$("levelBadge").addEventListener("click", () => { if (state.apiKey) startQuiz(); });

boot();
