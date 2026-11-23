/*
 * Copyright 2025 SJTU-Geek
 * Copyright 2020-2025 SJTU-Plus
 *
 * ----------------------------------------------------------------
 * Modified by Niazye and ChiyoYuki from ECNU-minus on 2025-12-02
 * Changes:
 * - fix: time table
 *
 * Copyright 2025 ECNU-minus
 * ----------------------------------------------------------------
 */

import { createEvents } from 'ics'
import moment from 'moment'

import { getLessonLocationsByWeek, parseBin } from './Utils'

const shanghaiTime = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Shanghai',
  timeZoneName: 'longOffset',
})

const timeAt = [
  '8:00',
  '8:50',
  '9:50',
  '10:40',
  '11:30',
  '13:00',
  '13:50',
  '14:50',
  '15:40',
  '16:30',
  '18:00',
  '18:50',
  '19:40',
  '20:30',
].map((x) => {
  const [hour, minute] = x.split(':')
  return parseInt(hour) * 60 + parseInt(minute)
})

function splitWeeksIntoSegments(weeks) {
  const segments = []
  let i = 0
  while (i < weeks.length) {
    if (i === weeks.length - 1) {
      segments.push({
        startWeek: weeks[i],
        endWeek: weeks[i],
        interval: 1,
        count: 1,
      })
      i += 1
      continue
    }

    const diff = weeks[i + 1] - weeks[i]
    let endIdx = i + 1
    while (
      endIdx + 1 < weeks.length &&
      weeks[endIdx + 1] - weeks[endIdx] === diff
    ) {
      endIdx += 1
    }

    const count = endIdx - i + 1
    if (
      diff > 1 &&
      count === 2 &&
      endIdx + 1 < weeks.length &&
      weeks[endIdx + 1] - weeks[endIdx] === 1
    ) {
      segments.push({
        startWeek: weeks[i],
        endWeek: weeks[i],
        interval: 1,
        count: 1,
      })
      i += 1
      continue
    }

    segments.push({
      startWeek: weeks[i],
      endWeek: weeks[endIdx],
      interval: diff,
      count,
    })
    i = endIdx + 1
  }
  return segments
}

function formatWeekRange({ startWeek, endWeek, interval, count }) {
  if (count === 1) {
    return `第 ${startWeek} 周`
  }
  if (interval === 1) {
    return `第 ${startWeek}-${endWeek} 周`
  }
  if (interval === 2) {
    const parity = startWeek % 2 === 1 ? '单周' : '双周'
    return `第 ${startWeek}-${endWeek} 周 (${parity})`
  }
  return `第 ${startWeek}-${endWeek} 周 (每 ${interval} 周)`
}

function splitBlocksIntoRanges(blocks) {
  if (!blocks.length) return []
  const ranges = []
  let rangeStart = blocks[0]
  let rangeEnd = blocks[0]
  for (let i = 1; i < blocks.length; i += 1) {
    if (blocks[i] === rangeEnd + 1) {
      rangeEnd = blocks[i]
    } else {
      ranges.push([rangeStart, rangeEnd])
      rangeStart = blocks[i]
      rangeEnd = blocks[i]
    }
  }
  ranges.push([rangeStart, rangeEnd])
  return ranges
}

function calendarDate(time) {
  return moment.utc([time.year(), time.month(), time.date()])
}

function toICSStart(time, startAt) {
  const date = calendarDate(time)
  if (!date.isValid()) throw new Error('调课日期无效')

  const { value: offset } = shanghaiTime
    .formatToParts(date.toDate())
    .find(({ type }) => type === 'timeZoneName')
  const start = date.utcOffset(offset, true).add(startAt, 'minutes').utc()
  return [
    start.year(),
    start.month() + 1,
    start.date(),
    start.hour(),
    start.minute(),
  ]
}

export function generateICS(lessons, begin, semester, fixtures = []) {
  const firstDay = calendarDate(moment(begin))
  if (begin == null || !firstDay.isValid()) throw new Error('学期开始日期无效')

  const events = []
  const matchingRows = new Map()
  lessons.forEach((lesson) => {
    const blockRanges = splitBlocksIntoRanges(parseBin(lesson.cdjc))
    const allWeeks = parseBin(lesson.zcd)
    if (!blockRanges.length || !allWeeks.length) return

    let rowIndex = 0
    if (lesson.jxbmc) {
      // Parallel rooms with the same schedule appear in the same order as the rows.
      const key = JSON.stringify([
        lesson.jxbmc,
        lesson.xqj,
        lesson.cdjc,
        lesson.zcd,
        lesson.sksj,
        lesson.jxdd,
      ])
      rowIndex = matchingRows.get(key) || 0
      matchingRows.set(key, rowIndex + 1)
    }

    blockRanges.forEach(([startBlock, endBlock]) => {
      const startAt = timeAt[startBlock - 1]
      const endAt = timeAt[endBlock - 1] + 45
      const duration = endAt - startAt
      const locationsByWeek = getLessonLocationsByWeek(
        lesson,
        startBlock,
        endBlock,
        allWeeks,
        rowIndex
      )

      const buildEvent = (time, location, weekLabel, recurrenceRule) => {
        const event = {
          start: toICSStart(time, startAt),
          startInputType: 'utc',
          startOutputType: 'utc',
          duration: {
            hours: Math.floor(duration / 60),
            minutes: duration % 60,
          },
          title: `${lesson.kch} ${lesson.kcmc}`,
          description: `${lesson.jszc}, ${lesson.xf} 学分, ${weekLabel}`,
          location,
          calName: `课程表 ${semester}`,
        }
        if (recurrenceRule) {
          event.recurrenceRule = recurrenceRule
        }
        return event
      }

      const normalWeeksByLocation = new Map()
      locationsByWeek.forEach((location, week) => {
        let overridden = false
        let overrideTime = null
        fixtures.forEach((rule) => {
          if (rule.week === week && rule.day === lesson.xqj) {
            overridden = true
            overrideTime = rule.on
          }
        })
        if (overridden) {
          if (overrideTime) {
            events.push(buildEvent(overrideTime, location, `第 ${week} 周`))
          }
        } else {
          const normalWeeks = normalWeeksByLocation.get(location) || []
          normalWeeks.push(week)
          normalWeeksByLocation.set(location, normalWeeks)
        }
      })

      normalWeeksByLocation.forEach((normalWeeks, location) => {
        splitWeeksIntoSegments(normalWeeks).forEach((segment) => {
          const time = firstDay
            .clone()
            .add((segment.startWeek - 1) * 7 + lesson.xqj - 1, 'day')
          let recurrenceRule
          if (segment.count > 1) {
            const interval =
              segment.interval === 1 ? '' : `;INTERVAL=${segment.interval}`
            recurrenceRule = `FREQ=WEEKLY${interval};COUNT=${segment.count}`
          }
          events.push(
            buildEvent(time, location, formatWeekRange(segment), recurrenceRule)
          )
        })
      })
    })
  })
  if (!events.length) return ''
  const { error, value } = createEvents(events)
  if (error) throw error
  if (typeof value !== 'string' || !value) throw new Error('生成课表文件失败')
  return value
}
