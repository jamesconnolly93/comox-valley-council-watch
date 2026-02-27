import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const supabase = adminClient();

  // Upsert subscriber — if already confirmed, just say "you're subscribed"
  const { data: existing } = await supabase
    .from("subscribers")
    .select("id, confirmed")
    .eq("email", email)
    .maybeSingle();

  if (existing?.confirmed) {
    return NextResponse.json({ status: "already_confirmed" });
  }

  // Insert or regenerate confirmation token for unconfirmed
  let token: string;

  if (existing) {
    // Resend confirmation
    const { data: updated } = await supabase
      .from("subscribers")
      .update({ confirmation_token: undefined }) // trigger DB default
      .eq("id", existing.id)
      .select("confirmation_token")
      .single();
    token = updated?.confirmation_token ?? "";
  } else {
    const { data: inserted, error } = await supabase
      .from("subscribers")
      .insert({ email })
      .select("confirmation_token")
      .single();

    if (error) {
      console.error("Subscribe insert error:", error);
      return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
    }
    token = inserted?.confirmation_token ?? "";
  }

  if (!token) {
    return NextResponse.json({ error: "Token generation failed" }, { status: 500 });
  }

  // Send confirmation email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const resend = new Resend(resendKey);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comox-valley-council-watch.vercel.app";
    const confirmUrl = `${siteUrl}/confirm/${token}`;

    await resend.emails.send({
      from: "Comox Valley Council Watch <digest@comox-valley-council-watch.vercel.app>",
      to: email,
      subject: "Confirm your Council Watch subscription",
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
          <div style="border-top: 4px solid #2d6a4f; padding-top: 24px; margin-bottom: 32px;">
            <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin: 0 0 8px;">
              Comox Valley Council Watch
            </h1>
            <p style="color: #6b7280; margin: 0; font-family: system-ui, sans-serif;">
              Never miss a decision that matters to you
            </p>
          </div>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
            Thanks for subscribing! Click the button below to confirm your email address and start receiving weekly digests every Monday morning.
          </p>
          <a href="${confirmUrl}" style="display: inline-block; background: #2d6a4f; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-family: system-ui, sans-serif; font-weight: 600; font-size: 15px; margin-bottom: 24px;">
            Confirm subscription
          </a>
          <p style="font-size: 13px; color: #9ca3af; font-family: system-ui, sans-serif; line-height: 1.5;">
            Or copy this link: <br/>
            <span style="word-break: break-all;">${confirmUrl}</span>
          </p>
          <p style="font-size: 13px; color: #9ca3af; font-family: system-ui, sans-serif;">
            If you didn't sign up, you can safely ignore this email.
          </p>
        </div>
      `,
    }).catch((err) => console.error("Resend error:", err));
  }

  return NextResponse.json({ status: "confirmation_sent" });
}
