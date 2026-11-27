import { createCipheriv, createHash, randomBytes } from 'node:crypto'

import { CookieJar } from './cookieJar.ts'

export interface Credentials {
  username: string
  password: string
}

export interface LoginOptions extends Credentials {
  entryUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export interface SsoFormState {
  croypto: string
  execution: string
  loginType: string
  errorCode: string
  riskMessage: string
  captchaId: string
  loginRule: string
  invisibleCaptcha: string
  riskSystem: string
}

const BYYT = 'https://byyt.ecnu.edu.cn'
const SSO = 'https://sso.ecnu.edu.cn'
const CALLBACK = `${BYYT}/sso/login`
const DEFAULT_ENTRY_URL = 'https://byyt.ecnu.edu.cn/student/for-std/lesson-search'
const DEFAULT_TIMEOUT_MS = 15_000

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

function upgradeByytHttps(rawUrl: string): string {
  const url = new URL(rawUrl)
  if (url.protocol === 'http:' && url.hostname === 'byyt.ecnu.edu.cn' && !url.port) {
    url.protocol = 'https:'
  }
  if ((url.origin !== BYYT && url.origin !== SSO) || url.username || url.password) {
    throw new Error(`登录遇到未识别的跳转目标: ${url.origin}${url.pathname}`)
  }
  return url.toString()
}

function readTagText(html: string, id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<p\\b[^>]*\\bid\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/p>`, 'i'))
  return match ? match[1].trim() : ''
}

export function encryptPassword(croyptoBase64: string, password: string): string {
  const key = Buffer.from(croyptoBase64, 'base64')
  if (key.length !== 16) {
    throw new Error(`无效的 SSO 加密密钥长度: ${key.length}`)
  }
  const cipher = createCipheriv('aes-128-ecb', key, null)
  return Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]).toString('base64')
}

export function extractSsoForm(html: string): SsoFormState {
  return {
    croypto: readTagText(html, 'login-croypto'),
    execution: readTagText(html, 'login-page-flowkey'),
    loginType: readTagText(html, 'current-login-type'),
    errorCode: readTagText(html, 'login-error-code'),
    riskMessage: readTagText(html, 'riskMessage'),
    captchaId: readTagText(html, 'captchaId'),
    loginRule: readTagText(html, 'login-rule-type'),
    invisibleCaptcha: readTagText(html, 'recaptcha-invisible'),
    riskSystem: readTagText(html, 'riskSystemSwitch'),
  }
}

async function followRedirects(
  startUrl: string,
  jar: CookieJar,
  options: { timeoutMs: number; fetchImpl: typeof fetch; maxHops?: number },
): Promise<{ url: string; response: Response }> {
  const maxHops = options.maxHops ?? 10
  let currentUrl = upgradeByytHttps(startUrl)

  for (let hop = 0; hop < maxHops; hop += 1) {
    const cookieHeader = jar.headerFor(currentUrl)
    const response = await options.fetchImpl(currentUrl, {
      redirect: 'manual',
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      signal: AbortSignal.timeout(options.timeoutMs),
    })
    jar.ingest(response, currentUrl)

    if (!isRedirect(response.status)) {
      return { url: currentUrl, response }
    }

    const location = response.headers.get('location')
    if (!location) {
      return { url: currentUrl, response }
    }
    await response.body?.cancel()
    currentUrl = upgradeByytHttps(new URL(location, currentUrl).toString())
  }

  throw new Error('CAS 登录重定向次数过多')
}

async function checkCaptcha(
  username: string, loginUrl: string, jar: CookieJar, timeoutMs: number, fetchImpl: typeof fetch,
): Promise<void> {
  // Match the browser's account-specific captcha check before submitting the form.
  const csrfKey = randomBytes(16).toString('hex')
  const encoded = Buffer.from(csrfKey).toString('base64')
  const middle = encoded.length / 2
  const csrfValue = createHash('md5').update(encoded.slice(0, middle) + encoded + encoded.slice(middle)).digest('hex')
  const url = `${SSO}/api/protected/user/findCaptchaCount/${encodeURIComponent(username)}`
  const response = await fetchImpl(url, {
    redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Cookie: jar.headerFor(url), 'Csrf-Key': csrfKey, 'Csrf-Value': csrfValue,
      'Accept-Process-Json': '1', Referer: loginUrl,
    },
  })
  jar.ingest(response, url)
  if (!response.ok) throw new Error(`统一认证验证码检查失败 (HTTP ${response.status})`)
  const result = await response.json() as { code?: number; data?: { captchaInvisible?: boolean } }
  if (result.code !== 200 || typeof result.data?.captchaInvisible !== 'boolean') {
    throw new Error('统一认证未返回可识别的验证码检查结果')
  }
  if (result.data.captchaInvisible) throw new Error('统一认证要求验证码，请在浏览器中完成登录并使用 SESSION')
}

export async function loginWithCredentials(options: LoginOptions): Promise<string> {
  const entryUrl = options.entryUrl ?? DEFAULT_ENTRY_URL
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? fetch
  const jar = new CookieJar()

  // 1. Follow byyt -> sso redirect chain with a fresh CookieJar
  const landing = await followRedirects(entryUrl, jar, { timeoutMs, fetchImpl })
  if (!landing.response.ok) {
    throw new Error(`打开 SSO 登录页失败: HTTP ${landing.response.status}`)
  }

  const loginUrl = new URL(landing.url)
  if (loginUrl.origin !== SSO || loginUrl.pathname !== '/login' || loginUrl.searchParams.get('service') !== CALLBACK) {
    throw new Error('未到达教务系统预期的 SSO 登录页')
  }

  const form = extractSsoForm(await landing.response.text())
  if (!form.croypto || !form.execution || form.loginType !== 'UsernamePassword') {
    throw new Error('SSO 登录页缺少预期的账密登录字段')
  }
  if (form.loginRule !== 'normal' || form.captchaId || form.invisibleCaptcha === 'true' || form.riskSystem === 'USTC') {
    throw new Error('统一认证要求额外验证，请在浏览器中完成登录并使用 SESSION')
  }
  await checkCaptcha(options.username, landing.url, jar, timeoutMs, fetchImpl)

  // 2. Single POST submission with AES-128-ECB encrypted password
  const body = new URLSearchParams({
    username: options.username,
    password: encryptPassword(form.croypto, options.password),
    croypto: form.croypto,
    execution: form.execution,
    type: form.loginType,
    _eventId: 'submit',
    geolocation: '',
    captcha_code: '',
    captcha_payload: encryptPassword(form.croypto, '{}'),
  })

  const action = new URL('login', loginUrl).href
  const postCookie = jar.headerFor(action)
  const submitResponse = await fetchImpl(action, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Origin: SSO,
      Referer: landing.url,
      ...(postCookie ? { Cookie: postCookie } : {}),
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })
  jar.ingest(submitResponse, action)

  if (!isRedirect(submitResponse.status)) {
    const failHtml = await submitResponse.text()
    const failState = extractSsoForm(failHtml)
    if (failState.captchaId || failState.riskMessage || failState.invisibleCaptcha === 'true') {
      throw new Error('SSO 触发额外验证，请在浏览器中完成登录并使用 SESSION')
    }
    throw new Error(`SSO 登录失败 (HTTP ${submitResponse.status})，请在浏览器中检查账号和认证状态`)
  }

  const nextLocation = submitResponse.headers.get('location')
  if (!nextLocation) {
    throw new Error('SSO 登录响应缺少重定向 Location')
  }

  // 3. Follow ticket callback back to byyt.ecnu.edu.cn
  const callbackUrl = new URL(nextLocation, action)
  if (callbackUrl.origin !== BYYT || callbackUrl.pathname !== '/sso/login' || !callbackUrl.searchParams.get('ticket')) {
    throw new Error('统一认证未返回预期的教务票据，请在浏览器中检查认证状态')
  }
  await submitResponse.body?.cancel()
  const finalStep = await followRedirects(callbackUrl.href, jar, { timeoutMs, fetchImpl })
  await finalStep.response.body?.cancel()
  if (new URL(finalStep.url).origin !== BYYT || !finalStep.response.ok) {
    throw new Error('教务系统未接受统一认证票据')
  }

  const session = jar.getValue('SESSION', 'https://byyt.ecnu.edu.cn/student/for-std/lesson-search')
  if (!session) {
    throw new Error('登录回跳完成，但未获取到 byyt 的 SESSION Cookie')
  }
  return session
}
