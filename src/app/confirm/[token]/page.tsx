import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (token === "success") {
    return <StatusPage type="success" />;
  }
  if (token === "invalid") {
    return <StatusPage type="invalid" />;
  }

  // Confirm the token
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("subscribers")
    .update({ confirmed: true, confirmation_token: null })
    .eq("confirmation_token", token)
    .eq("confirmed", false)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/confirm/invalid");
  }

  redirect("/confirm/success");
}

function StatusPage({ type }: { type: "success" | "invalid" }) {
  const isSuccess = type === "success";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-5">
      <div className="max-w-md w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
            isSuccess
              ? "bg-[var(--accent-light)] text-[var(--accent)]"
              : "bg-red-50 text-red-500"
          }`}
        >
          {isSuccess ? <CheckIcon className="h-7 w-7" /> : <XIcon className="h-7 w-7" />}
        </div>

        <h1 className="font-fraunces text-2xl font-semibold text-[var(--text-primary)]">
          {isSuccess ? "You're subscribed!" : "Link invalid or expired"}
        </h1>

        <p className="mt-3 text-[var(--text-secondary)]">
          {isSuccess
            ? "You'll receive a weekly summary of Comox Valley council decisions every Monday morning. Stay informed, stay involved."
            : "This confirmation link may have already been used or has expired. Try signing up again from the home page."}
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {isSuccess ? "See what's happening" : "Go back home"}
        </Link>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
