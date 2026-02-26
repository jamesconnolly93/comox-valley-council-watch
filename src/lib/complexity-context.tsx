"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Complexity = "simple" | "standard" | "expert";

const STORAGE_KEY = "cvtw-complexity";

const ComplexityContext = createContext<{
  complexity: Complexity;
  setComplexity: (c: Complexity) => void;
} | null>(null);

const DEFAULT_COMPLEXITY: Complexity = "standard";

export function useComplexity() {
  const ctx = useContext(ComplexityContext);
  if (!ctx) {
    return {
      complexity: DEFAULT_COMPLEXITY,
      setComplexity: () => {},
    };
  }
  return ctx;
}

export function ComplexityProvider({ children }: { children: React.ReactNode }) {
  const [complexity, setComplexityState] = useState<Complexity>("standard");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (
        stored === "simple" ||
        stored === "standard" ||
        stored === "expert"
      ) {
        setComplexityState(stored);
      }
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  const setComplexity = useCallback((c: Complexity) => {
    setComplexityState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // ignore
    }
  }, []);

  return (
    <ComplexityContext.Provider
      value={{ complexity: mounted ? complexity : "standard", setComplexity }}
    >
      {children}
    </ComplexityContext.Provider>
  );
}
