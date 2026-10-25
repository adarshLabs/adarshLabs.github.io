// Cloudflare Worker: optional AI backend for the "Ask about my work" assistant.
// Holds the Gemini API key server-side so it never reaches the browser.
// Can read Adarsh's public GitHub repos through two tools; set an optional GITHUB_TOKEN secret to avoid API rate limits.
const ALLOWED_ORIGIN = "https://adarshlabs.github.io";
const GH_OWNER = "adarshLabs";

const PROFILE = `You answer questions about Adarsh Tiwari, an applied AI engineer, on his portfolio site.
Only use the facts below and what you read from his public GitHub repos with the tools. If something isn't covered, say you don't have that information and suggest the contact links. Never invent employers, dates, grades or numbers. Only answer questions about his education, career and work; politely decline personal questions (age, family, relationships, salary, religion, politics, health, phone number, hobbies and similar). Answer in at most 120 words, even for broad questions; for 'all projects' or 'whole career' questions give a short bulleted summary of the top items and invite a follow-up question. Include the relevant GitHub link.

Code questions: for anything about code in his public repos (where something is implemented, how a file works, what a repo contains), call list_repo_files, then read_file on the relevant files, and answer from what you read. Cite exact file links like https://github.com/adarshLabs/<repo>/blob/<branch>/<path>. Never claim to have read a file you did not read, and never guess file names.
Private projects (portfoliobuddy, AI-Driven ETL) have no public code: describe them from the facts below without links, and say the code is private if asked for files.

- GPT-2 from scratch (https://github.com/adarshLabs/gpt2-from-scratch): decoder-only transformer, own attention, masks, RoPE, pre-norm blocks, training and sampling. 124M params (12L, 12H, d768, ctx 256), TinyStories 10k steps ~61M tokens ~5h Kaggle T4, val loss 1.5647, perplexity 4.78. KV cache 1.27x->1.64x on T4 (200->2000 tokens), 5.7x on Apple MPS; removes ~240x attention arithmetic but wall clock not dominated by it. LoRA by hand (no PEFT): rank 8, alpha 16, q_proj+v_proj, 294,912 of 123,998,545 params (0.24%), Shakespeare perplexity ~1255 -> ~291 (4.31x) in 500 steps, 19.9 min on MacBook Air; identical to base at init.
- Research paper "Do LLMs Actually Search? Random Search Is a Missing Baseline in LLM-Guided NAS" (https://github.com/adarshLabs/llm-guided-nas), sole author: Adarsh Tiwari (solo). Never mention co-authors. audit + controlled study on NAS-Bench-201 (15,625 archs). None of 4 closely audited papers compares to random search. 100 random archs reach 93.77% vs global best 94.37%. Prompt-format ablation: NATS string, adjacency and prose encodings gave bit-identical trajectories; 39 of 45 calls repeated proposals. Plan: arXiv Nov 2026, ICML 2027.
- Education: M.Tech, Computer Science & Engineering, IIT Kharagpur, completed 2025 (2023-2025), CGPA 8.76. B.Tech, Computer Science & Engineering, Gurukul Kangri Vishwavidyalaya, completed 2023 (2019-2023), CGPA 8.70. He has completed both degrees; never say he is pursuing or currently studying. GATE 2023 All India Rank 484 (CSE, score 694). 800+ LeetCode and 300+ CodeChef problems solved.
- M.Tech thesis (IIT Kharagpur, 2025): NAS for morph-attack detection using MIGO (Multivariate Information-Geometric Optimisation) with position-aware path encoding and self-supervised performance predictors; 6 morphing datasets, 132 GPU-hours, 81.67% cross-dataset accuracy; compared DARTS, STGS, GRMC and MIGO-NAS, GRMC generalised best on the hardest morph data.
- Career (based in Bengaluru, India; ~1.25 years in industry): Senior Software Engineer, HCLTech Bengaluru, Aug 2025-present, client Lloyds Banking Group UK. Data platform work, not AI work: migrated 20+ TB of financial data to BigQuery via GCS, Pub/Sub and DAG-orchestrated pipelines; redesigned partitioning and schema for query performance; Terraform, Docker, Harness CI/CD. Before that, Academic Trainee - AI Engineering, HCLTech, May-Jul 2025: shipped three GenAI systems for internal use: LangChain + ChromaDB RAG assistant over internal docs; FAISS-backed SOP generator over incident history, targeting the ~40% of tickets that were general issues already covered by internal docs (a sizing estimate of addressable tickets, not a measured deflection rate; never claim it cut human intervention); e-commerce copywriting agent. Owned retrieval design, embedding strategy and vector-store selection. Research Intern, IIT Kharagpur, May-Jul 2024: NAS for morph-attack detection in face recognition, OFA search space, 2.39% test error on CIFAR-10. Do not describe the GenAI work as current.
- glassbox-agent (https://github.com/adarshLabs/glassbox-agent): from-scratch ReAct tool agent, no LangChain, step cap, refusal path. 10-task eval with 3 designed failures. Run 1 had a scorer bug (printed 8/10, true 7/10); Run 2 10/10; audit confirmed no hidden crashes.
- portfoliobuddy (private): NSE paper-trading engine, momentum + low vol, market filter, Indian costs and tax, daily GitHub Actions. Backtest Feb 2013-Sep 2026 ~16%/yr, worst drawdown ~-19% vs Nifty 100 10.9%/-38%. Deflated Sharpe, PBO, walk-forward. Live paper since 5 Oct 2026. No LLM decides trades.
- AI-Driven ETL (private): Excel mapping doc -> validated SQL via agentic RAG -> dbt project; unit/property/golden/contract/adversarial/e2e tests, GKE.
- QueryX RAG chatbot (https://github.com/adarshLabs/KnowledgeRAG): PDFs, cited answers, Gemini, ChromaDB, LangGraph, Streamlit.
- ScalarGrad (https://github.com/adarshLabs/ScalarGrad) autodiff engine; ai-playground (https://github.com/adarshLabs/ai-playground) NumPy MLP, batchnorm, layernorm, dropout, tests.
- Copywriting agents (https://github.com/adarshLabs/copywriting_ecommerce_agent), AI SOP Agent (Claude on AWS Bedrock), Field Service Scheduler (4 agents).
- Contact: https://www.linkedin.com/in/adarsh-tiwari-ai , https://github.com/adarshLabs , https://huggingface.co/adarshLab . Interested in applied AI / LLM engineering roles.`;

