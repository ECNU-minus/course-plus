import { createEvents } from 'ics'
import moment from 'moment'

import { parseBin, parseTimeLocationDay } from './Utils'

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

export function generateICS(lessons, begin, semester, fixtures) {
  const events = []
  lessons.forEach((lesson) => {
    parseBin(lesson.zcd).forEach((week) => {
      const blocks = parseBin(lesson.cdjc)
      const start = Math.min(...blocks) - 1
      const end = Math.max(...blocks) - 1
      let time = moment(begin).add((week - 1) * 7 + lesson.xqj - 1, 'day')
      fixtures.forEach((rule) => {
        if (rule.week === week && rule.day === lesson.xqj) {
          time = rule.on
        }
      })
      if (!time) return
      const startAt = timeAt[start]
      const endAt = timeAt[end] + 45
      const duration = endAt - startAt
      const event = {
        start: [
          time.year(),
          time.month() + 1,
          time.date(),
          Math.floor(startAt / 60),
          startAt % 60,
        ],
        duration: { hours: Math.floor(duration / 60), minutes: duration % 60 },
        title: `${lesson.kch} ${lesson.kcmc}`,
        description: `${lesson.jszc}, ${lesson.xf} 学分, 第 ${week} 周`,
        location: parseTimeLocationDay(lesson.sksj, lesson.jxdd, lesson.xqj),
        calName: `课程表 ${semester}`,
      }
      events.push(event)
    })
  })
  const { error, value } = createEvents(events)
  if (error) {
    alert(error)
  }
  if (value) return value
  else return ''
}
