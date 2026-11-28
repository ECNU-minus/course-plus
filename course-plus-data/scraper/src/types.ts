export type Semester = 'Autumn' | 'Spring' | 'Summer'
export type SemesterCode = 1 | 2 | 3

export interface RawLesson {
  code: string
  nameZh: string
  course: { code: string; nameZh: string; credits: number }
  teacherAssignmentList: { person: { nameZh: string } }[]
  openDepartment: { nameZh: string }
  requiredPeriodInfo: { total: number }
  compulsorys: string[]
  remark: string | null
  courseType?: { nameZh: string } | null
  scheduleText?: {
    dateTimePlacePersonText?: { textZh: string | null } | null
  } | null
  limitCount: number | null
}

export interface ParsedLesson {
  qsjsz: string
  zjs: string
  jszc: string
  xqj: number
  kch: string
  kkxy: string
  zcd: number
  sksj: string
  kcmc: string
  skjc: string
  jxbmc: string
  xf: number
  rwzxs: number
  jxbzc: string
  kcxzmc: string
  xkbz: string | null
  cdjc: number
  xn: string
  jsxx: string
  xq: SemesterCode
  nj: string
  row_id: string
  kzmc: string
  jxdd: string
  limit: number
}

export interface SemesterIndexEntry {
  year: string
  semester: Semester
  updated_at: string
  first_day: string
  updated_time?: string
  seme_id?: string
}
