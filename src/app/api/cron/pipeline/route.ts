import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

// Vercel Pro max; cron jobs on Hobby have 10s limit (use external runner for full pipeline)
export const maxDuration = 300;

function runScript(scriptPath: string, timeoutMs = 60_000): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath], {
      env: { ...process.env },
      cwd: process.cwd(),
    });

    const chunks: string[] = [];
    child.stdout.on("data", (d) => chunks.push(d.toString()));
    child.stderr.on("data", (d) => chunks.push(d.toString()));

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, output: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      const output = chunks.join("").slice(-800);
      resolve({ ok: code === 0, output });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: err.message });
    });
  });
}

export async function GET(req: NextRequest) {
  // Verify secret — Vercel sends it via Authorization header or x-cron-secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;

  const isVercelCron = authHeader === `Bearer ${expectedSecret}`;
  const isManual = cronSecret === expectedSecret;

  if (!expectedSecret || (!isVercelCron && !isManual)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scriptsDir = path.join(process.cwd(), "scripts");

  // NOTE: CVRD scraper requires Playwright (browser) — not available in Vercel functions.
  // Run it separately via `npm run scrape:cvrd` on a machine with browsers installed.
  const steps = [
    { name: "scrape:courtenay", file: "scrape-courtenay-highlights.mjs", timeoutMs: 30_000 },
    { name: "scrape:comox", file: "scrape-comox.mjs", timeoutMs: 60_000 },
    { name: "scrape:cumberland", file: "scrape-cumberland.mjs", timeoutMs: 60_000 },
    { name: "process:ai", file: "process-ai-summaries.mjs", timeoutMs: 120_000 },
    { name: "process:feedback", file: "process-feedback.mjs", timeoutMs: 60_000 },
  ];

  const results: Record<string, { ok: boolean; output: string }> = {};

  for (const step of steps) {
    results[step.name] = await runScript(path.join(scriptsDir, step.file), step.timeoutMs);
  }

  const allOk = Object.values(results).every((r) => r.ok);

  return NextResponse.json({
    ok: allOk,
    ran: new Date().toISOString(),
    note: "CVRD scraper (Playwright) skipped — run manually or via GitHub Actions",
    results,
  });
}
