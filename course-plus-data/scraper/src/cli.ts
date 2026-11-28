import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadEnvFile } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { loginWithCredentials, type Credentials } from './auth.ts'
import { ByytClient, GRADES, semesterLabel, type Grade } from './client.ts'
import { readSemesterIndex, upsertSemester, writeAtomicText, writeSemesterIndex } from './indexStore.ts'
import { parseLessons } from './parser.ts'
import type { RawLesson, SemesterIndexEntry } from './types.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const usage = `用法:
  scrape sync  [--semester 2026-2027_Spring[,...]] [--grade all|under|post|minor] [--first-day YYYY-MM-DD] [--skip-empty] [--prompt | --use-session]
  scrape probe [--semester 2026-2027_Spring[,...]] [--grade all|under|post|minor] [--prompt | --use-session]
  scrape parse --semester 2026-2027_Spring --input RAW.json [--output PARSED.json]

sync/probe 默认从环境变量或仓库根目录 .env 读取 ECNU_USERNAME、ECNU_PASSWORD。
--semester 留空时默认取 lessonData_index.json 中 first_day 最大的学期；支持逗号分隔多个学期。
--grade 默认 all（一次登录依次抓取 under、post、minor）；--skip-empty 遇 0 条时跳过并保留旧快照。
--prompt 在交互式终端临时输入账密（无回显、不落盘）；--use-session 优先使用 SESSION 调试。`

interface TargetSemester {
  raw: string
  academicYear: string
  semester: SemesterIndexEntry['semester']
}

interface PendingWrite {
  entry: SemesterIndexEntry
  snapshots: { filename: string; content: string }[]
}

function isValidDate(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  )
}

function parseSemesterSpec(raw: string): TargetSemester {
  const match = raw.trim().match(/^(\d{4})-(\d{4})_(Autumn|Spring|Summer)$/)
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error(`--semester "${raw}" 无效，应为 2026-2027_Spring 这样的连续学年与学期`)
  }
  return {
    raw: `${match[1]}-${match[2]}_${match[3]}`,
    academicYear: `${match[1]}-${match[2]}`,
    semester: match[3] as SemesterIndexEntry['semester'],
  }
}

function resolveGrades(raw: string): Grade[] {
  if (raw === 'all') return [...GRADES]
  if ((GRADES as readonly string[]).includes(raw)) return [raw as Grade]
  throw new Error('--grade 应为 all、under、post 或 minor')
}

function pickLatestSemester(index: readonly SemesterIndexEntry[]): TargetSemester {
  const valid = index.filter((item) => isValidDate(item.first_day))
  if (valid.length === 0) {
    throw new Error('lessonData_index.json 中没有有效 first_day 的学期，请显式传入 --semester')
  }
  const latest = valid.reduce((a, b) => (b.first_day > a.first_day ? b : a))
  return parseSemesterSpec(`${latest.year}_${latest.semester}`)
}

async function saveBatch(batches: readonly PendingWrite[]): Promise<string[]> {
  if (batches.length === 0) return []

  const lessonDir = join(root, 'LessonData')
  const indexPath = join(root, 'lessonData_index.json')
  let nextIndex = await readSemesterIndex(indexPath)
  let indexChanged = false
  const changed: string[] = []

  await mkdir(lessonDir, { recursive: true })

  for (const { entry, snapshots } of batches) {
    let dataChanged = false
    for (const { filename, content } of snapshots) {
      const filePath = join(lessonDir, filename)
      const prior = await readFile(filePath, 'utf8').catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err
        return undefined
      })
      if (prior !== content) {
        await writeAtomicText(filePath, content)
        changed.push(filename)
        dataChanged = true
      }
    }

    const existing = nextIndex.find((x) => x.year === entry.year && x.semester === entry.semester)
    if (dataChanged || !existing || (snapshots.length > 0 && existing.seme_id !== entry.seme_id)) {
      nextIndex = upsertSemester(nextIndex, entry)
      indexChanged = true
    } else if (existing.first_day !== entry.first_day) {
      nextIndex = upsertSemester(nextIndex, { ...existing, first_day: entry.first_day })
      indexChanged = true
    }
  }

  if (indexChanged) {
    await writeSemesterIndex(indexPath, nextIndex)
    changed.push('lessonData_index.json')
  }
  return changed
}

async function promptCredentials(): Promise<Credentials> {
  const { stdin, stdout } = process
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('--prompt 仅支持交互式终端')

  const rl = createInterface({ input: stdin, output: stdout })
  const username = await rl.question('ECNU 学号/工号: ').finally(() => rl.close())
  if (!username.trim()) throw new Error('学号/工号不能为空')

  stdout.write('ECNU 密码: ')
  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  stdin.resume()

  const password = await new Promise<string>((resolve, reject) => {
    const chars: string[] = []
    const finish = (err?: Error) => {
      stdin.off('data', onData)
      stdin.off('end', onEnd)
      stdin.setRawMode(wasRaw)
      stdin.pause()
      stdout.write('\n')
      if (err) reject(err)
      else resolve(chars.join(''))
    }
    const onEnd = () => finish()
    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      if (text.startsWith('\u001b')) return
      for (const ch of text) {
        if (ch === '\r' || ch === '\n') return finish()
        if (ch === '\u0003' || ch === '\u0004') return finish(new Error('已取消输入'))
        if (ch === '\u007f' || ch === '\b') chars.pop()
        else if (ch >= ' ') chars.push(ch)
      }
    }
    stdin.on('data', onData)
    stdin.once('end', onEnd)
  })

  if (!password) throw new Error('密码不能为空')
  return { username: username.trim(), password }
}

async function getSession(options: { useSession: boolean; prompt: boolean }): Promise<string> {
  if (options.useSession && options.prompt) throw new Error('--prompt 与 --use-session 不能同时使用')
  try {
    loadEnvFile(join(root, '.env'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  if (options.prompt) return loginWithCredentials(await promptCredentials())

  const { ECNU_USERNAME, ECNU_PASSWORD, SESSION } = process.env
  if (!options.useSession && (ECNU_USERNAME || ECNU_PASSWORD)) {
    if (!ECNU_USERNAME || !ECNU_PASSWORD) throw new Error('请同时设置 ECNU_USERNAME 和 ECNU_PASSWORD')
    return loginWithCredentials({ username: ECNU_USERNAME.trim(), password: ECNU_PASSWORD })
  }
  if (SESSION) return SESSION
  throw new Error('请设置 ECNU_USERNAME 和 ECNU_PASSWORD，使用 --prompt 临时输入，或提供本地调试用的 SESSION')
}

function renderLessons(lessons: RawLesson[], target: TargetSemester): string {
  if (!Array.isArray(lessons)) throw new Error('原始课程数据应为数组')
  const { rows, warnings } = parseLessons(lessons, {
    academicYear: target.academicYear,
    semester: target.semester,
  })
  for (const warning of warnings) console.warn(warning)
  return `${JSON.stringify(rows, null, 4)}\n`
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      semester: { type: 'string' },
      grade: { type: 'string', default: 'all' },
      'first-day': { type: 'string' },
      'skip-empty': { type: 'boolean', default: false },
      'use-session': { type: 'boolean', default: false },
      prompt: { type: 'boolean', default: false },
      input: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [command] = positionals
  if (values.help || !command) {
    console.log(usage)
    return
  }
  if (positionals.length !== 1 || !['parse', 'probe', 'sync'].includes(command)) {
    throw new Error('请选择 sync、probe 或 parse，使用 --help 查看用法')
  }

  if (command === 'parse') {
    if (!values.semester || !values.input) throw new Error('离线解析需要 --semester 和 --input')
    const snapshot = renderLessons(JSON.parse(await readFile(values.input, 'utf8')), parseSemesterSpec(values.semester))
    if (values.output) await writeFile(values.output, snapshot, 'utf8')
    else process.stdout.write(snapshot)
    return
  }

  const grades = resolveGrades(values.grade)
  const index = await readSemesterIndex(join(root, 'lessonData_index.json'))
  const rawSemesters = values.semester
    ? [...new Set(values.semester.split(',').map((s) => s.trim()).filter(Boolean))]
    : []
  const targets = rawSemesters.length > 0 ? rawSemesters.map(parseSemesterSpec) : [pickLatestSemester(index)]

  if (values['first-day'] !== undefined && (command !== 'sync' || rawSemesters.length !== 1)) {
    throw new Error('--first-day 只用于 sync，且需要同时通过 --semester 指定单个学期')
  }

  const firstDays = new Map<string, string>()
  if (command === 'sync') {
    for (const target of targets) {
      const firstDay =
        values['first-day'] ??
        index.find((x) => x.year === target.academicYear && x.semester === target.semester)?.first_day
      if (!isValidDate(firstDay)) {
        throw new Error(`学期 ${target.raw} 缺少有效的 YYYY-MM-DD 格式 first_day，请通过 --first-day 提供或先写入索引`)
      }
      if (new Date(firstDay).getUTCDay() !== 1) {
        throw new Error(`学期 ${target.raw} 的 first_day 必须是第一教学周的周一，请通过 --first-day 修正`)
      }
      firstDays.set(target.raw, firstDay)
    }
  }

  const client = new ByytClient({
    session: await getSession({ useSession: values['use-session'], prompt: values.prompt }),
  })
  const stuId = process.env.STU_ID || (await client.discoverStuId())
  const semesterOptions = await client.fetchSemesterOptions(stuId)
  const resolved = targets.map((target) => {
    const label = semesterLabel(target.academicYear, target.semester)
    const semesterId = semesterOptions.get(label)
    if (!semesterId) throw new Error(`教务查询页未提供 ${label} 学期`)
    return { target, label, semesterId }
  })

  if (command === 'probe') {
    for (const { target, semesterId } of resolved) {
      for (const grade of grades) {
        const { data, _page_ } = await client.fetchLessonPage({ stuId, semesterId, grade })
        console.log(`${target.raw} ${grade} 查询成功，首页 ${data.length} 条，共 ${_page_.totalRows} 条`)
      }
    }
    return
  }

  const [updated_at, updated_time] = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'short',
    timeStyle: 'short',
  })
    .format(new Date())
    .split(/\s+/)

  const pendingWrites: PendingWrite[] = []

  for (const { target, label, semesterId } of resolved) {
    const firstDay = firstDays.get(target.raw)!
    const existing = index.find((x) => x.year === target.academicYear && x.semester === target.semester)
    const calendarCorrection = values['first-day'] !== undefined && existing && existing.first_day !== firstDay
    const snapshots: PendingWrite['snapshots'] = []
    for (const grade of grades) {
      const { lessons, totalRows } = await client.fetchAllLessons({ stuId, semesterId, grade })
      if (totalRows === 0) {
        if (values['skip-empty'] || grades.length > 1 || calendarCorrection) {
          console.log(`${target.raw} ${grade} 上游为 0 条，已跳过（保留旧快照）`)
          continue
        }
        throw new Error(`${label} ${grade} 没有可写入的课程记录`)
      }
      snapshots.push({ filename: `Parsed_${target.raw}_${grade}.json`, content: renderLessons(lessons, target) })
    }

    if (snapshots.length > 0 || calendarCorrection) {
      pendingWrites.push({
        entry: {
          year: target.academicYear,
          semester: target.semester,
          first_day: firstDay,
          seme_id: semesterId,
          updated_at,
          updated_time,
        },
        snapshots,
      })
    }
  }

  if (pendingWrites.length === 0 && !values['skip-empty']) {
    throw new Error('目标学期和类别均没有可写入的课程记录')
  }

  const changed = await saveBatch(pendingWrites)
  console.log(changed.length > 0 ? `已更新 ${changed.join(', ')}` : '课程快照与索引均无变化')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
