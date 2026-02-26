#!/usr/bin/env node
/**
 * Unit test for decision extraction logic.
 * Run: node scripts/test-decision-extraction.mjs
 */

function extractDecisionFromActions(content) {
  if (!content || typeof content !== "string") return null;
  const match = content.match(/Actions:\s*([\s\S]*?)(?=\n\s*\n|$)/i);
  return match ? match[1].trim() || null : null;
}

const tests = [
  {
    name: "Financial Plan Bylaw - has Actions line",
    content: `The City's five-year financial plan was presented.

Actions: Council gave first, second and third reading to 2026–2030 Financial Plan Bylaw No. 3211, 2026.`,
    expected:
      "Council gave first, second and third reading to 2026–2030 Financial Plan Bylaw No. 3211, 2026.",
  },
  {
    name: "RCMP Quarterly Report - no Actions line",
    content: `Staff presented the quarterly policing report.

Council received the report for information. No formal action was taken.`,
    expected: null,
  },
  {
    name: "MRDT - no Actions line",
    content: `A presentation was received on the MRDT program.

The presentation was received. No formal action was taken at this meeting.`,
    expected: null,
  },
  {
    name: "Actions with space after colon",
    content: "Actions: Council approved the plan.",
    expected: "Council approved the plan.",
  },
  {
    name: "Actions at end of content",
    content: "Intro text.\n\nActions: Council deferred the matter.",
    expected: "Council deferred the matter.",
  },
];

let passed = 0;
let failed = 0;
for (const t of tests) {
  const got = extractDecisionFromActions(t.content);
  const ok = got === t.expected;
  if (ok) {
    console.log(`✓ ${t.name}`);
    passed++;
  } else {
    console.log(
      `✗ ${t.name}: expected ${JSON.stringify(t.expected)}, got ${JSON.stringify(got)}`
    );
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
