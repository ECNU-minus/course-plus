import type { RawLesson, Semester } from './types.ts'

export const GRADES = ['under', 'post', 'minor'] as const
export type Grade = (typeof GRADES)[number]

const BIZ_TYPE_ASSOC: Record<Grade, string> = {
  under: '2',
  post: '3',
  minor: '4',
}

export interface LessonPageResponse {
  data: RawLesson[]
  _page_: {
    totalRows: number
  }
}

export interface ClientOptions {
  session: string
  baseUrl?: string
  timeoutMs?: number
  retries?: number
  fetchImpl?: typeof fetch
}

export class SessionExpiredError extends Error {
  constructor(message = 'Session 已失效，请求被重定向至统一身份认证') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

const DEFAULT_BASE_URL = 'https://byyt.ecnu.edu.cn'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RETRIES = 2
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const LESSON_SEARCH = '/student/for-std/lesson-search'
const SEMESTER_LABELS: Record<Semester, string> = { Autumn: '秋', Spring: '春', Summer: '夏' }

export function semesterLabel(academicYear: string, semester: Semester): string {
  const [start, end] = academicYear.split('-')
  return `${semester === 'Autumn' ? start : end}${SEMESTER_LABELS[semester]}`
}

function readSemesterOptions(html: string): Map<string, string> {
  const select = html.match(/<select\b[^>]*\s+id\s*=\s*(?:"semesterAssocs"|'semesterAssocs'|semesterAssocs(?=[\s>]))[^>]*>([\s\S]*?)<\/select\s*>/i)?.[1]
  const options = new Map<string, string>()
  for (const match of (select ?? '').matchAll(/<option\b[^>]*\s+value\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+)(?=[\s>]))[^>]*>([^<]*)/gi)) {
    const [, doubleQuoted, singleQuoted, bare, text] = match
    options.set(text.trim(), doubleQuoted ?? singleQuoted ?? bare)
  }
  if (options.size === 0) throw new Error('课程查询页缺少学期选项 semesterAssocs')
  return options
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

function isLoginRedirect(target: URL): boolean {
  return target.hostname === 'sso.ecnu.edu.cn' || (target.hostname === 'byyt.ecnu.edu.cn' && (
    target.pathname === '/sso/login' || (target.pathname === '/' && target.searchParams.has('refer'))
  ))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; retries: number; fetchImpl: typeof fetch },
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      const response = await options.fetchImpl(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
      })
      if (RETRYABLE_STATUS.has(response.status) && attempt < options.retries) {
        await response.body?.cancel()
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt))
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt < options.retries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt))
        continue
      }
    }
  }
  throw lastError
}

export class ByytClient {
  #session: string
  #baseUrl: string
  #timeoutMs: number
  #retries: number
  #fetchImpl: typeof fetch

  constructor(options: ClientOptions) {
    this.#session = options.session
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.#retries = options.retries ?? DEFAULT_RETRIES
    this.#fetchImpl = options.fetchImpl ?? fetch
  }

