/*
 * Copyright 2025 SJTU-Geek
 * Copyright 2020-2025 SJTU-Plus
 *
 * ----------------------------------------------------------------
 * Modified by Niazye from ECNU-minus on 2025-11-21
 * Changes:
 * - feat: browse and star
 *
 * Modified by 霧雨バニラ from BetterECNU on 2026-05-23
 * Changes:
 * - feat: 新增 useAllLessons 钩子，支持跨所有学期的课程数据获取，兼容 under/post 拆分格式并回退旧格式
 *
 * Copyright 2025 ECNU-minus
 * ----------------------------------------------------------------
 */

import React, { useCallback, useState } from 'react'
import useSWR from 'swr'

import fetcher, { conversionFetcher, lessonFetcher } from './SWRFetcher'

export function BreakLine(props) {
  const result = props.data.split(props.sep)
  return (
    <ul className='list-unstyled'>
      {result.map((x, idx) => (
        <li key={idx}>{x}</li>
      ))}
    </ul>
  )
}

export function parseTimeLocation(time, location) {
  const tl = []
  if (!time) time = ''
  if (!location) location = ''
  const tt = time.split(';')
  const ll = location.split(';')
  for (let i = 0; i < Math.max(tt.length, ll.length); i++) {
    const time = i < tt.length ? tt[i] : ''
    const location = i < ll.length ? ll[i] : ''
    if (tl.find((val) => val.time === time && val.location === location))
      continue
    tl.push({ time, location })
  }
  return tl
}

function parseWeekSpec(spec) {
  const weeks = new Set()
  spec.split(',').forEach((part) => {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?(?:\((单|双)\))?$/)
    if (!match) return
    const start = parseInt(match[1], 10)
    const end = match[2] ? parseInt(match[2], 10) : start
    const parity = match[3]
    for (let w = start; w <= end; w += 1) {
      if (parity === '单' && w % 2 === 0) continue
      if (parity === '双' && w % 2 === 1) continue
      weeks.add(w)
    }
  })
  return weeks
}

function getDayLocations(time, location, day) {
  return parseTimeLocation(time, location).filter(
    (x) => x.time.substring(0, 3) === dayName[day - 1]
  )
}

function getPeriodLocations(dayLocations, startBlock, endBlock) {
  return dayLocations.flatMap(({ time, location }) => {
    const periods = time.match(/第(\d+)(?:-(\d+))?节/)
    if (!periods) return []
    const start = Number(periods[1])
    const end = Number(periods[2] || periods[1])
    if (start > startBlock || end < endBlock) return []

    const weekSpec = time.match(/\{([^}]+)周\}/)
    return [
      {
        location,
        weeks: parseWeekSpec(weekSpec ? weekSpec[1] : ''),
        exactPeriod: start === startBlock && end === endBlock,
      },
    ]
  })
}

export function parseTimeLocationDay(
  time,
  location,
  day,
  startBlock,
  endBlock,
  weeks
) {
  const dayLocations = getDayLocations(time, location, day)
  if (!dayLocations.length) return '数据解析出错'

  if (startBlock != null && endBlock != null) {
    const periodLocations = getPeriodLocations(
      dayLocations,
      startBlock,
      endBlock
    )
    const weekMatch =
      weeks &&
      periodLocations.find((entry) =>
        weeks.some((week) => entry.weeks.has(week))
      )
    if (weekMatch) return weekMatch.location
    if (periodLocations.length)
      return periodLocations[periodLocations.length - 1].location
  }

  return dayLocations[dayLocations.length - 1].location
}

