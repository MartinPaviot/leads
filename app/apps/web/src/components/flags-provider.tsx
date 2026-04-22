"use client";

import { createContext, useContext } from "react";
import type { KnownFlag } from "@/lib/experiments";

type FlagsMap = Partial<Record<KnownFlag, boolean>>;

const FlagsContext = createContext<FlagsMap>({});

export function FlagsProvider({
  flags,
  children,
}: {
  flags: FlagsMap;
  children: React.ReactNode;
}) {
  return (
    <FlagsContext.Provider value={flags}>{children}</FlagsContext.Provider>
  );
}

export function useFlag(flag: KnownFlag): boolean {
  const flags = useContext(FlagsContext);
  return flags[flag] ?? false;
}
