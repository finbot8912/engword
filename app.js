/* ============================================================
   EngWord — leveled English dictionary powered by Gemini
   - Quick CEFR level quiz (press "h" anywhere on the test to skip)
   - Collins-style full-sentence definitions, English only
   - Longman-style synonym notes
   - Etymology, idioms, similar sentences — all saved to a wordbook
   - AI picture per word; clicking it reveals English + Korean meaning
   ============================================================ */

const LS = {
  KEY: "engword_api_key",
  LEVEL: "engword_level",
  BOOK: "engword_book",
  TEXT_MODEL: "engword_text_model",
  IMAGE_MODEL: "engword_image_model",
};

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const state = {
  apiKey: localStorage.getItem(LS.KEY) || "",
  level: localStorage.getItem(LS.LEVEL) || "", // "A1".."C2", "ANY", or "" (not tested yet)
  textModel: localStorage.getItem(LS.TEXT_MODEL) || DEFAULT_TEXT_MODEL,
  imageModel: localStorage.getItem(LS.IMAGE_MODEL) || DEFAULT_IMAGE_MODEL,
  quizIndex: 0,
  quizScore: 0,
  currentEntry: null,
  currentView: "",
};

const $ = (id) => document.getElementById(id);

/* ============================================================
   Level test — one question per band; score maps to CEFR level
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
}

function updateLevelBadge() {
  const lv = state.level;
  $("levelBadge").textContent = "Level: " + (lv ? (lv === "ANY" ? "Any" : lv) : "—");
  $("levelInline").textContent = lv && lv !== "ANY" ? ` (${lv})` : "";
}

function boot() {
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
   Quiz
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
  $("quizProgress").textContent = `Question ${i + 1} of ${QUIZ.length}`;
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
   Gemini calls
   ============================================================ */
