import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEBHOOK_PATH_FRAGMENT = "/api/crm/flows/webhooks/";

// Cache em memória por instância do edge runtime.
// TTL curto (60s) para GETs idempotentes em /leads e /tags.
type CacheEntry = { expiresAt: number; status: number; body: string };
const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;
const CACHEABLE_PREFIXES = ["/leads", "/tags"];

function normalizeDataCrazyApiUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("DATACRAZY_API_URL is not a valid URL");
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");

  if (pathname.includes(WEBHOOK_PATH_FRAGMENT)) {
    const [basePath] = pathname.split(WEBHOOK_PATH_FRAGMENT);
    return `${parsed.origin}${basePath}`;
  }

  const resourceLikeSegments = new Set([
    "leads",
    "businesses",
    "tags",
    "lists",
    "pipelines",
    "stages",
    "activities",
  ]);

  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1);
  if (lastSegment && resourceLikeSegments.has(lastSegment)) {
    segments.pop();
  }

  if (segments.length === 0) {
    return `${parsed.origin}/api/v1`;
  }

  return `${parsed.origin}/${segments.join("/")}`;
}

function buildProxyUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    throw new Error("Proxy path must be relative");
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

function buildG1FallbackUrl(url: string): string | null {
  const parsed = new URL(url);
  if (parsed.hostname !== "api.datacrazy.io") return null;
  parsed.hostname = "api.g1.datacrazy.io";
  return parsed.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  let attempt = 0;
  let lastResponse: Response | null = null;
  while (attempt <= maxRetries) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    lastResponse = res;
    const retryAfter = res.headers.get("Retry-After");
    let waitMs = 1500 * Math.pow(2, attempt);
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed)) waitMs = Math.min(parsed * 1000, 8000);
    }
    // Descarta o body para liberar a conexão.
    try { await res.text(); } catch { /* noop */ }
    await sleep(waitMs);
    attempt += 1;
  }
  return lastResponse!;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DATACRAZY_API_URL_RAW = Deno.env.get("DATACRAZY_API_URL");
    if (!DATACRAZY_API_URL_RAW) throw new Error("DATACRAZY_API_URL is not configured");
    const DATACRAZY_API_URL = normalizeDataCrazyApiUrl(DATACRAZY_API_URL_RAW);

    const DATACRAZY_API_TOKEN = Deno.env.get("DATACRAZY_API_TOKEN");
    if (!DATACRAZY_API_TOKEN) throw new Error("DATACRAZY_API_TOKEN is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.clone().text();
    const body = rawBody ? JSON.parse(rawBody) : {};
    const { method = "GET", path, payload } = body as {
      method: string;
      path: string;
      payload?: unknown;
    };

    if (!path) throw new Error("Missing 'path' in request body");

    const ALLOWED_PREFIXES = ["/leads", "/tags", "/businesses"];
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (!ALLOWED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Agregador especial: GET /leads/by-tag-compact?tagId=...
    // Pagina server-side em paralelo e devolve apenas {id,name,phone,tags[]}.
    // Reduz 20+ round-trips do cliente para 1 e o payload em ~95%.
    const compactMatch = normalizedPath.match(/^\/leads\/by-tag-compact\?tagId=([^&]+)/);
    if (method === "GET" && compactMatch) {
      const tagId = decodeURIComponent(compactMatch[1]);
      const compactKey = `COMPACT ${tagId}`;
      const cachedCompact = responseCache.get(compactKey);
      if (cachedCompact && cachedCompact.expiresAt > Date.now()) {
        return new Response(cachedCompact.body, {
          status: cachedCompact.status,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Proxy-Cache": "HIT" },
        });
      }

      const PAGE_SIZE = 100;
      const dcHeaders = {
        "Content-Type": "application/json",
        Authorization: DATACRAZY_API_TOKEN,
      };
      const fetchPageDC = async (skip: number): Promise<{ items: any[]; count: number | null }> => {
        const pageUrl = buildProxyUrl(
          DATACRAZY_API_URL,
          `/leads?filter[tags]=${tagId}&limit=${PAGE_SIZE}&skip=${skip}`,
        );
        let res = await fetchWithRetry(pageUrl, { method: "GET", headers: dcHeaders });
        if (res.status === 404) {
          const fb = buildG1FallbackUrl(pageUrl);
          if (fb) res = await fetchWithRetry(fb, { method: "GET", headers: dcHeaders });
        }
        const txt = await res.text();
        let parsed: any;
        try { parsed = JSON.parse(txt); } catch { parsed = null; }
        const items = Array.isArray(parsed) ? parsed : parsed?.data || [];
        const count = parsed && typeof parsed.count === "number" ? parsed.count : null;
        return { items, count };
      };

      const first = await fetchPageDC(0);
      const totalPages = first.count
        ? Math.ceil(first.count / PAGE_SIZE)
        : (first.items.length === PAGE_SIZE ? 40 : 1);

      const skips: number[] = [];
      for (let i = 1; i < totalPages; i++) skips.push(i * PAGE_SIZE);

      // Paralelismo em lotes de 5 no edge (rede rápida server↔DataCrazy).
      const CONCURRENCY = 5;
      const allItems: any[] = [...first.items];
      let stop = first.items.length < PAGE_SIZE;
      for (let i = 0; i < skips.length && !stop; i += CONCURRENCY) {
        const batch = skips.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map((s) => fetchPageDC(s).catch(() => ({ items: [], count: null }))),
        );
        for (const r of results) {
          if (r.items.length === 0) { stop = true; continue; }
          allItems.push(...r.items);
          if (r.items.length < PAGE_SIZE) stop = true;
        }
      }

      // Compacta: mantém apenas o essencial para a UI de busca de lead.
      const seen = new Set<string>();
      const compact: any[] = [];
      for (const l of allItems) {
        if (!l?.id || seen.has(l.id)) continue;
        seen.add(l.id);
        const phone = l.phone || (Array.isArray(l.phones) && l.phones[0]?.phone) || "";
        compact.push({
          id: l.id,
          name: l.name,
          phone: typeof phone === "string" ? phone : String(phone),
          tags: Array.isArray(l.tags)
            ? l.tags.map((t: any) => ({ id: t.id, name: t.name }))
            : [],
        });
      }

      const compactBody = JSON.stringify({ data: compact, count: compact.length });
      responseCache.set(compactKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        status: 200,
        body: compactBody,
      });
      return new Response(compactBody, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Proxy-Cache": "MISS" },
      });
    }

    // Cache check (apenas GETs em rotas idempotentes).
    const isCacheable =
      method === "GET" && CACHEABLE_PREFIXES.some((p) => normalizedPath.startsWith(p));
    const cacheKey = `${method} ${normalizedPath}`;
    if (isCacheable) {
      const hit = responseCache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return new Response(hit.body, {
          status: hit.status,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Proxy-Cache": "HIT" },
        });
      }
    }

    const url = buildProxyUrl(DATACRAZY_API_URL, path);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: DATACRAZY_API_TOKEN,
      },
    };

    if (payload && method !== "GET") {
      fetchOptions.body = JSON.stringify(payload);
    }

    let requestUrl = url;
    let response = await fetchWithRetry(requestUrl, fetchOptions);

    if (response.status === 404) {
      const fallbackUrl = buildG1FallbackUrl(requestUrl);
      if (fallbackUrl) {
        requestUrl = fallbackUrl;
        response = await fetchWithRetry(requestUrl, fetchOptions);
      }
    }

    const responseData = await response.text();

    if (!response.ok) {
      console.error("DataCrazy request failed", {
        method,
        requestUrl,
        status: response.status,
        response: responseData.slice(0, 500),
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(responseData);
    } catch {
      parsed = { raw: responseData };
    }

    const responseBody = JSON.stringify(parsed);
    const responseStatus = response.ok ? 200 : response.status;

    if (isCacheable && response.ok) {
      responseCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        status: responseStatus,
        body: responseBody,
      });
      // Limpeza barata
      if (responseCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of responseCache) {
          if (v.expiresAt <= now) responseCache.delete(k);
        }
      }
    }

    return new Response(responseBody, {
      status: responseStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Proxy-Cache": "MISS" },
    });
  } catch (error: unknown) {
    console.error("DataCrazy proxy error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
