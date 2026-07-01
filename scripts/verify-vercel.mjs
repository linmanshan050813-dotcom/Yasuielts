const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";

const SAMPLE_ESSAY = `Technology has transformed modern life in ways that are both helpful and overwhelming. On one hand, smartphones and online services allow people to communicate instantly and complete daily tasks more efficiently.

However, many argue that constant connectivity creates stress and reduces face-to-face interaction. This may lead to poorer concentration and less meaningful relationships.

In my view, technology itself is not the main problem. The difficulty arises when people fail to manage how they use it.`;

const SAMPLE_QUESTION =
  "Some people believe that technology has made our lives more complicated. Others think it has made life easier. Discuss both views and give your own opinion.";

const STEPS = [
  "task_response",
  "coherence_cohesion",
  "lexical_resource",
  "grammar",
  "score",
];

async function check(name, fn) {
  try {
    await fn();
    console.log(`OK  ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  console.log(`Verifying ${BASE}\n`);
  let passed = 0;
  let total = 0;

  const run = async (name, fn) => {
    total += 1;
    if (await check(name, fn)) passed += 1;
  };

  await run("GET / portal", async () => {
    const res = await fetch(`${BASE}/`);
    const text = await res.text();
    if (!res.ok) throw new Error(`status ${res.status}`);
    if (!text.includes("__bundler")) throw new Error("missing portal bundler marker");
  });

  await run("GET /grading", async () => {
    const res = await fetch(`${BASE}/grading`);
    const text = await res.text();
    if (!res.ok) throw new Error(`status ${res.status}`);
    if (!text.includes("app.js") && !text.includes("app.css")) {
      throw new Error("missing grading assets");
    }
  });

  await run("GET /mock/sampleFeedback.json", async () => {
    const res = await fetch(`${BASE}/mock/sampleFeedback.json`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    if (!data.annotations) throw new Error("invalid mock payload");
  });

  await run("POST /api/extract-text", async () => {
    const form = new FormData();
    form.append("file", new Blob(["Hello essay"], { type: "text/plain" }), "essay.txt");
    form.append("purpose", "essay");
    const res = await fetch(`${BASE}/api/extract-text`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `status ${res.status}`);
    if (!data.essay_text) throw new Error("missing essay_text");
  });

  let sessionId = "";
  await run("POST /api/grade/session + steps + finalize", async () => {
    const sessionRes = await fetch(`${BASE}/api/grade/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        essay_text: SAMPLE_ESSAY,
        task_type: "Task 2",
        question: SAMPLE_QUESTION,
        locale: "zh",
      }),
    });
    const sessionData = await sessionRes.json();
    if (!sessionRes.ok) throw new Error(sessionData.error ?? `status ${sessionRes.status}`);
    sessionId = sessionData.session_id;
    if (!sessionId) throw new Error("missing session_id");

    for (const step of STEPS) {
      const stepRes = await fetch(`${BASE}/api/grade/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, step }),
      });
      const stepData = await stepRes.json();
      if (!stepRes.ok) throw new Error(stepData.error ?? `step ${step} failed`);
    }

    const finalizeRes = await fetch(`${BASE}/api/grade/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const result = await finalizeRes.json();
    if (!finalizeRes.ok) throw new Error(result.error ?? `status ${finalizeRes.status}`);
    if (!result.annotations || result.scores?.overall_band == null) {
      throw new Error("invalid feedback response");
    }
    console.log(`    overall_band=${result.scores.overall_band}, annotations=${result.annotations.length}`);
  });

  console.log(`\n${passed}/${total} checks passed`);
  if (passed !== total) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
