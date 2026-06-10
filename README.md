# EngWord — Leveled English Dictionary

A personal English learner's dictionary web app powered by the Google Gemini API.

## Features

- **Level check (A1–C2)** — a short 8-question quiz estimates your CEFR level, and every
  explanation is written at that level. Press **`h`** on the test screen to skip the quiz
  and use the dictionary without a level.
- **Collins-style definitions** — full natural sentences that explain the word in use
  (e.g. *"If you persevere with something, you keep trying and do not give up."*).
- **Longman-style synonyms** — each synonym comes with a nuance note and an example sentence.
- **Etymology, idioms, and similar sentences** for every word.
- **English-only explanations** — Korean never appears in the entry itself.
- **AI picture for every word** — generated with the Gemini image model
  (`gemini-3.1-flash-image` by default). **Click the picture** to reveal the meaning in
  both **English and Korean**.
- **My Wordbook** — every word you look up is saved automatically (browser localStorage)
  with five review tabs: Wordbook, Etymology, Idioms, Synonyms, Similar Sentences.
  Saved entries re-open instantly without another API call.
- **Bring your own API key** — the key is entered by the user, stored only in the browser,
  and sent only to Google's API. Text and image model names can be changed in Settings.

## Run it

No build step. Either open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

On first launch the app asks for your Gemini API key
(get one free at https://aistudio.google.com/apikey), then runs the level quiz.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App layout: key setup, level test, dictionary, wordbook, settings |
| `styles.css` | All styling |
| `app.js` | Quiz logic, Gemini API calls, entry rendering, wordbook storage |
