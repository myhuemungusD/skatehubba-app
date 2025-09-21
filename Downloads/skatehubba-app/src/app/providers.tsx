"use client";

import { ReactNode, useEffect } from "react";
import { ensureAnonSignIn } from "@/lib/auth";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    ensureAnonSignIn().catch((error) => {
      console.error("Failed to ensure anonymous auth", error);
    });
  }, []);

  return <>{children}</>;
}