export function getLessonLocationsByWeek(
  lesson,
  startBlock,
  endBlock,
  weeks,
  rowIndex
) {
  const dayLocations = getDayLocations(lesson.sksj, lesson.jxdd, lesson.xqj)
  const periodLocations = getPeriodLocations(dayLocations, startBlock, endBlock)
  const exactWeeks = periodLocations.filter(
    (entry) =>
      entry.weeks.size === weeks.length &&
      weeks.every((week) => entry.weeks.has(week))
  )
  const exactPeriods = exactWeeks.filter((entry) => entry.exactPeriod)
  const rowMatches = exactPeriods.length ? exactPeriods : exactWeeks
  // Each row has its own week mask, even when its schedule text lists the entire class.
  const rowMatch = rowMatches[rowIndex] || rowMatches[0]
  const fallback =
    periodLocations[periodLocations.length - 1] ||
    dayLocations[dayLocations.length - 1]

  return new Map(
    weeks.map((week) => {
      const weekMatches = periodLocations.filter((entry) =>
        entry.weeks.has(week)
      )
      const match =
        rowMatch ||
        weekMatches.find((entry) => entry.exactPeriod) ||
        weekMatches[0] ||
        fallback
      return [week, match ? match.location : '数据解析出错']
    })
  )
}

export function TimeLocation(props) {
  const result = parseTimeLocation(props.time, props.location)
  return (
    <ul className='list-unstyled'>
      {result.map((lesson, idx) => (
        <li key={idx}>
          {lesson.time} {lesson.location}
        </li>
      ))}
    </ul>
  )
}

export function useLessonData(semester) {
  return useSWR(['lessonData', semester], (_, sem) => {
    const urlUnder = `/course-plus-data/LessonData/Parsed_${sem}_under.json`
    const urlPost = `/course-plus-data/LessonData/Parsed_${sem}_post.json`
    const urlOld = `/course-plus-data/LessonData/Parsed_${sem}.json`

    return Promise.all([
      lessonFetcher(urlUnder).catch(() => null),
      lessonFetcher(urlPost).catch(() => null),
    ]).then(([dataUnder, dataPost]) => {
      if (dataUnder === null && dataPost === null) {
        return lessonFetcher(urlOld)
      }
      const merged = [...(dataUnder || []), ...(dataPost || [])]
      return merged.map((lesson, idx) => {
        lesson.row_id = idx
        return lesson
      })
    })
  })
}

export function useIndexData() {
  return useSWR(`/course-plus-data/lessonData_index.json`, lessonFetcher)
}

export function useLessonDetail() {
  return useSWR(`/course-plus-data/lesson_description_2020.json`, fetcher)
}

export function useLessonConversion() {
  return useSWR(`/course-plus-data/lesson_conversion.json`, conversionFetcher)
}

export const dayName = [
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
  '星期日',
]

export function parseBin(data) {
  const result = []
  let i = 1
  while (data > 0) {
    if (data % 2 === 1) result.push(i)
    i += 1
    data = data >> 1
  }
  return result
}

export function checkBin(data, bit) {
  return (data & (1 << bit)) !== 0
}

export function useLocalStorageSet(key, initialValue) {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState(() => {
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key)
      // Parse stored json or if none return initialValue
      return item ? new Set(JSON.parse(item)) : initialValue
    } catch (error) {
      // If error also return initialValue
      console.log(error)
      return initialValue
    }
  })

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = (value) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value
      // Save state
      setStoredValue(valueToStore)
      // Save to local storage
      window.localStorage.setItem(key, JSON.stringify([...valueToStore]))
    } catch (error) {
      // A more advanced implementation would handle the error case
      console.log(error)
    }
  }

  return [storedValue, setValue]
}

