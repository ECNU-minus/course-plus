/*
 * Copyright 2025 SJTU-Geek
 * Copyright 2020-2025 SJTU-Plus
 *
 * ----------------------------------------------------------------
 * Modified by Niazye and ChiyoYuki from ECNU-minus on 2025-12-03
 * Changes:
 * - feat: update info
 *
 * Copyright 2025 ECNU-minus
 * ----------------------------------------------------------------
 */

import './App.scss'

import axios from 'axios'
import chroma from 'chroma-js'
import { groupBy } from 'lodash'
import forEach from 'lodash/forEach'
import sortedBy from 'lodash/sortBy'
import React, { useReducer, useState } from 'react'
import GitHubButton from 'react-github-btn'
import {
  HashRouter as Router,
  matchPath,
  Route,
  Switch,
  useLocation,
  useParams,
} from 'react-router-dom'

import ClassTable from './ClassTable'
import ClassTableForm from './ClassTableForm'
import FilterForm from './FilterForm'
import LessonList from './LessonList'
import LoginModal from './LoginModal'
import Navbar from './Navbar'
import PlanForm from './PlanForm'
import SemesterNav from './SemesterNav'
import ShowClassTable from './ShowClassTable'
import SyncButton from './SyncButton'
import { useLocalStorageSet } from './Utils'

