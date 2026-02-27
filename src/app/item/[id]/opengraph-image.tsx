import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const alt = "Comox Valley Council Watch";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Raw hex values matching the Tailwind classes in municipalityBadgeClass()
const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  Courtenay: { bg: "#eff6ff", text: "#1d4ed8" },
  Comox: { bg: "#ecfdf5", text: "#065f46" },
  CVRD: { bg: "#fffbeb", text: "#92400e" },
  Cumberland: { bg: "#f5f3ff", text: "#6d28d9" },
};

export default async function Image({ params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase
    .from("items")
    .select(
      "title, summary, impact, meetings!inner(date, municipalities!inner(short_name))"
    )
    .eq("id", params.id)
    .single();

  const title = data?.title ?? "Council Agenda Item";
  const summary = data?.summary ?? "";
  const mun = (data as any)?.meetings?.municipalities?.short_name ?? "Comox Valley";
  const badge = BADGE_COLORS[mun] ?? { bg: "#f3f4f6", text: "#374151" };

  // Truncate title for display
  const displayTitle = title.length > 80 ? title.slice(0, 77) + "…" : title;
  const displaySummary = summary.length > 140 ? summary.slice(0, 137) + "…" : summary;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f9f7f4",
          padding: "60px",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            backgroundColor: "#2d6a4f",
          }}
        />

        {/* Municipality badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              backgroundColor: badge.bg,
              color: badge.text,
              padding: "6px 16px",
              borderRadius: "9999px",
              fontSize: "16px",
              fontWeight: 600,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {mun}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: displayTitle.length > 60 ? "36px" : "44px",
            fontWeight: 700,
            color: "#1a1a1a",
            lineHeight: 1.2,
            marginBottom: "24px",
            flex: 1,
          }}
        >
          {displayTitle}
        </div>

        {/* Summary */}
        {displaySummary && (
          <div
            style={{
              fontSize: "22px",
              color: "#4b5563",
              lineHeight: 1.5,
              fontFamily: "system-ui, sans-serif",
              marginBottom: "36px",
            }}
          >
            {displaySummary}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            borderTop: "1px solid #e5e7eb",
            paddingTop: "20px",
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              backgroundColor: "#2d6a4f",
              borderRadius: "6px",
            }}
          />
          <span
            style={{
              fontSize: "18px",
              color: "#6b7280",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Comox Valley Council Watch
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