export default {
  async fetch(request, env, ctx) {
    const cors = { "Access-Control-Allow-Origin": ALLOWED_ORIGIN, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });
    let body;
    try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400, headers: cors }); }
    const question = String(body.question || "").slice(0, 400);
    if (!question) return new Response("Missing question", { status: 400, headers: cors });
    const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
      .map(h => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text || "").slice(0, 800) }] }));

    const today = new Date().toISOString().slice(0, 10);
    const system = `Today's date is ${today}. Any date before today is in the past: he completed his M.Tech (IIT Kharagpur) in 2025 and is not a student now.\n\n${PROFILE}`;
    const contents = [...history, { role: "user", parts: [{ text: question }] }];
    const gh = new GitHubTools(env, ctx);

    // Up to 8 model calls: model fallbacks, tool rounds, and one retry if Gemini returns an empty answer.
    // Free-tier quotas are per model, so try them in order of daily allowance (3.1 Flash-Lite: 500/day).
    // Move on when a model is rate-limited (429), unknown (404), rejects the request (400) or is down (5xx).
    const models = [...new Set([env.GEMINI_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash"].filter(Boolean))];
    // 2.5 models spend thinking tokens from maxOutputTokens unless the budget is 0; 3.x lite models default to minimal thinking.
    const genConfig = id => id.startsWith("gemini-2.5")
      ? { temperature: 0.2, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } }
      : { temperature: 0.2, maxOutputTokens: 1500 };
    let model = 0, answer = "", emptyRetries = 0, reason = "";
    for (let call = 0; call < 8 && !answer; call++) {
      const lastCall = call === 7;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${models[model]}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: [{ functionDeclarations: TOOLS }],
          toolConfig: { functionCallingConfig: { mode: lastCall ? "NONE" : "AUTO" } },
          generationConfig: genConfig(models[model])
        })
      });
      if (!res.ok) {
        const err = await res.text();
        reason = `${models[model]} ${res.status}: ${(err.match(/"message":\s*"([^"]{0,200})/) || [])[1] || ""}`;
        console.error(reason);
        if ([400, 404, 429].includes(res.status) || res.status >= 500) { if (model < models.length - 1) { model++; continue; } break; }
        if (emptyRetries++ < 1) continue; break;
      }
      const cand = (await res.json())?.candidates?.[0];
      const content = cand?.content;
      const parts = content?.parts || [];
      const calls = parts.filter(p => p.functionCall);
      if (calls.length) {
        contents.push(content);
        const responses = [];
        for (const c of calls) responses.push({ functionResponse: { name: c.functionCall.name, response: await gh.run(c.functionCall.name, c.functionCall.args || {}) } });
        contents.push({ role: "user", parts: responses });
        continue;
      }
      answer = parts.map(p => p.text || "").join("").trim();
      if (!answer) { reason = `empty answer (finishReason ${cand?.finishReason || "none"})`; console.error(reason); }
      if (!answer && emptyRetries++ >= 1) break;
    }
    if (!answer) return json({ answer: "", reason }, 502);
    return json({ answer });
  }
};

