"use client";

import type { CommunitySignal, CommunitySignalPosition } from "@/lib/feed";

function stanceColor(stance: CommunitySignalPosition["stance"]): string {
  switch (stance) {
    case "support":  return "#7BA887";
    case "oppose":   return "#D4726A";
    case "neutral":  return "#B8B0A4";
    case "finding":  return "#5B8DB8";
  }
}

function signalTypeLabel(type: CommunitySignal["type"], count: number | null): string {
  switch (type) {
    case "letters":          return count ? `${count} community letters` : "Community letters";
    case "survey":           return count ? `${count} survey responses` : "Survey";
    case "delegation":       return count ? `${count} delegation${count === 1 ? "" : "s"}` : "Delegations";
    case "petition":         return count ? `${count} petition signatures` : "Petition";
    case "public_hearing":   return count ? `${count} at public hearing` : "Public hearing";
    case "engagement":       return count ? `${count} participants` : "Community engagement";
    case "service_delivery": return count ? `${count.toLocaleString()} service calls/events` : "Service data";
    default:                 return count ? `${count} responses` : "Community input";
  }
}

export function StructuredFindings({ signal }: { signal: CommunitySignal }) {
  const positions = (signal.positions ?? []).filter(
    (p) => p && p.label
  );
  if (!signal.summary && positions.length === 0) return null;

  return (
    <div className="rounded-r-lg border-l-2 border-blue-200 bg-blue-50/40 py-2.5 pl-3 pr-3">
      <p className="text-xs font-semibold text-blue-700">
        {signalTypeLabel(signal.type, signal.participant_count)}
      </p>
      {signal.summary && (
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          {signal.summary}
        </p>
      )}
      {positions.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {positions.map((pos, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: stanceColor(pos.stance) }}
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                <span className="text-sm text-[var(--text-primary)]">
                  {pos.label}
                </span>
                {pos.metric && (
                  <span className="shrink-0 text-xs font-medium text-[var(--text-tertiary)]">
                    {pos.metric}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
