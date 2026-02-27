#!/usr/bin/env node
/**
 * Weekly Digest Sender
 *
 * Queries significant items from the past 7 days, builds an HTML digest,
 * and sends to all confirmed subscribers via Resend.
 *
 * Usage: node scripts/send-digest.mjs [--dry-run]
 * Env: RESEND_API_KEY, NEXT_PUBLIC_SITE_URL
 */

import { loadEnv } from "./lib/env.mjs";
import { createAdminClient } from "./lib/supabase-admin.mjs";

loadEnv();

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://comox-valley-council-watch.vercel.app";
const FROM = "Comox Valley Council Watch <digest@comox-valley-council-watch.vercel.app>";
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("RESEND_API_KEY not set");

  const { Resend } = await import("resend");
  const resend = new Resend(resendKey);
  const supabase = createAdminClient();

  // Items from the past 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select(
      `id, title, summary, impact, is_significant,
       categories,
       meetings!inner(date, municipalities!inner(short_name)),
       public_feedback(feedback_count, sentiment_summary)`
    )
    .gte("meetings.date", since)
    .not("summary", "is", null)
    .order("is_significant", { ascending: false })
    .limit(20);

  if (itemsError) throw new Error(`Items query failed: ${itemsError.message}`);

  // Filter to significant or actionable items
  const digestItems = (items ?? []).filter((item) => {
    const impact = item.impact?.toLowerCase() ?? "";
    const isActionable =
      !impact.startsWith("no direct") &&
      !impact.startsWith("no immediate") &&
      !impact.startsWith("no impact");
    return item.is_significant || isActionable;
  });

  if (digestItems.length === 0) {
    console.error("No significant items in the past 7 days. Skipping digest.");
    return;
  }

  // Group by municipality
  const byMunicipality = new Map();
  for (const item of digestItems) {
    const mun = item.meetings?.municipalities?.short_name ?? "Comox Valley";
    if (!byMunicipality.has(mun)) byMunicipality.set(mun, []);
    byMunicipality.get(mun).push(item);
  }

  const munColors = {
    Courtenay: "#1d4ed8",
    Comox: "#065f46",
    CVRD: "#92400e",
    Cumberland: "#6d28d9",
  };

  // Build email HTML
  const weekOf = new Date().toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const munSections = Array.from(byMunicipality.entries())
    .map(([mun, munItems]) => {
      const color = munColors[mun] ?? "#374151";
      const itemHtml = munItems
        .map((item) => {
          const fb = Array.isArray(item.public_feedback)
            ? item.public_feedback[0]
            : item.public_feedback;
          const fbNote =
            fb?.feedback_count > 0
              ? `<p style="font-size:12px;color:#6b7280;margin:4px 0 0;font-family:system-ui,sans-serif;">
                  ${fb.feedback_count} resident${fb.feedback_count === 1 ? "" : "s"} wrote in about this
                </p>`
              : "";
          const impactHtml =
            item.impact &&
            !item.impact.toLowerCase().startsWith("no direct") &&
            !item.impact.toLowerCase().startsWith("no immediate") &&
            !item.impact.toLowerCase().startsWith("no impact")
              ? `<p style="font-size:13px;color:#2d6a4f;font-weight:600;margin:4px 0;font-family:system-ui,sans-serif;">${item.impact}</p>`
              : "";

          return `
            <div style="border-left:3px solid #e5e7eb;padding:8px 0 8px 16px;margin-bottom:16px;">
              <a href="${SITE_URL}/item/${item.id}" style="font-size:16px;font-weight:700;color:#1a1a1a;text-decoration:none;font-family:Georgia,serif;line-height:1.3;">
                ${item.title}
              </a>
              ${impactHtml}
              <p style="font-size:14px;color:#4b5563;margin:4px 0 0;line-height:1.5;font-family:system-ui,sans-serif;">
                ${item.summary ?? ""}
              </p>
              ${fbNote}
            </div>
          `;
        })
        .join("");

      return `
        <div style="margin-bottom:32px;">
          <h2 style="font-size:14px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.05em;margin:0 0 16px;font-family:system-ui,sans-serif;">
            ${mun}
          </h2>
          ${itemHtml}
        </div>
      `;
    })
    .join("");

  // Fetch confirmed subscribers
  const { data: subscribers, error: subError } = await supabase
    .from("subscribers")
    .select("email, unsubscribe_token")
    .eq("confirmed", true);

  if (subError) throw new Error(`Subscribers query failed: ${subError.message}`);
  if (!subscribers?.length) {
    console.error("No confirmed subscribers. Nothing to send.");
    return;
  }

  console.error(
    `Sending digest (${digestItems.length} items) to ${subscribers.length} subscriber${subscribers.length === 1 ? "" : "s"}${DRY_RUN ? " (DRY RUN)" : ""}...`
  );

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const unsubUrl = `${SITE_URL}/api/unsubscribe?token=${sub.unsubscribe_token}`;
    const html = buildDigestHtml({ weekOf, munSections, unsubUrl, itemCount: digestItems.length });

    if (DRY_RUN) {
      console.error(`  [dry-run] Would send to: ${sub.email}`);
      sent++;
      continue;
    }

    try {
      await resend.emails.send({
        from: FROM,
        to: sub.email,
        subject: `Comox Valley Council Watch — Week of ${weekOf}`,
        html,
      });
      sent++;
    } catch (err) {
      failed++;
      console.error(`  Failed to send to ${sub.email}:`, err.message);
    }

    // Small delay to avoid Resend rate limits
    await new Promise((r) => setTimeout(r, 100));
  }

  console.error(`\nDigest sent: ${sent} succeeded, ${failed} failed.`);
}

function buildDigestHtml({ weekOf, munSections, unsubUrl, itemCount }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f7f4;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;font-family:Georgia,serif;color:#1a1a1a;">

  <div style="border-top:4px solid #2d6a4f;padding-top:24px;margin-bottom:24px;">
    <h1 style="font-size:22px;font-weight:700;margin:0 0 4px;">Comox Valley Council Watch</h1>
    <p style="color:#6b7280;margin:0;font-family:system-ui,sans-serif;font-size:14px;">
      Week of ${weekOf} · ${itemCount} item${itemCount === 1 ? "" : "s"} that matter
    </p>
  </div>

  ${munSections}

  <div style="border-top:1px solid #e5e7eb;padding-top:20px;margin-top:8px;">
    <a href="${SITE_URL}" style="display:inline-block;background:#2d6a4f;color:white;text-decoration:none;padding:10px 20px;border-radius:8px;font-family:system-ui,sans-serif;font-weight:600;font-size:14px;margin-bottom:16px;">
      View full feed
    </a>
    <p style="font-size:12px;color:#9ca3af;font-family:system-ui,sans-serif;margin:0;">
      You're receiving this because you subscribed at comox-valley-council-watch.vercel.app.<br/>
      <a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe</a>
    </p>
  </div>

</div>
</body>
</html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
