import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** GET /api/unsubscribe?token=X — removes subscriber */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://comox-valley-council-watch.vercel.app";

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/?unsubscribed=invalid`);
  }

  const supabase = adminClient();
  const { error } = await supabase
    .from("subscribers")
    .delete()
    .eq("unsubscribe_token", token);

  if (error) {
    console.error("Unsubscribe error:", error);
  }

  return NextResponse.redirect(`${siteUrl}/?unsubscribed=true`);
}
