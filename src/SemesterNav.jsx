/*
 * Copyright 2025 SJTU-Geek
 * Copyright 2020-2025 SJTU-Plus
 *
 * ----------------------------------------------------------------
 * Modified by Niazye and ChiyoYuki from ECNU-minus on 2025-12-02
 * Changes:
 * - fix: semester name's localization
 *
 * Copyright 2025 ECNU-minus
 * ----------------------------------------------------------------
 */

import axios from 'axios'
import React, { useEffect, useState } from 'react'
import Form from 'react-bootstrap/Form'
import { useLocation, useParams, withRouter } from 'react-router-dom'

export default withRouter(({ history }) => {
  const [lessonList, setLessonList] = useState([])
  const location = useLocation()
  const { semester, path } = useParams()

  useEffect(() => {
    const getLessonIndex = async () => {
      const response = (
        await axios.get('/course-plus-data/lessonData_index.json')
      ).data
      const lastIndex = response[response.length - 1]
      if (path) {
        history.push(`/${lastIndex.year}_${lastIndex.semester}/${path}`)
      } else {
        history.push(`/${lastIndex.year}_${lastIndex.semester}/browse`)
      }
      setLessonList(response)
    }

    getLessonIndex().then()
  }, [history])

  const onPathChange = (event) => {
    history.push(`/${event.target.value}/${path}`)
  }

  return (
    <div className='form-row'>
      <Form.Group className='col mb-3'>
        <Form.Label>学年学期</Form.Label>
        <Form.Control as='select' onChange={onPathChange}>
          {lessonList
            .map((option) => {
              let semesterChinese = ''
              if (option.semester === 'Autumn' || option.semester === 'Fall') {
                semesterChinese = '秋'
              } else if (option.semester === 'Spring') {
                semesterChinese = '春'
              } else if (option.semester === 'Summer') {
                semesterChinese = '夏'
              } else if (option.semester === 'Winter') {
                semesterChinese = '冬'
              } else {
                semesterChinese = option.semester
              }
              return (
                <option
                  value={`${option.year}_${option.semester}`}
                  key={`${option.year}_${option.semester}`}
                >
                  {option.year} 学年, {semesterChinese} 学期 (更新于{' '}
                  {option.updated_at})
                </option>
              )
            })
            .reverse()}
        </Form.Control>
      </Form.Group>
    </div>
  )
})