function App() {
  const [isMenuOpen, setMenuOpen] = useState(false)
  const [filterFormState, setFilterFormState] = useReducer(
    (state, newState) => ({ ...state, ...newState }),
    {
      checkedNj: new Set(),
      checkedLx: new Set(),
      checkedYx: new Set(),
      checkedTy: new Set(),
      scheduleKey: '',
      lecturerKey: '',
      placeKey: '',
      keywordType: 'kcmc',
      keyword: '',
      composition: '',
      notes: '',
    }
  )

  const [starLesson, setStarLesson] = useLocalStorageSet(
    'starLesson',
    new Set([])
  )
  const [selectedLesson, setSelectedLesson] = useLocalStorageSet(
    'selectedLesson',
    new Set([])
  )
  const [sjtuLesson, setSjtuLesson] = useLocalStorageSet(
    'sjtuLesson',
    new Set([])
  )
  const [sjtuLessonLoading, setSjtuLessonLoading] = useState(false)

  const [loginDialog, setLoginDialog] = useState(false)

  const MainRoute = () => {
    const { pathname } = useLocation()
    const { semester } = useParams()
    if (!semester) return null
    const match = matchPath(pathname, {
      path: '/:semester/browse',
      exact: true,
    })
    if (match) {
      return (
        <FilterForm state={filterFormState} setState={setFilterFormState} />
      )
    }
    return <PlanForm selectedLesson={selectedLesson} />
  }

  const BrowseRoute = () => {
    const { pathname } = useLocation()
    const { semester } = useParams()
    if (!semester) return null
    const match = matchPath(pathname, {
      path: '/:semester/browse',
      exact: true,
    })
    if (match) {
      return (
        <LessonList
          filterData={filterFormState}
          state={starLesson}
          setState={setStarLesson}
        />
      )
    }
    return null
  }

  const removeStarLesson = (value) => {
    const set = new Set(starLesson)
    set.delete(value)
    setStarLesson(set)
    const set2 = new Set(selectedLesson)
    set2.delete(value)
    setSelectedLesson(set2)
  }

  const batchRemoveStarLessons = (values) => {
    const set = new Set(starLesson)
    const set2 = new Set(selectedLesson)
    values.forEach((v) => {
      set.delete(v)
      set2.delete(v)
    })
    setStarLesson(set)
    setSelectedLesson(set2)
  }

  const syncFromISJTU = (semester) => {
    setSjtuLessonLoading(true)
    axios
      .get(`/api/course/lesson?term=${semester.replace('_', '-')}`)
      .then((resp) => {
        if (resp?.data?.error === 'success') {
          setSjtuLesson(new Set(resp.data.entities.map((x) => x.code)))
          setSjtuLessonLoading(false)
        } else {
          setSjtuLessonLoading(false)
          setLoginDialog(true)
        }
      })
      .catch((e) => {
        setLoginDialog(true)
        setSjtuLessonLoading(false)
      })
  }

  const handleLogin = (result) => {
    if (result) {
      window.location.href = '/login?app=course_plus'
    }
    setLoginDialog(false)
  }

  const colorize = (starLesson) => {
    const colorScale = chroma.scale('Spectral').gamma(0.5)
    // const colorScale = chroma.scale(['yellow', 'navy']).mode('lch');
    const starLessonArray = [...starLesson]
    const result = {}
    forEach(
      groupBy(starLessonArray, (lesson) =>
        lesson.split('-').slice(0, 3).join('-')
      ),
      (v) => {
        const colors = colorScale.colors(v.length)
        sortedBy(v).forEach((val, idx) => (result[val] = colors[idx]))
      }
    )
    return result
  }

  return (
    <Router>
      <div
        className='container-fluid d-flex flex-column vh-100'
        style={{ minHeight: 0 }}
      >
        <Navbar onToggleClick={() => setMenuOpen(!isMenuOpen)} />
        <LoginModal show={loginDialog} nextStep={handleLogin}></LoginModal>

        <div className='row flex-grow-1 h-100' style={{ minHeight: 0 }}>
          <div
            className={`col-md-3 sidebar-container ${
              isMenuOpen ? 'open' : ''
            } h-100 d-flex flex-column`}
            style={{ minHeight: 0 }}
          >
            <div
              className='sidebar-overlay d-md-none'
              onClick={() => setMenuOpen(false)}
            ></div>
            <div className='sidebar h-100'>
              <SemesterNav />
              <hr />
              <Switch>
                <Route path='/:semester/browse'>
                  <FilterForm
                    state={filterFormState}
                    setState={setFilterFormState}
                  />
                </Route>
                <Route path='/:semester/plan'>
                  <PlanForm
                    starLesson={starLesson}
                    removeStarLesson={removeStarLesson}
                    batchRemoveStarLessons={batchRemoveStarLessons}
                    state={selectedLesson}
                    setState={setSelectedLesson}
                    colorMapping={colorize(starLesson)}
                  />
                </Route>
                <Route path='/:semester/classtable'>
                  <ClassTableForm
                    sjtuLesson={sjtuLesson}
                    starLesson={starLesson}
                    setStarLesson={setStarLesson}
                    dataLoading={sjtuLessonLoading}
                    syncFromISJTU={syncFromISJTU}
                    colorMapping={colorize(sjtuLesson)}
                  />
                </Route>
                <Route>
                  <FilterForm
                    state={filterFormState}
                    setState={setFilterFormState}
                  />
                </Route>
              </Switch>

              <p className='text-muted my-3 small'>
                免责声明：本网站课程相关数据来自
                <a
                  href='https://byyt.ecnu.edu.cn/home/#/home'
                  target='_blank'
                  rel='noreferrer'
                >
                  华东师范大学教育教学管理平台
                </a>
                ，数据更新存在一定延迟性。且本网站仅供学习和交流使用，具体情况以本科生院安排为准。
              </p>
              <div className='row'>
                <div className='col d-flex d-row align-items-center'>
                  <p className='text-muted my-1 small'>
                    <a href='https://github.com/ECNU-minus/course-plus'>
                      本项目
                    </a>{' '}
                    由{' '}
                    <a
                      href='https://github.com/ECNU-minus'
                      target='_blank'
                      rel='noreferrer'
                    >
                      ECNU-Minus
                    </a>
                    维护。
                  </p>
                </div>
              </div>
              <div className='row justify-content-end'>
                <div className='col-auto my-2 p-0 d-flex d-row align-items-center'>
                  <GitHubButton
                    href='https://github.com/ECNU-minus/course-plus'
                    data-show-count
                    data-size='large'
                  >
                    Star
                  </GitHubButton>
                </div>
              </div>
            </div>
          </div>

          <div
            className='col-md-9 main-content h-100 d-flex flex-column'
            style={{ minHeight: 0 }}
          >
            <Switch>
              <Route path='/:semester/classtable'>
                <ClassTable
                  selectedLesson={selectedLesson}
                  colorMapping={colorize(starLesson)}
                />
              </Route>
              <Route path='/:semester/plan'>
                <ClassTable
                  selectedLesson={selectedLesson}
                  colorMapping={colorize(starLesson)}
                />
              </Route>
              <Route path='/:semester/browse'>
                <LessonList
                  filterData={filterFormState}
                  state={starLesson}
                  setState={setStarLesson}
                />
              </Route>
              <Route>
                <LessonList
                  filterData={filterFormState}
                  state={starLesson}
                  setState={setStarLesson}
                />
              </Route>
            </Switch>
          </div>
        </div>
      </div>
    </Router>
  )
}

export default App
