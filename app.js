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
};

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
  currentView: "",
  // practice
  flashDeck: [],
  flashIndex: 0,
  aiQuiz: [],
  aiQuizIndex: 0,
  aiQuizScore: 0,
  // tutor
  tutorHistory: [],
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
  $("levelBadge").textContent = "Level " + (lv ? (lv === "ANY" ? "·" : lv) : "—");
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
  $("loadingMsg").textContent = `Looking up “${word}”…`;
  $("lookupBtn").disabled = true;

  try {
    const entry = await aiText(lookupPrompt(word));
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
  $("imgLoading").innerHTML = `<div class="spinner small"></div><p>Drawing the word…</p>`;
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
    $("coachWordHint").textContent = `Try writing a sentence with “${state.currentEntry.word}”.`;
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
    $("wotdBtn").textContent = "Open in dictionary →";
  } else {
    $("wotdWord").textContent = "—";
    $("wotdTeaser").textContent = "A fresh word picked for your level, every day.";
    $("wotdBtn").textContent = "Reveal today's word";
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
  $("wotdTeaser").textContent = "Picking a word for you…";
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
   Practice — spaced-repetition flashcards
   Leitner boxes: 0..4 → review after 0, 1, 3, 7, 16 days
   ============================================================ */
const SRS_DAYS = [0, 1, 3, 7, 16];

function dueEntries() {
  const now = Date.now();
  return bookEntries().filter(([, e]) => !e.srs || (e.srs.due || 0) <= now);
}

function renderPracticeHome() {
  $("practiceHome").classList.remove("hidden");
  $("flashArea").classList.add("hidden");
  $("quizArea").classList.add("hidden");
  $("practiceError").textContent = "";
  const total = bookEntries().length;
  const due = dueEntries().length;
  $("flashDueInfo").textContent = total
    ? `${due} of ${total} saved words are due for review.`
    : "Save some words in the Dictionary first.";
  $("quizWordsInfo").textContent = total
    ? `Quiz will be built from your ${Math.min(total, 8)} most recent words.`
    : "Save some words in the Dictionary first.";
}

function startFlashcards() {
  const due = dueEntries();
  const deck = (due.length ? due : bookEntries()).map(([key, e]) => ({ key, e }));
  if (!deck.length) {
    $("practiceError").textContent = "Your wordbook is empty — look up some words first.";
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
  $("flashCount").textContent = `Card ${state.flashIndex + 1} of ${state.flashDeck.length}`;
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
  const entries = bookEntries().slice(0, 8);
  if (!entries.length) {
    $("practiceError").textContent = "Your wordbook is empty — look up some words first.";
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
  fb.textContent = (idx === q.answerIndex ? "✓ Correct! " : "✗ Not quite. ") + (q.explanation || "");
  fb.classList.remove("hidden");
  $("aiQuizNextBtn").classList.remove("hidden");
  $("aiQuizNextBtn").textContent = state.aiQuizIndex + 1 < state.aiQuiz.length ? "Next →" : "See result →";
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
      : `<li>Nothing to fix — great job! 🎉</li>`;
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
  const typing = appendChat("bot typing", "Thinking…");
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
