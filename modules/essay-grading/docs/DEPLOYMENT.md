# Deployment

This app is a **Node.js + Express** server that serves the frontend and runs API routes (`/api/extract-text`, `/api/essay-feedback`). Feedback generation can take **30–90+ seconds** because it calls the LLM several times per submission.

## Recommended: Render or Railway

These platforms fit a long-running Express process with file uploads and slow API calls.

### Build and start (already in `package.json`)

```bash
npm install
npm run build
npm start
```

- **Build**: `npm run build` — frontend → `dist/public/`, backend → `dist/api/`, prompts → `dist/grading/prompts/`
- **Start**: `node dist/api/server.js`
- Express serves static files from `dist/public/` (production) or `src/web/` (development)

### Render (Web Service)

| Setting | Value |
|---------|--------|
| Environment | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Node version | 20+ |

**Environment variables:**

| Variable | Required |
|----------|----------|
| `OPENAI_API_KEY` | Yes |
| `OPENAI_MODEL` | No (defaults in code) |
| `PORT` | Set automatically by Render |

### Railway

Same commands as Render. Add `OPENAI_API_KEY` in Variables. Railway injects `PORT`.

### Local production smoke test

```powershell
npm install
npm run build
npm start
```

Open `http://localhost:3101` (or the `PORT` from `.env`).

---

## Not recommended: Vercel (without a rewrite)

Vercel is optimized for **static sites** and **short-lived Serverless Functions**. This MVP uses:

- A persistent Express app
- `multer` file uploads
- Multi-step LangGraph + OpenAI calls (often > 10s)

Deploying as-is on Vercel will likely hit **timeouts** and requires restructuring.

### What Vercel would require

1. Split API into Serverless Functions under `/api/` (e.g. `api/essay-feedback.ts`, `api/extract-text.ts`).
2. Replace `app.listen` with exported handlers compatible with `@vercel/node`.
3. Handle file uploads within function body limits and timeout caps (Pro plan may still be tight for 3+ LLM calls).
4. Serve static frontend as Vercel static output; point `index.html` script paths accordingly.
5. Increase `maxDuration` in `vercel.json` (still may be insufficient for full feedback graph).

For a course MVP, **Render or Railway is simpler and more reliable**.

---

## Files layout after `npm run build`

```text
dist/backend/          Compiled Express server + lib
dist/shared/           Shared types used by backend
src/frontend/          index.html, styles.css (served as static)
src/frontend/dist/     Compiled frontend JS
src/backend/lib/prompts/prompt.md   Read at runtime from project root
mock/                  Optional sample JSON
```

Ensure `prompt.md` and frontend assets are included in the deployment bundle (they live under `src/`, not `dist/`).
