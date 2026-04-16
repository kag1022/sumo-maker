import React from "react";

const MOBILE_BREAKPOINT_QUERY = "(max-width: 1023px)";

const getMatches = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
};

export const useViewportMode = () => {
  const [isMobileViewport, setIsMobileViewport] = React.useState(getMatches);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const applyMatches = (matches: boolean) => setIsMobileViewport(matches);
    applyMatches(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => applyMatches(event.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return {
    isMobileViewport,
  };
};
