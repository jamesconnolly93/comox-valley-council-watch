"use client";

import { ComplexityProvider } from "@/lib/complexity-context";

export function ComplexityProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ComplexityProvider>{children}</ComplexityProvider>;
}
