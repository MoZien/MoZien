import { useEffect, useState } from "react";

// Hash routes (#/analyze?url=...) work on any static host and need no server routing.

export interface Route {
  page: string;
  param: string | null;
  query: URLSearchParams;
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [path, search = ""] = hash.split("?");
  const [page = "", param = null] = path.split("/").map(decodeURIComponent);
  return { page: page || "", param: param || null, query: new URLSearchParams(search) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const update = () => setRoute(parse());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}

export function navigate(page: string, param?: string | null, query?: Record<string, string>) {
  const search = query ? `?${new URLSearchParams(query)}` : "";
  const target = `#/${page}${param ? `/${encodeURIComponent(param)}` : ""}${search}`;
  if (window.location.hash !== target) window.location.hash = target;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function href(page: string, param?: string | null, query?: Record<string, string>) {
  const search = query ? `?${new URLSearchParams(query)}` : "";
  return `#/${page}${param ? `/${encodeURIComponent(param)}` : ""}${search}`;
}
