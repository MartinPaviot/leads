"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * The docs step nav scrolls internally (19 steps outgrow short viewports),
 * so on navigation the active step can sit below the nav's own fold. This
 * scrolls it into view inside the nav. `block: "nearest"` keeps the
 * adjustment minimal and avoids yanking the page itself.
 */
export function ScrollActiveStep() {
  const pathname = usePathname();
  useEffect(() => {
    document
      .querySelector('nav[aria-label="Method steps"] a[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [pathname]);
  return null;
}
