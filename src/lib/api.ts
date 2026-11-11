// Typed fetch helpers for the ATLAS backend.
// All requests use relative paths — Caddy forwards to the Next.js backend on port 3000.

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined | null>) {
  let url = path;
  if (params) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      search.set(k, String(v));
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>
): Promise<T> {
  const res = await fetch(buildUrl(path, params), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
    }
    const msg =
      (body && typeof body === "object" && "error" in body
        ? String((body as Record<string, unknown>).error)
        : undefined) ?? `Request failed with ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  // Some endpoints (export) return text/blob — caller can use apiGetRaw for those.
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let errBody: unknown = undefined;
    try {
      errBody = await res.json();
    } catch {
      try {
        errBody = await res.text();
      } catch {
        /* ignore */
      }
    }
    const msg =
      (errBody && typeof errBody === "object" && "error" in errBody
        ? String((errBody as Record<string, unknown>).error)
        : undefined) ?? `Request failed with ${res.status}`;
    throw new ApiError(msg, res.status, errBody);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}

/** Trigger a browser download for an export endpoint. */
export async function apiDownload(path: string, fallbackFilename: string) {
  const res = await fetch(path, { headers: { Accept: "*/*" } });
  if (!res.ok) {
    throw new ApiError(`Export failed with ${res.status}`, res.status);
  }
  const blob = await res.blob();
  // Try to honour server Content-Disposition filename.
  const cd = res.headers.get("content-disposition") || "";
  const match = cd.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] ?? fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
