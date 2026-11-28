import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { SemesterIndexEntry } from './types.ts'

export async function readSemesterIndex(indexPath: string): Promise<SemesterIndexEntry[]> {
  const index: unknown = JSON.parse(await readFile(indexPath, 'utf8'))
  if (!Array.isArray(index)) throw new Error(`学期索引应为数组: ${indexPath}`)
  return index
}

export function upsertSemester(
  index: readonly SemesterIndexEntry[],
  entry: SemesterIndexEntry,
): SemesterIndexEntry[] {
  const position = index.findIndex(({ year, semester }) =>
    year === entry.year && semester === entry.semester,
  )
  if (position === -1) return [...index, entry]

  const updated = [...index]
  updated[position] = { ...updated[position], ...entry }
  return updated
}

export async function writeAtomicText(path: string, content: string): Promise<void> {
  const temporaryDirectory = await mkdtemp(join(dirname(path), '.course-plus-write-'))
  const temporaryPath = join(temporaryDirectory, 'snapshot')
  try {
    await writeFile(temporaryPath, content, 'utf8')
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

export function writeSemesterIndex(indexPath: string, index: readonly SemesterIndexEntry[]): Promise<void> {
  return writeAtomicText(indexPath, `${JSON.stringify(index, null, 4)}\n`)
}
