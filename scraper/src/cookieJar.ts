export interface StoredCookie {
  name: string
  value: string
  domain: string
  hostOnly: boolean
  path: string
  secure: boolean
  httpOnly: boolean
  expiresAt?: number
}

export interface CookieMeta {
  name: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  expiresAt?: number
}

function defaultPath(urlPath: string): string {
  if (!urlPath.startsWith('/')) return '/'
  const lastSlash = urlPath.lastIndexOf('/')
  return lastSlash <= 0 ? '/' : urlPath.slice(0, lastSlash)
}

function domainMatches(hostname: string, cookie: StoredCookie): boolean {
  const host = hostname.toLowerCase()
  if (cookie.hostOnly) return host === cookie.domain
  return host === cookie.domain || host.endsWith(`.${cookie.domain}`)
}

function pathMatches(urlPath: string, cookiePath: string): boolean {
  if (urlPath === cookiePath) return true
  if (!urlPath.startsWith(cookiePath)) return false
  return cookiePath.endsWith('/') || urlPath[cookiePath.length] === '/'
}

export class CookieJar {
  #cookies = new Map<string, StoredCookie>()

  set(cookie: StoredCookie): void {
    const key = `${cookie.domain}\0${cookie.path}\0${cookie.name}`
    if (cookie.expiresAt !== undefined && cookie.expiresAt <= Date.now()) {
      this.#cookies.delete(key)
      return
    }
    this.#cookies.set(key, cookie)
  }

  ingest(response: Response, requestUrl: string): CookieMeta[] {
    const url = new URL(requestUrl)
    const setCookies = response.headers.getSetCookie()
    const recorded: CookieMeta[] = []

    for (const raw of setCookies) {
      const parsed = parseSetCookie(raw, url)
      if (!parsed || !domainMatches(url.hostname, parsed)) continue
      this.set(parsed)
      recorded.push({
        name: parsed.name,
        domain: parsed.domain,
        path: parsed.path,
        secure: parsed.secure,
        httpOnly: parsed.httpOnly,
        expiresAt: parsed.expiresAt,
      })
    }

    return recorded
  }

  headerFor(requestUrl: string): string {
    const url = new URL(requestUrl)
    const now = Date.now()
    const pairs: string[] = []

    for (const [key, cookie] of this.#cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
        this.#cookies.delete(key)
        continue
      }
      if (cookie.secure && url.protocol !== 'https:') continue
      if (!domainMatches(url.hostname, cookie)) continue
      if (!pathMatches(url.pathname, cookie.path)) continue
      pairs.push(`${cookie.name}=${cookie.value}`)
    }

    return pairs.join('; ')
  }

  getValue(name: string, requestUrl?: string): string | undefined {
    const url = requestUrl ? new URL(requestUrl) : undefined
    const now = Date.now()
    let best: StoredCookie | undefined
    for (const cookie of this.#cookies.values()) {
      if (cookie.name !== name) continue
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) continue
      if (url && cookie.secure && url.protocol !== 'https:') continue
      if (url && (!domainMatches(url.hostname, cookie) || !pathMatches(url.pathname, cookie.path))) {
        continue
      }
      if (!best || cookie.path.length > best.path.length) {
        best = cookie
      }
    }
    return best?.value
  }
}

function parseSetCookie(header: string, requestUrl: URL): StoredCookie | undefined {
  const parts = header.split(';').map((part) => part.trim())
  const [nameValue, ...attrs] = parts
  if (!nameValue) return undefined
  const eq = nameValue.indexOf('=')
  if (eq <= 0) return undefined

  const name = nameValue.slice(0, eq).trim()
  const value = nameValue.slice(eq + 1).trim()
  let domain = requestUrl.hostname.toLowerCase()
  let hostOnly = true
  let path = defaultPath(requestUrl.pathname)
  let secure = false
  let httpOnly = false
  let expiresAt: number | undefined

  for (const attr of attrs) {
    if (!attr) continue
    const idx = attr.indexOf('=')
    const key = (idx === -1 ? attr : attr.slice(0, idx)).trim().toLowerCase()
    const val = idx === -1 ? '' : attr.slice(idx + 1).trim()

    if (key === 'domain' && val) {
      domain = val.replace(/^\./, '').toLowerCase()
      hostOnly = false
    } else if (key === 'path' && val.startsWith('/')) {
      path = val
    } else if (key === 'secure') {
      secure = true
    } else if (key === 'httponly') {
      httpOnly = true
    } else if (key === 'max-age' && /^-?\d+$/.test(val)) {
      expiresAt = Date.now() + Number(val) * 1000
    } else if (key === 'expires' && expiresAt === undefined) {
      const ts = Date.parse(val)
      if (!Number.isNaN(ts)) expiresAt = ts
    }
  }

  return { name, value, domain, hostOnly, path, secure, httpOnly, expiresAt }
}
