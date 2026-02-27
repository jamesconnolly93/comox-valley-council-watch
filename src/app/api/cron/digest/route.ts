import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const maxDuration = 60;

function runScript(scriptPath: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath], {
      env: { ...process.env },
      cwd: process.cwd(),
    });
    const chunks: string[] = [];
    child.stdout.on("data", (d) => chunks.push(d.toString()));
    child.stderr.on("data", (d) => chunks.push(d.toString()));
    child.on("close", (code) => {
      resolve({ ok: code === 0, output: chunks.join("").slice(-800) });
    });
    child.on("error", (err) => resolve({ ok: false, output: err.message }));
  });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runScript(
    path.join(process.cwd(), "scripts", "send-digest.mjs")
  );

  return NextResponse.json({ ok: result.ok, ran: new Date().toISOString(), output: result.output });
}
