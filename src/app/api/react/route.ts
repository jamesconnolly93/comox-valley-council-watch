import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Max new reactions a single fingerprint can add per day (across all items)
const DAILY_RATE_LIMIT = 50;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** GET /api/react?item_id=X&fingerprint=Y — returns { count, reacted } */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const item_id = searchParams.get("item_id");
  const fingerprint = searchParams.get("fingerprint");

  if (!item_id || !fingerprint) {
    return NextResponse.json({ error: "Missing item_id or fingerprint" }, { status: 400 });
  }

  const supabase = adminClient();

  const [{ count }, { data: existing }] = await Promise.all([
    supabase
      .from("reactions")
      .select("*", { count: "exact", head: true })
      .eq("item_id", item_id),
    supabase
      .from("reactions")
      .select("id")
      .eq("item_id", item_id)
      .eq("fingerprint", fingerprint)
      .maybeSingle(),
  ]);

  return NextResponse.json({ count: count ?? 0, reacted: !!existing });
}

/** POST /api/react { item_id, fingerprint } — toggles reaction, returns { count, reacted } */
export async function POST(req: NextRequest) {
  let body: { item_id?: string; fingerprint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { item_id, fingerprint } = body;
  if (!item_id || !fingerprint || typeof fingerprint !== "string") {
    return NextResponse.json({ error: "Missing item_id or fingerprint" }, { status: 400 });
  }

  // Sanitise fingerprint — only allow alphanumeric (our hash output)
  if (!/^[a-z0-9]{1,32}$/.test(fingerprint)) {
    return NextResponse.json({ error: "Invalid fingerprint" }, { status: 400 });
  }

  const supabase = adminClient();

  // Check if already reacted to this item
  const { data: existing } = await supabase
    .from("reactions")
    .select("id")
    .eq("item_id", item_id)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  let reacted: boolean;

  if (existing) {
    // Toggle off
    await supabase.from("reactions").delete().eq("id", existing.id);
    reacted = false;
  } else {
    // Rate limit: max DAILY_RATE_LIMIT new reactions per fingerprint per day
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: dailyCount } = await supabase
      .from("reactions")
      .select("*", { count: "exact", head: true })
      .eq("fingerprint", fingerprint)
      .gte("created_at", since);

    if ((dailyCount ?? 0) >= DAILY_RATE_LIMIT) {
      return NextResponse.json(
        { error: "Rate limit reached", count: 0, reacted: false },
        { status: 429 }
      );
    }

    const { error } = await supabase
      .from("reactions")
      .insert({ item_id, fingerprint });

    // Conflict = already exists (race condition) — treat as reacted
    reacted = !error;
  }

  // Return fresh count
  const { count } = await supabase
    .from("reactions")
    .select("*", { count: "exact", head: true })
    .eq("item_id", item_id);

  return NextResponse.json({ count: count ?? 0, reacted });
}
