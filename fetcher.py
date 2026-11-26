import requests
import json
import os
import math
import time
import argparse
import sys
from loguru import logger
from typing import Any
from config import *

"""
公共数据库用一个规律不明的数字标识学期，由于暂时找不到对应关系，目前只能手动查询获得该标识。
需要手动选择相应学期进行一次查询，在 浏览器 -> Developer tools -> Internet 中接受一次流量，
找到 Payload 中的 semesterAssocs 字段，即可获得该学期对应的数字标识。
"""

# 同一学年内的时间先后顺序：秋季(如 2026.9) -> 春季(如 2027.2) -> 夏季(如 2027.7)
SEMESTER_ORDER = {"autumn": 1, "spring": 2, "summer": 3}


def semester_sort_key(item: dict[str, str]) -> tuple[int, int]:
    start_year = int(item["year"].split("-")[0])
    seme_order = SEMESTER_ORDER.get(item["semester"].lower(), 99)
    return (start_year, seme_order)


def calc_aca_year(year: str, seme: str | int) -> str:
    if seme in ("Autumn", "autumn", 1, "1"):
        return f"{year}-{int(year) + 1}"
    else:
        return f"{int(year) - 1}-{year}"


def aca_year_to_year(aca_year: str, seme: str) -> str:
    start_year, end_year = aca_year.split("-")
    return start_year if seme.lower() == "autumn" else end_year


def load_index_data() -> list[dict[str, str]]:
    index_path = os.path.join(base_path, "lessonData_index.json")
    with open(index_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get(
    page_num: int = 1,
    page_size: int = 20,
    semester_id: str = "1629",
    grade: str = "under",
) -> dict:
    logger.info(f"获取第 {page_num} 页数据")

    full_url = f"{url}{url_id}"
    paras = {
        "bizTypeAssoc": ["2" if grade == "under" else "3"],
        "semesterAssocs": [semester_id],
        "searchTeachingSyllabus": ["true"],
        "queryPage__": [f"{page_num},{page_size}"],
        "assembleFields": [],
    }
    cookie = {
        "SESSION": session,
    }
    response = requests.get(full_url, cookies=cookie, params=paras)
    assert response.status_code == 200

    if "sso.ecnu.edu.cn" in response.url:
        logger.error(
            "请求被重定向至登录页面，可能是 Cookie 失效，请更新 Cookie 后重试"
        )
        exit(1)

    return response.json()


def update_lessonData_index(
    aca_year: str, semester: str, first_day: str, full_semester: str, seme_id: str
) -> None:
    index_path = os.path.join(base_path, "lessonData_index.json")
    index_data = load_index_data()

    already_exists = False
    for item in index_data:
        if item["semester"].lower() == semester.lower() and item["year"] == aca_year:
            item["updated_at"] = time.strftime("%Y-%m-%d", time.localtime())
            item["first_day"] = first_day
            item["updated_time"] = time.strftime("%H:%M", time.localtime())
            item["seme_id"] = seme_id
            already_exists = True
            break

    if not already_exists:
        new_entry = {
            "year": aca_year,
            "semester": semester,
            "updated_at": time.strftime("%Y-%m-%d", time.localtime()),
            "first_day": first_day,
            "updated_time": time.strftime("%H:%M", time.localtime()),
            "seme_id": seme_id,
        }
        index_data.append(new_entry)

    # 按学期时间排序（如需最新学期排在最前面，加上 reverse=True）
    index_data.sort(key=semester_sort_key)

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False, indent=4)

    logger.info(
        f"已更新并按时间排序 lessonData_index.json（{full_semester}）"
    )


