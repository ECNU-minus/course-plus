import requests
import json
import os
import math
import time
import argparse
from loguru import logger
from typing import Any


'''
公共数据库用一个规律不明的数字标识学期，由于暂时找不到对应关系，目前只能手动查询获得该标识。
需要手动选择相应学期进行一次查询，在 浏览器 -> Developer tools -> Internet 中接受一次流量，
找到 Payload 中的 semesterAssocs 字段，即可获得该学期对应的数字标识。
'''
def find_base_path() -> str:
    current_path = os.path.abspath(__file__)
    while True:
        parent_path = os.path.dirname(current_path)
        if os.path.basename(parent_path) == 'course-plus':
            return parent_path
        if parent_path == current_path:
            raise Exception("Base path 'course-plus' not found.")
        current_path = parent_path

base_path = find_base_path()

def get(page_num: int = 1, page_size: int = 20, semester_id: str = '1629', session: str = '') -> dict:
    logger.info(f'获取第 {page_num} 页数据')

    url = 'https://byyt.ecnu.edu.cn/student/for-std/lesson-search/search/813450'
    paras = {
            'bizTypeAssoc': ['2'],
            'semesterAssocs': [semester_id],
            'searchTeachingSyllabus': ['true'],
            'queryPage__': [f'{page_num},{page_size}'],
            'assembleFields': []
    }
    cookie = {
        'SESSION': session,
    }
    response = requests.get(url, cookies=cookie, params=paras)

    assert (response.status_code == 200)

    if 'sso.ecnu.edu.cn' in response.url:
        logger.error(f'请求被重定向至登录页面，可能是 Cookie 失效，请更新 Cookie 后重试')
        exit(1)

    return response.json()

def update_lessonData_index(aca_year: str, semester: str, first_day: str, full_semester: str) -> None:
    index_path = os.path.join(base_path, 'lessonData_index.json')
    with open(index_path, 'r', encoding='utf-8') as f:
        index_data: list[dict[str, str]] = json.load(f)
    
    already_exists = False

    for item in index_data:
        if item['semester'] == semester and item['year'] == aca_year:
            item['updated_at'] = time.strftime('%Y-%m-%d', time.localtime())
            item['first_day'] = first_day
            item['updated_time'] = time.strftime('%H:%M', time.localtime())
            already_exists = True
            break
    if not already_exists:
        new_entry = {
            'year': aca_year,
            'semester': semester,
            'updated_at': time.strftime('%Y-%m-%d', time.localtime()),
            'first_day': first_day,
            'updated_time': time.strftime('%H:%M', time.localtime())
        }
        index_data.append(new_entry)

    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, ensure_ascii=False, indent=4)
    
    logger.info(f'已向 lessonData_index.json 添加 {full_semester} 学期的信息，first_day 字段')

def calc_aca_year(year: str, seme: str | int) -> str:
    if seme == 'Autumn' or seme == 1 or seme == '1':
        return f"{year}-{int(year) + 1}"
    else:
        return f"{int(year) - 1}-{year}"

def argument_parser() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Fetch course data from ECNU Course Plus')
    parser.add_argument('--year', '-y', type=str, help='学期所处年份（非学年），如 2026')
    parser.add_argument('--seme', '-s', type=str, help='具体学期，如 spring', choices=['spring', 'summer', 'autumn'])
    parser.add_argument('--seme-id', '-i', type=str, help='学期 ID，如 1629')
    parser.add_argument('--session', '-c', type=str, help='Session ID，如 9750a438-52a2-405e-beb2-b3b2b4c38719')
    parser.add_argument('--first-day', '-f', type=str, help='学期第一天日期，格式 YYYY-MM-DD')
    parser.add_argument('--parser', '-p', action="store_true", help='是否解析数据（默认不解析）')

    args = parser.parse_args()
    if not args.year:
        logger.info("没有识别到年份信息，请输入：")
        args.year = input().strip()
    if not args.seme:
        logger.info("没有识别到学期信息，请输入：")
        args.seme = (input().strip() or '').capitalize()
    if not args.seme_id:
        logger.info("没有识别到学期 ID 信息，请输入：")
        args.seme_id = input().strip()
    if not args.session:
        logger.info("没有识别到 Session ID 信息，请输入：")
        args.session = input().strip()
    if not args.first_day:
        logger.info("没有识别到学期第一天日期，请输入（格式 YYYY-MM-DD）：")
        args.first_day = input().strip()
    if not args.parser:
        logger.info("是否要解析数据？（y/n，默认 n）：")
        user_input = input().strip().lower()
        if user_input == 'y' or user_input == 'yes':
            args.parser = True

    return args

def main() -> None:
    args = argument_parser()

    if not all([args.year, args.seme, args.seme_id, args.session, args.first_day]) :
        logger.error(f'请确保已提供完整的学期信息（年份、学期、学期 ID）、可用的 Session ID 和学期第一天日期')
        exit(1)
    year, seme, seme_id, session, first_day = args.year, args.seme.capitalize(), args.seme_id, args.session, args.first_day
    aca_year = calc_aca_year(year, seme)
    full_semester = f'{year}_{seme}'
    logger.info(f'当前任务：{full_semester} 学期（{seme_id}）')
    logger.info(f'获取测试数据')

    res: dict[str, Any] = get(semester_id = seme_id, session = session)

    lesson_data: list[Any] = res['data']
    total_count = res['_page_']['totalRows']
    total_pages = math.ceil(total_count / 1000)
    if len(lesson_data) == 20:
        logger.info(f'测试数据获取成功，开始获取全部数据，总计 {total_count} 条，{total_pages} 页')
    elif len(lesson_data) > 0:
        logger.warning(f'测试数据不完整，实际 / 预期：{len(lesson_data)} / 20。认为该学期实际不足 20 门，继续执行')
    else:
        logger.error(f'测试失败，未获取任何数据，检查输入的参数是否完整且正确')
        exit(1)
    lesson_data: list[Any] = []
    for i in range(1, total_pages + 1):
        temp_res = get(i, 1000, seme_id, session)
        lesson_data += temp_res['data']

    if not os.path.exists(os.path.join(base_path, 'LessonData')):
        os.makedirs(os.path.join(base_path, 'LessonData'))

    with open(os.path.join(base_path, 'LessonData', f'{full_semester}.json'), 'w', encoding='utf-8') as f:
            json.dump(lesson_data, f, ensure_ascii=False, indent=4)
    
    assert total_count == len(lesson_data)
    logger.info(f'全部数据获取完成，已保存至 LessonData/{full_semester}.json，共 {len(lesson_data)} 条记录')
    update_lessonData_index(aca_year, seme, first_day, full_semester)
    
    if args.parser:
        import parser
        parser.main(year, seme)
        logger.info(f'数据解析完成')

if __name__ == '__main__':
    main()