  async #request(url: string): Promise<Response> {
    if (new URL(url).origin !== new URL(this.#baseUrl).origin) {
      throw new Error('课程查询重定向离开教务站点')
    }
    const response = await fetchWithRetry(
      url,
      { headers: { Cookie: `SESSION=${this.#session}` } },
      { timeoutMs: this.#timeoutMs, retries: this.#retries, fetchImpl: this.#fetchImpl },
    )

    if (isRedirect(response.status)) {
      const location = response.headers.get('location')
      if (location && isLoginRedirect(new URL(location, url))) {
        await response.body?.cancel()
        throw new SessionExpiredError()
      }
    }

    return response
  }

  /**
   * 尝试从课表查询入口自动发现 6 位 STU_ID（站内跳转或页面链接）。
   */
  async discoverStuId(entryPath = LESSON_SEARCH): Promise<string> {
    let currentUrl = `${this.#baseUrl}${entryPath}`
    for (let hop = 0; hop < 5; hop += 1) {
      const response = await this.#request(currentUrl)
      if (isRedirect(response.status)) {
        const location = response.headers.get('location')
        if (!location) break
        const nextUrl = new URL(location, currentUrl)
        if (nextUrl.origin !== new URL(this.#baseUrl).origin) {
          throw new Error('课程查询重定向离开教务站点')
        }
        const match = nextUrl.pathname.match(/\/lesson-search\/(?:index|search)\/(\d{6})\/?$/)
        if (match) return match[1]
        currentUrl = nextUrl.href
        continue
      }

      if (!response.ok) {
        throw new Error(`发现 STU_ID 失败: HTTP ${response.status}`)
      }
      const html = await response.text()
      const match = html.match(/\/lesson-search\/(?:index|search)\/(\d{6})\b/)
      if (match) return match[1]
      break
    }

    throw new Error('未能自动发现 6 位 STU_ID，可在 .env 中显式配置 STU_ID')
  }

  async fetchSemesterOptions(stuId: string): Promise<Map<string, string>> {
    if (!/^\d{6}$/.test(stuId)) throw new Error('STU_ID 应为六位数字')
    const response = await this.#request(`${this.#baseUrl}${LESSON_SEARCH}/index/${stuId}`)
    if (!response.ok) throw new Error(`读取学期列表失败: HTTP ${response.status}`)
    return readSemesterOptions(await response.text())
  }

  async fetchLessonPage(params: {
    stuId: string
    semesterId: string
    grade: Grade
    pageNum?: number
    pageSize?: number
  }): Promise<LessonPageResponse> {
    const pageNum = params.pageNum ?? 1
    const pageSize = params.pageSize ?? 20
    if (!/^\d{6}$/.test(params.stuId)) throw new Error('STU_ID 应为六位数字')
    const url = new URL(`${this.#baseUrl}${LESSON_SEARCH}/search/${params.stuId}`)
    url.searchParams.set('bizTypeAssoc', BIZ_TYPE_ASSOC[params.grade])
    url.searchParams.set('semesterAssocs', params.semesterId)
    url.searchParams.set('searchTeachingSyllabus', 'true')
    url.searchParams.set('queryPage__', `${pageNum},${pageSize}`)

    const response = await this.#request(url.toString())
    if (isRedirect(response.status)) {
      throw new Error(`课程接口发生未预期重定向: HTTP ${response.status}`)
    }
    if (!response.ok) {
      throw new Error(`课程接口请求失败: HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      throw new Error(`课程接口返回非 JSON 内容: ${contentType || '(空)'}`)
    }

    const payload: unknown = await response.json()
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !Array.isArray((payload as LessonPageResponse).data) ||
      !Number.isSafeInteger((payload as LessonPageResponse)._page_?.totalRows) ||
      (payload as LessonPageResponse)._page_.totalRows < 0
    ) {
      throw new Error('课程接口响应结构异常，缺少 data 或 _page_.totalRows')
    }

    return payload as LessonPageResponse
  }

  async fetchAllLessons(params: {
    stuId: string
    semesterId: string
    grade: Grade
    pageSize?: number
  }): Promise<{ lessons: RawLesson[]; totalRows: number }> {
    const pageSize = params.pageSize ?? 1000
    if (!Number.isSafeInteger(pageSize) || pageSize <= 0) throw new Error('分页大小应为正整数')
    const collect = async () => {
      const probe = await this.fetchLessonPage({ ...params, pageNum: 1, pageSize: 20 })
      const totalRows = probe._page_.totalRows
      if (totalRows === 0 && probe.data.length !== 0) {
        throw new Error(`课程接口响应矛盾: totalRows 为 0，但首页返回 ${probe.data.length} 条`)
      }

      const totalPages = Math.ceil(totalRows / pageSize)
      const lessons: RawLesson[] = []
      for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
        const page = await this.fetchLessonPage({ ...params, pageNum, pageSize })
        if (page._page_.totalRows !== totalRows) return null
        lessons.push(...page.data)
      }

      if (lessons.length !== totalRows) {
        throw new Error(`分页数据不完整: 预期 ${totalRows} 条，实际 ${lessons.length} 条`)
      }

      return { lessons, totalRows }
    }

    const result = (await collect()) ?? (await collect())
    if (!result) throw new Error('分页总条数在重试后仍不一致')
    return result
  }
}