def argument_parser() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch course data from ECNU Course Plus"
    )
    parser.add_argument(
        "--year", "-y", type=str, help="学期所处年份（非学年），如 2026；与 --seme 均省略时默认取最新学期"
    )
    parser.add_argument(
        "--seme",
        "-s",
        type=str.lower,
        help="具体学期，如 spring；与 --year 均省略时默认取最新学期",
        choices=["spring", "summer", "autumn"],
    )
    parser.add_argument(
        "--seme-id",
        "-i",
        type=str,
        help="学期 ID，如 1629，如果要覆盖已存储的数据，需提供该参数",
    )
    parser.add_argument(
        "--first-day",
        "-f",
        type=str,
        help="学期第一天日期，格式 YYYY-MM-DD，如果要覆盖已存储的数据，需提供该参数",
    )
    parser.add_argument(
        "--grade",
        "-g",
        type=str.lower,
        help="本科生或研究生，输入 under 或 post",
        choices=["under", "post"],
    )
    args = parser.parse_args()
    is_interactive = sys.stdin.isatty()
    index_data = load_index_data()

    # 1. 未提供具体学期参数时，默认选取 lessonData_index.json 中最新的学期
    if not args.year and not args.seme:
        if not index_data:
            logger.error("lessonData_index.json 为空，无法自动确定最新学期，请手动指定参数")
            exit(1)
        latest = max(index_data, key=semester_sort_key)
        args.year = aca_year_to_year(latest["year"], latest["semester"])
        args.seme = latest["semester"].lower()
        args.seme_id = args.seme_id or latest.get("seme_id", "")
        args.first_day = args.first_day or latest.get("first_day", "")
        logger.info(
            f"未指定学期参数，默认使用最新学期：{latest['year']} {latest['semester']}（seme_id={args.seme_id}）"
        )
    else:
        # 只提供了 year 或 seme 其中之一时，交互模式补问，非交互模式报错
        while not args.year:
            if not is_interactive:
                logger.error("非交互模式下缺少 --year 参数")
                exit(1)
            logger.info("没有识别到年份信息，请输入：")
            args.year = input().strip()

        while not args.seme:
            if not is_interactive:
                logger.error("非交互模式下缺少 --seme 参数")
                exit(1)
            logger.info("没有识别到学期信息，请输入（spring/summer/autumn）：")
            args.seme = input().strip().lower()

    # 2. 补全 seme_id 和 first_day
    aca_year = calc_aca_year(args.year, args.seme)
    matched_item = next(
        (
            item
            for item in index_data
            if item["year"] == aca_year and item["semester"].lower() == args.seme.lower()
        ),
        None,
    )

    if not args.seme_id:
        if is_interactive:
            logger.info("没有识别到学期 ID 信息，请输入：（留空则使用默认值）")
            args.seme_id = input().strip()
        if not args.seme_id and matched_item:
            logger.info("已从 lessonData_index.json 自动读取 seme_id")
            args.seme_id = matched_item.get("seme_id", "")

    if not args.first_day:
        if is_interactive:
            logger.info("没有识别到学期第一天日期，请输入（格式 YYYY-MM-DD）：（留空则使用默认值）")
            args.first_day = input().strip()
        if not args.first_day and matched_item:
            logger.info("已从 lessonData_index.json 自动读取 first_day")
            args.first_day = matched_item.get("first_day", "")

    # 3. 补全 grade
    while not args.grade:
        if not is_interactive:
            logger.error("非交互模式下缺少 --grade 参数（under/post）")
            exit(1)
        logger.info("没有识别到年级信息，请输入（under/post）：")
        args.grade = input().strip().lower()

    return args


def main() -> None:
    args = argument_parser()
    if not all([args.year, args.seme, args.seme_id, args.first_day, args.grade]):
        logger.error(
            "请确保已提供完整的学期信息（年份、学期、学期 ID、学期第一天日期、年级）"
        )
        exit(1)
    year, seme, seme_id, first_day, grade = (
        args.year,
        args.seme.capitalize(),
        args.seme_id,
        args.first_day,
        args.grade,
    )
    aca_year = calc_aca_year(year, seme)
    full_semester = f"{year}_{seme}"
    logger.info(f"当前任务：{full_semester} 学期（{seme_id}）")
    logger.info("获取测试数据")

    res: dict[str, Any] = get(semester_id=seme_id, grade=grade)

    lesson_data: list[Any] = res["data"]
    total_count = res["_page_"]["totalRows"]
    total_pages = math.ceil(total_count / 1000)
    if len(lesson_data) == 20:
        logger.info(
            f"测试数据获取成功，开始获取全部数据，总计 {total_count} 条，{total_pages} 页"
        )
    elif len(lesson_data) > 0:
        logger.warning(
            f"测试数据不完整，实际 / 预期：{len(lesson_data)} / 20。认为该学期实际不足 20 门，继续执行"
        )
    else:
        logger.error("测试失败，未获取任何数据，检查输入的参数是否完整且正确")
        exit(1)

    lesson_data = []
    for i in range(1, total_pages + 1):
        temp_res = get(i, 1000, seme_id, grade=grade)
        lesson_data += temp_res["data"]

    if not os.path.exists(os.path.join(base_path, "LessonData")):
        os.makedirs(os.path.join(base_path, "LessonData"))

    with open(
        os.path.join(base_path, "LessonData", f"{full_semester}_{grade}.json"),
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(lesson_data, f, ensure_ascii=False, indent=4)

    assert total_count == len(lesson_data)
    logger.info(
        f"全部数据获取完成，已保存至 LessonData/{full_semester}_{grade}.json，共 {len(lesson_data)} 条记录"
    )
    update_lessonData_index(aca_year, seme, first_day, full_semester, seme_id)

    import parser

    parser.main(year, seme, grade)
    logger.info("数据解析完成")


if __name__ == "__main__":
    main()