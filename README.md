# EngWord — Smart English Dictionary & Tutor

A professional, personal English learner's dictionary and study suite powered by the
Google Gemini API. No build step — plain HTML/CSS/JS.

## Dictionary

- **Level check (A1–C2)** — a short 8-question placement quiz; every explanation is
  written at your level. Press **`h`** on the test screen to skip the quiz and use the
  app without a level.
- **Collins-style definitions** — full natural sentences that explain the word in use.
- **Longman-style synonyms** — each synonym comes with a nuance note and an example.
- **Etymology, idioms, and similar sentences** for every word.
- **English-only explanations** — Korean never appears in the entry itself.
- **AI picture for every word** (`gemini-3.1-flash-image`). **Click the picture** to
  reveal the meaning in both **English and Korean**.
- **Listen** — browser text-to-speech pronunciation for headwords and flashcards.
- **Word of the Day** — one level-appropriate new word daily, cached locally.

## Study suite

- **Practice → Flashcards** — spaced-repetition review (Leitner boxes: 10 min / 1 / 3 / 7 / 16 days)
  of your saved words; grade yourself Again / Good / Easy.
- **Practice → AI Quiz** — Gemini writes a fresh multiple-choice quiz from your own
  wordbook (meanings, synonyms, fill-in-the-blank) with explanations per answer.
- **Writing Coach** — paste or write English text; get a corrected version, every fix
  explained at your level, a 1–10 naturalness score, a native-sounding rewrite and a
  personalized tip.
- **AI Tutor** — level-aware chat for grammar, word choice and nuance questions.
- **My Wordbook** — every lookup is saved automatically (browser localStorage) with five
  review tabs: Wordbook, Etymology, Idioms, Synonyms, Similar Sentences. Saved entries
  re-open without another API call.

## Models & API key

- Bring your own Gemini API key (free at https://aistudio.google.com/apikey). It is
  stored only in your browser and sent only to Google's API.
- Text model: **`gemini-3.1-flash-lite`** (default) · Image model: **`gemini-3.1-flash-image`**.
  Both can be changed in Settings.

## Run it

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or simply open `index.html` in a browser.

## Files

| File | Purpose |
|------|---------|
| `index.html` | All views: onboarding, level test, dictionary, practice, coach, tutor, wordbook, settings |
| `styles.css` | Full design system (Inter + Source Serif 4, indigo theme) |
| `app.js` | Quiz logic, Gemini calls, SRS flashcards, AI quiz, coach, tutor, wordbook storage |
