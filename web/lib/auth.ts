/**
 * Client-side auth token management.
 *
 * The web server generates a random bearer token at launch and passes it to
 * the browser via the URL fragment (e.g. `http://127.0.0.1:3000/#token=<hex>`).
 * On Windows we also tolerate a one-time `?_token=<hex>` query parameter to
 * survive launcher/browser combinations that drop fragments.
 *
 * On first load this module extracts the token from the fragment, persists
 * it to sessionStorage (so it survives page refreshes), mirrors it into a
 * same-site session cookie (so plain reloads/new tabs in the same browser
 * session keep working), and clears the token from the address bar. All
 * subsequent API calls attach the token via the `Authorization: Bearer`
 * header.
 *
 * For EventSource (SSE), which cannot send custom headers, the token is
 * appended as a `?_token=` query parameter instead.
 */

const SESSION_STORAGE_KEY = "gsd-auth-token"
const COOKIE_KEY = "gsd-auth-token"

let cachedToken: string | null = null

function persistToken(token: string): void {
  cachedToken = token

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, token)
  } catch {
    // Storage unavailable (e.g. private browsing quota exceeded) — the
    // in-memory cache still works for the current page lifecycle.
  }

  try {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; SameSite=Strict`
  } catch {
    // Cookie writes are best-effort only.
  }
}

function clearTokenFromUrl(): void {
  const url = new URL(window.location.href)
  url.hash = ""
  url.searchParams.delete("_token")
  url.searchParams.delete("token")
  const cleanUrl = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(null, "", cleanUrl)
}

/**
 * Extract the auth token from the URL fragment on first call, then return
 * the cached value. Falls back to sessionStorage so the token survives
 * page refreshes (which clear the in-memory cache and the URL fragment).
 * Clears the fragment / one-time query param from the address bar after
 * extraction.
 */
export function getAuthToken(): string | null {
  if (cachedToken !== null) return cachedToken

  if (typeof window === "undefined") return null

  // 1. Try the URL fragment (initial page load from gsd --web)
  const hash = window.location.hash
  if (hash) {
    const match = hash.match(/token=([a-fA-F0-9]+)/)
    if (match) {
      persistToken(match[1])
      clearTokenFromUrl()
      return cachedToken
    }
  }

  // 2. Try a one-time query parameter fallback (Windows browser launchers may
  // drop fragments but preserve the query string).
  try {
    const url = new URL(window.location.href)
    const token = url.searchParams.get("_token") ?? url.searchParams.get("token")
    if (token && /^[a-fA-F0-9]+$/.test(token)) {
      persistToken(token)
      clearTokenFromUrl()
      return cachedToken
    }
  } catch {
    // Malformed URL — fall through to storage/cookie fallback
  }

  // 3. Fall back to sessionStorage (page refresh, bookmark without hash)
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (stored) {
      cachedToken = stored
      return cachedToken
    }
  } catch {
    // Storage unavailable — fall through to null
  }

  // 4. Fall back to the session cookie so a plain new tab still works after
  // one authenticated launch in the same browser session.
  try {
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_KEY}=`))
    if (cookie) {
      cachedToken = decodeURIComponent(cookie.slice(COOKIE_KEY.length + 1))
      return cachedToken
    }
  } catch {
    // Cookie access unavailable — fall through to null
  }

  return null
}

/**
 * Returns an object with the `Authorization` header for use with `fetch()`.
 * Merges with any additional headers provided.
 */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken()
  const headers: Record<string, string> = { ...extra }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  return headers
}

/**
 * Wrapper around `fetch()` that automatically injects the auth token.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  if (!token) return fetch(input, init)

  const headers = new Headers(init?.headers)
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  return fetch(input, { ...init, headers })
}

/**
 * Append the auth token as a `_token` query parameter to a URL string.
 * Used for EventSource connections which cannot send custom headers.
 */
export function appendAuthParam(url: string): string {
  const token = getAuthToken()
  if (!token) return url

  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}_token=${token}`
}
