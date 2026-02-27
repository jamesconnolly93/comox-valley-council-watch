import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** GET /api/confirm?token=X — confirms subscription, redirects to confirm page */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comox-valley-council-watch.vercel.app";

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/confirm/invalid`);
  }

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("subscribers")
    .update({ confirmed: true, confirmation_token: null })
    .eq("confirmation_token", token)
    .eq("confirmed", false)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.redirect(`${siteUrl}/confirm/invalid`);
  }

  return NextResponse.redirect(`${siteUrl}/confirm/success`);
}
