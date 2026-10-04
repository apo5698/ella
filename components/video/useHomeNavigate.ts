"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { homeHref } from "@/lib/homeFilters";

/**
 * Moves the home page to another view. On the home page itself only the URL
 * changes: the list fetches what it needs, and the server page has nothing
 * new to say. From anywhere else it is an ordinary navigation.
 */
export function useHomeNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (params: URLSearchParams, { replace = false } = {}) => {
      const href = homeHref(params);
      if (pathname !== "/") {
        router.push(href);
        return;
      }
      if (replace) window.history.replaceState(null, "", href);
      else {
        window.history.pushState(null, "", href);
        window.scrollTo({ top: 0 });
      }
    },
    [pathname, router],
  );
}