export function filterKeyword(dataRaw, filterForm, lessonConversion) {
  let filteringData = dataRaw
  const keyword = filterForm.keyword.trim()
  const scheduleKey = filterForm.scheduleKey.trim()
  const lecturerKey = filterForm.lecturerKey.trim()
  const placeKey = filterForm.placeKey.trim()
  const composition = filterForm.composition.trim()
  const notes = filterForm.notes.trim()

  if (keyword) {
    filteringData = filteringData.filter((lesson) => {
      if (lesson.kcmc.toLowerCase().includes(keyword.toLowerCase())) {
        return true
      }
      if (lesson.kch.toLowerCase().includes(keyword.toLowerCase())) {
        return true
      }
      if (lessonConversion) {
        if (lessonConversion.to_new[lesson.kch]) {
          if (
            lessonConversion.to_new[lesson.kch]
              .toLowerCase()
              .includes(keyword.toLowerCase())
          ) {
            return true
          }
        }
        if (lessonConversion.to_old[lesson.kch]) {
          if (
            lessonConversion.to_old[lesson.kch]
              .toLowerCase()
              .includes(keyword.toLowerCase())
          ) {
            return true
          }
        }
      }
      return false
    })
  }
  if (scheduleKey) {
    filteringData = filteringData.filter((lesson) =>
      lesson.sksj.includes(scheduleKey)
    )
  }
  if (lecturerKey) {
    filteringData = filteringData.filter((lesson) =>
      lesson.jsxx.includes(lecturerKey)
    )
  }
  if (placeKey) {
    filteringData = filteringData.filter((lesson) =>
      (lesson.jxdd || '').includes(placeKey)
    )
  }
  if (composition) {
    filteringData = filteringData.filter((lesson) =>
      lesson.jxbzc.split(';').some((x) => x.includes(composition))
    )
  }
  if (notes) {
    filteringData = filteringData.filter((lesson) =>
      (lesson.xkbz || '').includes(notes)
    )
  }
  return filteringData
}

export function filterDataForm(dataRaw, filterForm, lessonConversion) {
  let filteringData = filterKeyword(dataRaw, filterForm, lessonConversion)
  const checkedNj = filterForm.checkedNj
  const checkedLx = filterForm.checkedLx
  const checkedYx = filterForm.checkedYx
  const checkedTy = filterForm.checkedTy

  if (checkedNj.size) {
    filteringData = filteringData.filter((lesson) =>
      lesson.nj.split(',').some((x) => checkedNj.has(x))
    )
  }
  if (checkedLx.size) {
    filteringData = filteringData.filter((lesson) =>
      checkedLx.has(lesson.kcxzmc)
    )
  }
  if (checkedYx.size) {
    filteringData = filteringData.filter((lesson) => checkedYx.has(lesson.kkxy))
  }
  if (checkedTy.size) {
    filteringData = filteringData.filter((lesson) =>
      lesson.kzmc.split(',').some((x) => checkedTy.has(x))
    )
  }
  return filteringData
}

export function useAllLessons() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const index = await fetcher('/course-plus-data/lessonData_index.json')
      const results = await Promise.all(
        index.map(async (item) => {
          const sem = `${item.year}_${item.semester}`
          const [underData, postData] = await Promise.all([
            lessonFetcher(
              `/course-plus-data/LessonData/Parsed_${sem}_under.json`
            ).catch(() => null),
            lessonFetcher(
              `/course-plus-data/LessonData/Parsed_${sem}_post.json`
            ).catch(() => null),
          ])

          if (underData === null && postData === null) {
            const oldData = await lessonFetcher(
              `/course-plus-data/LessonData/Parsed_${sem}.json`
            ).catch(() => null)
            return (oldData || []).map((l) => ({
              ...l,
              _semester: sem,
              _year: item.year,
              _term: item.semester,
            }))
          }

          return [
            ...(underData || []).map((l) => ({
              ...l,
              _semester: sem,
              _year: item.year,
              _term: item.semester,
              _source: 'under',
            })),
            ...(postData || []).map((l) => ({
              ...l,
              _semester: sem,
              _year: item.year,
              _term: item.semester,
              _source: 'post',
            })),
          ]
        })
      )
      setData(results.flat())
    } catch (e) {
      setError(e)
    }
    setLoading(false)
  }, [])

  return { data, loading, error, fetchAll }
}
