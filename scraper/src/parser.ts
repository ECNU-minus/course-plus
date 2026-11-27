import type { ParsedLesson, RawLesson, Semester, SemesterCode } from './types.ts'

const DAY_NAMES = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
const SEMESTER_CODES: Record<Semester, SemesterCode> = { Autumn: 1, Spring: 2, Summer: 3 }
const TIME_BLOCK = /^([\d,~()单双-]+)周\s+(\S+)\s+(\d+(?:[~-]\d+)?)节\s*(.*)$/s
const WEEK_PREFIX = /^[\d,~()单双-]+周(?:\s|$)/

interface TimeBlock {
  day: number
  period: string
  weeks: string
  location: string
  weekMask: number
  periodMask: number
}

function splitVariant(text: string): [label: string | undefined, time: string] {
  const markedText = text.slice(1).trimStart()
  const prefix = /^(\S+)(?:\s+|$)/.exec(markedText)
  if (!prefix) return [undefined, markedText]

  const tail = markedText.slice(prefix[0].length)
  if (WEEK_PREFIX.test(prefix[1]) && !WEEK_PREFIX.test(tail)) return [undefined, markedText]
  return [prefix[1], tail]
}

function toMask(ranges: string, minimum = 1): number | undefined {
  let mask = 0
  for (const range of ranges.split(',')) {
    const match = /^(\d+)(?:-(\d+))?(?:\(([单双])\))?$/.exec(range)
    if (!match) return undefined

    const [, first, last, parity] = match
    const start = Number(first)
    const end = Number(last ?? first)
    // The frontend decodes these masks with signed 32-bit shifts.
    if (start < minimum || end < start || end > 31) return undefined
    // Week zero can appear in the source, but bit zero represents week one.
    for (let position = Math.max(1, start); position <= end; position += 1) {
      if (parity && position % 2 !== Number(parity === '单')) continue
      mask |= 1 << (position - 1)
    }
  }
  return mask
}

function parseTimeBlock(text: string, teachers: ReadonlySet<string>): TimeBlock | undefined {
  const match = TIME_BLOCK.exec(text)
  if (!match) return undefined

  const [, weekText, dayName, periodText, locationText] = match
  const day = DAY_NAMES.indexOf(dayName) + 1
  const weeks = weekText.replaceAll('~', '-')
  const period = periodText.replaceAll('~', '-')
  const weekMask = toMask(weeks, 0)
  const periodMask = toMask(period)
  if (!day || weekMask === undefined || periodMask === undefined) return undefined

  const location = locationText.trim().split(/\s+/)
    .filter((part) => !teachers.has(part))
    .join(' ')
  return { day, period, weeks, location, weekMask, periodMask }
}

function mergeTimeBlocks(blocks: readonly TimeBlock[]) {
  const grouped = new Map<string, { block: TimeBlock; weeks: Set<string>; weekMask: number }>()
  for (const block of blocks) {
    const key = JSON.stringify([block.day, block.period, block.location])
    const group = grouped.get(key)
    if (group) {
      group.weeks.add(block.weeks)
      group.weekMask |= block.weekMask
    } else {
      grouped.set(key, { block, weeks: new Set([block.weeks]), weekMask: block.weekMask })
    }
  }

  return Array.from(grouped.values(), ({ block, weeks, weekMask }) => ({
    ...block,
    weeks: `${[...weeks].join(',')}周`,
    weekMask,
  }))
}

export function parseLessons(
  lessons: readonly RawLesson[],
  { academicYear, semester }: { academicYear: string; semester: Semester },
): { rows: ParsedLesson[]; warnings: string[] } {
  const rows: ParsedLesson[] = []
  const warnings: string[] = []
  const semesterCode = SEMESTER_CODES[semester]

  lessons.forEach((lesson, idx) => {
    const teachers = lesson.teacherAssignmentList.map(({ person }) => person.nameZh)
    const teacherNames = teachers.join(',')
    const teacherSet = new Set(teachers)
    const className = `(${academicYear}-${semesterCode})-${lesson.code}`
    const years = new Set(lesson.nameZh.match(/(?<!\d)\d{4}(?!\d)/g))
    const base = {
      zjs: teachers[0] ?? '',
      jszc: teacherNames,
      kch: lesson.course.code,
      kkxy: lesson.openDepartment.nameZh,
      kcmc: lesson.course.nameZh,
      xf: lesson.course.credits,
      rwzxs: lesson.requiredPeriodInfo.total,
      jxbzc: lesson.nameZh,
      kcxzmc: lesson.compulsorys.join(',') || 'UNKNOWN',
      xkbz: lesson.remark,
      xn: academicYear,
      jsxx: teacherNames,
      xq: semesterCode,
      nj: [...years].join(',') || '无年级',
      kzmc: lesson.courseType?.nameZh ?? '',
      limit: lesson.limitCount ,
    }

    const shared: TimeBlock[] = []
    const variants = new Map<string | symbol, TimeBlock[]>()
    let invalidBlocks = 0
    const schedule = lesson.scheduleText?.dateTimePlacePersonText?.textZh ?? ''
    for (const part of schedule.split(/[;；]/)) {
      const text = part.trim()
      if (!text) continue
      const marked = text.startsWith('#')
      const [label, time] = marked ? splitVariant(text) : [undefined, text]
      const block = parseTimeBlock(time, teacherSet)
      if (!block) invalidBlocks += 1
      if (marked) {
        const key = label ?? Symbol()
        const blocks = variants.get(key) ?? []
        if (block) blocks.push(block)
        variants.set(key, blocks)
      } else if (block) {
        shared.push(block)
      }
    }

    if (invalidBlocks) warnings.push(`${className} 有 ${invalidBlocks} 个排课时间块无法解析`)

    const groups = variants.size ? [...variants.values()] : [[]]
    const previousCount = rows.length

    groups.forEach((blocks, i) => {
      const times = mergeTimeBlocks([...blocks, ...shared])
      const jxbmc = groups.length > 1 ? `${className}#${i + 1}` : className
      const sksj = times.map(({ day, period, weeks }) => `${DAY_NAMES[day - 1]}第${period}节{${weeks}}`)
        .join(';')
      const jxdd = times.map(({ location }) => location).join(';')

      times.forEach(({ day, period, weeks, weekMask, periodMask }, j) => {
        rows.push({
          ...base,
          jxbmc,
          qsjsz: weeks,
          xqj: day,
          zcd: weekMask,
          sksj,
          skjc: `${period}节`,
          cdjc: periodMask,
          row_id: `${idx}_${i}_${j}`,
          jxdd,
        })
      })
    })

    if (rows.length === previousCount) {
      rows.push({
        ...base,
        jxbmc: className,
        qsjsz: '',
        xqj: 0,
        zcd: 0,
        sksj: '',
        skjc: '',
        cdjc: 0,
        row_id: `${idx}_0_0`,
        jxdd: '',
      })
    }
  })

  return { rows, warnings }
}
