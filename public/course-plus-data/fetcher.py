import requests
import json
import os
import math
import time
from loguru import logger
from typing import Any


'''
公共数据库用一个规律不明的数字标识学期，由于暂时找不到对应关系，目前只能手动查询获得该标识。
需要手动选择相应学期进行一次查询，在 浏览器 -> Developer tools -> Internet 中接受一次流量，
找到 Payload 中的 semesterAssocs 字段，即可获得该学期对应的数字标识。
'''
SEMESTER: str = '2026_Spring'
SEMESTER_ID: str = '1629'

def find_base_path() -> str:
    current_path = os.path.abspath(__file__)
    while True:
        parent_path = os.path.dirname(current_path)
        if os.path.basename(parent_path) == 'course-plus-data':
            return parent_path
        if parent_path == current_path:
            raise Exception("Base path 'course-plus-data' not found.")
        current_path = parent_path

base_path = find_base_path()

def get(page_num: int = 1, page_size: int = 20, semester_id: str = SEMESTER_ID) -> dict:
    logger.info(f'获取第 {page_num} 页数据')

    url = 'https://byyt.ecnu.edu.cn/student/for-std/lesson-search/search/813450'
    paras = {
            'bizTypeAssoc': ['2'],
            'semesterAssocs': [f'{semester_id}'],
            'searchTeachingSyllabus': ['true'],
            'queryPage__': [f'{page_num},{page_size}'],
            'assembleFields': []
    }
    cookie = {
        'SESSION': '9750a438-52a2-405e-beb2-b3b2b4c38719',
    }
    response = requests.get(url, cookies=cookie, params=paras)

    assert (response.status_code == 200)

    if 'sso.ecnu.edu.cn' in response.url:
        logger.error(f'请求被重定向至登录页面，可能是 Cookie 失效，请更新 Cookie 后重试')
        exit(1)

    return response.json()

def update_lessonData_index() -> None:
    index_path = os.path.join(base_path, 'lessonData_index.json')
    with open(index_path, 'r', encoding='utf-8') as f:
        index_data: list[dict[str, str]] = json.load(f)
    
    for item in index_data:
        if item['semester'] == SEMESTER:
            logger.info(f'lessonData_index.json 已包含 {SEMESTER} 学期的信息，无需更新')
            return
    new_entry = {
        'year': SEMESTER.split('_')[0],
        'semester': SEMESTER.split('_')[1],
        'updated_at': time.strftime('%Y-%m-%d', time.localtime()),
        'first_day': '1970-01-01'
    }
    index_data.append(new_entry)

    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, ensure_ascii=False, indent=4)
    
    logger.info(f'已向 lessonData_index.json 添加 {SEMESTER} 学期的信息，请手动补充 updated_at 和 first_day 字段')

def main() -> None:
    logger.info(f'当前任务：{SEMESTER} 学期（{SEMESTER_ID}）')
    logger.info(f'获取测试数据')

    res: dict[str, Any] = get()

    lesson_data: list[Any] = res['data']
    total_count = res['_page_']['totalRows']
    total_pages = math.ceil(total_count / 1000)
    if len(lesson_data) == 20:
        logger.info(f'测试数据获取成功，开始获取全部数据，总计 {total_count} 条，{total_pages} 页')
    elif len(lesson_data) > 0:
        logger.warning(f'测试数据不完整，实际 / 预期：{len(lesson_data)} / 20。认为该学期实际不足 20 门，继续执行')
    else:
        logger.error(f'测试失败，未获取任何数据')
        exit(1)
    lesson_data: list[Any] = []
    for i in range(1, total_pages + 1):
        temp_res = get(i, 1000, SEMESTER_ID)
        lesson_data += temp_res['data']
    
    if not os.path.exists(os.path.join(base_path, 'LessonData')):
        os.makedirs(os.path.join(base_path, 'LessonData'))

    with open(os.path.join(base_path, 'LessonData', f'{SEMESTER}.json'), 'w', encoding='utf-8') as f:
            json.dump(lesson_data, f, ensure_ascii=False, indent=4)
    
    assert total_count == len(lesson_data)
    logger.info(f'全部数据获取完成，已保存至 LessonData/{SEMESTER}.json，共 {len(lesson_data)} 条记录')

    update_lessonData_index()
    

if __name__ == '__main__':
    main()