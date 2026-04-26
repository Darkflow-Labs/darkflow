"use client";

import { useEffect, useState } from "react";

export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const m = window.matchMedia(query);
    const handle = () => setMatches(m.matches);
    handle();
    m.addEventListener("change", handle);
    return () => m.removeEventListener("change", handle);
  }, [query]);

  return matches;
};
