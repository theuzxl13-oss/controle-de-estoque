import { useEffect, useState } from "react";

/** Roteamento por hash (#/produtos) — funciona no GitHub Pages sem servidor. */
export function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function navigate(route: string) {
  window.location.hash = `/${route}`;
}
