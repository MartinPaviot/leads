"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { safeFetch, type SafeFetchOptions, type SafeFetchResult } from "./safe-fetch";

/**
 * React hook that returns a `safeFetch` bound to the current toast provider.
 *
 *   const sfetch = useSafeFetch();
 *   const { data, error } = await sfetch<{ x: number }>("/api/x", {
 *     errorMessage: "Failed to load X",
 *   });
 */
export function useSafeFetch() {
  const { toast } = useToast();
  return useCallback(
    <T = unknown>(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult<T>> => {
      return safeFetch<T>(url, { ...options, toast });
    },
    [toast],
  );
}