const TOOLS = [
  { name: "list_repo_files", description: "List the files in one of Adarsh's public GitHub repos (owner adarshLabs). Returns the default branch and file paths. Call with no repo to list his public repos.",
    parameters: { type: "OBJECT", properties: { repo: { type: "STRING", description: "Repo name, e.g. gpt2-from-scratch. Omit to list repos." } } } },
  { name: "read_file", description: "Read a text file from one of Adarsh's public GitHub repos. Long files are truncated.",
    parameters: { type: "OBJECT", properties: { repo: { type: "STRING" }, path: { type: "STRING", description: "File path exactly as returned by list_repo_files" } }, required: ["repo", "path"] } }
];

class GitHubTools {
  constructor(env, ctx) { this.env = env; this.ctx = ctx; }

  // GET with a one-hour edge cache, so repeated questions don't spend GitHub's rate limit.
  async get(url, asJson) {
    const cache = caches.default, key = new Request(url);
    let res = await cache.match(key);
    if (!res) {
      const headers = { "User-Agent": "ask-adarsh-worker", Accept: asJson ? "application/vnd.github+json" : "*/*" };
      if (this.env.GITHUB_TOKEN && url.startsWith("https://api.github.com/")) headers.Authorization = `Bearer ${this.env.GITHUB_TOKEN}`;
      res = await fetch(url, { headers });
      if (!res.ok) return { error: `GitHub returned ${res.status}` };
      res = new Response(res.body, res);
      res.headers.set("Cache-Control", "public, max-age=3600");
      this.ctx?.waitUntil(cache.put(key, res.clone()));
    }
    return asJson ? res.json() : res.text();
  }

  async repos() {
    const list = await this.get(`https://api.github.com/users/${GH_OWNER}/repos?per_page=100&type=owner`, true);
    if (list.error) return list;
    return list.filter(r => !r.private && !r.fork).map(r => ({ name: r.name, branch: r.default_branch, description: r.description || "" }));
  }

  async run(name, args) {
    try {
      const repos = await this.repos();
      if (repos.error) return repos;
      if (name === "list_repo_files" && !args.repo) return { repos };
      const repo = repos.find(r => r.name.toLowerCase() === String(args.repo || "").toLowerCase());
      if (!repo) return { error: `No public repo named "${args.repo}". Public repos: ${repos.map(r => r.name).join(", ")}` };
      if (name === "list_repo_files") {
        const tree = await this.get(`https://api.github.com/repos/${GH_OWNER}/${repo.name}/git/trees/${repo.branch}?recursive=1`, true);
        if (tree.error) return tree;
        const files = (tree.tree || []).filter(t => t.type === "blob").map(t => t.path);
        return { repo: repo.name, branch: repo.branch, files: files.slice(0, 400), truncated: files.length > 400 };
      }
      if (name === "read_file") {
        const path = String(args.path || "");
        if (!path || path.includes("..") || path.startsWith("/")) return { error: "Invalid path" };
        const text = await this.get(`https://raw.githubusercontent.com/${GH_OWNER}/${repo.name}/${repo.branch}/${path.split("/").map(encodeURIComponent).join("/")}`, false);
        if (typeof text !== "string") return text;
        return { url: `https://github.com/${GH_OWNER}/${repo.name}/blob/${repo.branch}/${path}`, content: text.slice(0, 12000), truncated: text.length > 12000 };
      }
      return { error: `Unknown tool ${name}` };
    } catch (e) {
      return { error: "Tool failed" };
    }
  }
}
