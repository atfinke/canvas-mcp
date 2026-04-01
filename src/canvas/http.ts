export type QueryValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | null
  | undefined;

export function buildCanvasPath(path: string, query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        params.append(key, String(value));
      }
      continue;
    }

    params.append(key, String(rawValue));
  }

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function toCanvasUrl(baseUrl: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith("https://") || pathOrUrl.startsWith("http://")) {
    return pathOrUrl;
  }

  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl.slice(1) : pathOrUrl;
  return `${baseUrl}/${normalizedPath}`;
}

export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const entry of linkHeader.split(",")) {
    const match = entry.trim().match(/<([^>]+)>;\s*rel="([^"]+)"/u);
    if (match?.[2] === "next") {
      return match[1];
    }
  }

  return null;
}

export function compareCanvasDates(left: string | null | undefined, right: string | null | undefined): number {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  const leftTimestamp = Date.parse(left);
  const rightTimestamp = Date.parse(right);

  if (!Number.isFinite(leftTimestamp) || !Number.isFinite(rightTimestamp)) {
    return left.localeCompare(right);
  }

  return leftTimestamp - rightTimestamp;
}
