# Optional AI backend for the site assistant

The assistant works with no backend: it answers from a knowledge base inside `index.html`.
To upgrade it to free-form AI answers (Gemini free tier, $0):

1. Get a free Gemini API key at https://aistudio.google.com/apikey
2. Create a free Cloudflare account, then Workers & Pages → Create Worker → paste `worker.js` → Deploy.
3. In the Worker's Settings → Variables and Secrets, add a secret `GEMINI_API_KEY`.
4. Copy the Worker URL (e.g. `https://ask-adarsh.<you>.workers.dev`) into `CHAT_ENDPOINT` in `index.html`.

The key stays in Cloudflare and never reaches the browser. If the Worker fails, the page falls back to the local answers.

The assistant can also read code in the public repos (list files, read a file) to answer questions like "where is RoPE implemented?".
GitHub allows 60 unauthenticated API calls an hour, shared across Cloudflare's IPs, so add an optional secret `GITHUB_TOKEN`:
a fine-grained token (github.com/settings/personal-access-tokens) with "Public repositories (read-only)" access and no other permissions.
