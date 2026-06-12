/**
 * EngWord — OpenAI Codex OAuth proxy (Cloudflare Worker)
 * ----------------------------------------------------------------------------
 * OpenAI's auth server (auth.openai.com) does not send CORS headers, so a
 * browser app cannot talk to it directly. This Worker is a thin, allow-listed
 * pass-through that adds CORS so the EngWord web app can run the Codex
 * device-code OAuth flow ("Sign in with ChatGPT", incl. Google login).
 *
 * Deploy (free):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Replace the code with this file, Deploy
 *   3. Copy the Worker URL (e.g. https://engword-oauth.yourname.workers.dev)
 *   4. Paste it into EngWord → Settings → "OAuth proxy URL"
 *
 * It only forwards the three OAuth endpoints below — nothing else.
 */

const UPSTREAM = "https://auth.openai.com";
const ALLOW = new Set([
  "/api/accounts/deviceauth/usercode",
  "/api/accounts/deviceauth/token",
  "/oauth/token",
]);

function withCors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/oai/, ""); // app calls {worker}/oai/<endpoint>
    if (request.method !== "POST" || !ALLOW.has(path)) {
      return withCors(new Response("Not allowed", { status: 403 }));
    }
    const body = await request.text();
    const upstream = await fetch(UPSTREAM + path, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        "Accept": "application/json",
        "User-Agent": "codex-cli",
      },
      body,
    });
    const text = await upstream.text();
    return withCors(new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    }));
  },
};