async function geminiText(prompt) {
  const res = await fetch(`${API_BASE}/${state.textModel}:generateContent?key=${encodeURIComponent(state.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
    }),
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res));
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return JSON.parse(text);
}

async function geminiImage(prompt) {
  const res = await fetch(`${API_BASE}/${state.imageModel}:generateContent?key=${encodeURIComponent(state.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res));
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("The image model returned no image.");
  return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
}

async function apiErrorMessage(res) {
  let msg = `API error (${res.status})`;
  try {
    const j = await res.json();
    if (j?.error?.message) msg += ": " + j.error.message;
  } catch { /* keep generic message */ }
  if (res.status === 400 || res.status === 403) msg += " — check your API key in Settings.";
  if (res.status === 404) msg += " — check the model name in Settings.";
  return msg;
}

function levelInstruction() {
  if (!state.level || state.level === "ANY") {
    return "Write all explanations in clear, natural English suitable for any learner.";
  }
  return `The learner's CEFR level is ${state.level}. Write every definition, note and example using vocabulary and grammar that a ${state.level} learner can understand comfortably. ${LEVEL_DESC[state.level]}`;
}

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

/* ============================================================
   Lookup flow
   ============================================================ */
async function lookup(word) {
  word = word.trim();
  if (!word) return;
  if (!state.apiKey) { show("apikey"); return; }

  $("lookupError").textContent = "";
  $("entry").classList.add("hidden");
  $("loading").classList.remove("hidden");
  $("loadingMsg").textContent = `Looking up “${word}”…`;
  $("lookupBtn").disabled = true;

  try {
    const entry = await geminiText(lookupPrompt(word));
    entry.savedAt = Date.now();
    entry.level = state.level || "ANY";
    state.currentEntry = entry;
    renderEntry(entry);
    saveToBook(entry);
    loadEntryImage(entry); // async, fills in when ready
  } catch (err) {
    $("lookupError").textContent = err.message || String(err);
  } finally {
    $("loading").classList.add("hidden");
    $("lookupBtn").disabled = false;
  }
}

async function loadEntryImage(entry) {
  $("imgLoading").classList.remove("hidden");
  $("entryImg").classList.add("hidden");
  $("imgReveal").classList.add("hidden");
  try {
    const prompt = `Create one clear, friendly illustration with no words or letters in it. ${entry.imagePrompt || `A simple scene that visually explains the meaning of the English word "${entry.word}".`}`;
    const dataUrl = await geminiImage(prompt);
    if (state.currentEntry === entry) {
      $("entryImg").src = dataUrl;
      $("entryImg").classList.remove("hidden");
      $("imgLoading").classList.add("hidden");
    }
  } catch (err) {
    if (state.currentEntry === entry) {
      $("imgLoading").innerHTML = `<p>Could not draw the picture.<br><span class="error">${escapeHtml(err.message || String(err))}</span></p>`;
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

  // reveal panel content (shown when the picture is clicked)
  $("revealWord").textContent = e.word || "";
  $("revealEn").textContent = e.shortEnglish || (e.definitions?.[0]?.definition ?? "");
  $("revealKo").textContent = e.koreanExplanation || "";
  $("imgReveal").classList.add("hidden");

  $("entry").classList.remove("hidden");
}

// Picture click → show English + Korean explanation; back button returns to picture.
$("entryImg").addEventListener("click", () => $("imgReveal").classList.remove("hidden"));
$("revealBackBtn").addEventListener("click", () => $("imgReveal").classList.add("hidden"));

$("lookupBtn").addEventListener("click", () => lookup($("wordInput").value));
$("wordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookup($("wordInput").value);
});
$("saveEntryBtn").addEventListener("click", () => {
  if (state.currentEntry) {
    saveToBook(state.currentEntry);
    $("saveEntryBtn").textContent = "★ Saved to wordbook";
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
  book[(entry.word || "").toLowerCase()] = entry;
  localStorage.setItem(LS.BOOK, JSON.stringify(book));
}

function deleteFromBook(key) {
  const book = getBook();
  delete book[key];
  localStorage.setItem(LS.BOOK, JSON.stringify(book));
  renderBook(currentTab);
}

let currentTab = "words";

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
  const entries = bookEntries();
  if (!entries.length) {
    box.innerHTML = `<div class="book-empty">Your wordbook is empty.<br>Look up a word in the Dictionary and it will be saved here automatically.</div>`;
    return;
  }

  box.innerHTML = entries.map(([key, e]) => {
    let body = "";
    if (tab === "words") {
      const d = e.definitions?.[0];
      body = d ? `${escapeHtml(d.definition)}${d.example ? ` <em>“${escapeHtml(d.example)}”</em>` : ""}` : "";
    } else if (tab === "etymology") {
      body = escapeHtml(e.etymology || "No etymology saved.");
    } else if (tab === "idioms") {
      body = (e.idioms || []).map((i) =>
        `<div><strong>${escapeHtml(i.phrase)}</strong> — ${escapeHtml(i.meaning)}</div>`).join("") || "No idioms saved.";
    } else if (tab === "synonyms") {
      body = (e.synonyms || []).map((s) =>
        `<div><strong>${escapeHtml(s.word)}</strong> — ${escapeHtml(s.note)}</div>`).join("") || "No synonyms saved.";
    } else if (tab === "sentences") {
      body = (e.similarSentences || []).map((s) => `<div>• ${escapeHtml(s)}</div>`).join("") || "No sentences saved.";
    }
    const date = e.savedAt ? new Date(e.savedAt).toLocaleDateString() : "";
    return `
      <div class="book-item">
        <div class="bi-head">
          <h3 data-word="${escapeHtml(key)}">${escapeHtml(e.word)}</h3>
          <span class="bi-meta">${escapeHtml(e.partOfSpeech || "")} · ${escapeHtml(e.level || "")} · ${date}</span>
          <button class="bi-del" data-del="${escapeHtml(key)}">delete</button>
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
  state.currentEntry = entry;
  show("lookup");
  $("wordInput").value = entry.word;
  $("lookupError").textContent = "";
  renderEntry(entry);
  loadEntryImage(entry);
}

/* ============================================================
   Settings
   ============================================================ */
function fillSettings() {
  $("settingsKeyInput").value = state.apiKey;
  $("textModelInput").value = state.textModel;
  $("imageModelInput").value = state.imageModel;
  $("settingsMsg").textContent = "";
}

$("settingsSaveKeyBtn").addEventListener("click", () => {
  if (saveKey($("settingsKeyInput").value)) $("settingsMsg").textContent = "API key updated.";
  else $("settingsMsg").textContent = "That doesn't look like a valid API key.";
});
$("textModelInput").addEventListener("change", () => {
  state.textModel = $("textModelInput").value.trim() || DEFAULT_TEXT_MODEL;
  localStorage.setItem(LS.TEXT_MODEL, state.textModel);
  $("settingsMsg").textContent = "Text model updated.";
});
$("imageModelInput").addEventListener("change", () => {
  state.imageModel = $("imageModelInput").value.trim() || DEFAULT_IMAGE_MODEL;
  localStorage.setItem(LS.IMAGE_MODEL, state.imageModel);
  $("settingsMsg").textContent = "Image model updated.";
});
$("retakeTestBtn").addEventListener("click", startQuiz);
$("clearBookBtn").addEventListener("click", () => {
  if (confirm("Delete ALL saved words? This cannot be undone.")) {
    localStorage.removeItem(LS.BOOK);
    $("settingsMsg").textContent = "Wordbook cleared.";
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
