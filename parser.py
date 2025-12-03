from fetcher import calc_aca_year
from typing import Any
import re
import json
import os

DAY_NAMES = {
    '星期一': '1',
    '星期二': '2',
    '星期三': '3',
    '星期四': '4',
    '星期五': '5',
    '星期六': '6',
    '星期日': '7',
}

def find_base_path() -> str:
    current_path = os.path.abspath(__file__)
    while True:
        parent_path = os.path.dirname(current_path)
        if os.path.basename(parent_path) == 'course-plus-data':
            return parent_path
        if parent_path == current_path:
            raise Exception("Base path 'course-plus-data' not found.")
        current_path = parent_path

BASE_PATH = find_base_path()

def extract_week_range(text: str) -> str:
    pattern_week_range = re.compile(r'(\d+)~(\d+)周')
    matches = pattern_week_range.findall(text)
    return ','.join(matches).replace('~', '-')

def extract_teachers(lesson_data: dict[str, Any]) -> str:
    teachers = []
    for assignment in lesson_data['teacherAssignmentList']:
            teachers.append(assignment['person']['nameZh'])
    return ','.join(teachers)

def extract_college(lesson_data: dict[str, Any]) -> tuple[str, str]:
    college_name = lesson_data['openDepartment']['nameZh']
    with open(f'{BASE_PATH}/college_id.json', 'r', encoding='utf-8') as f:
        college_dict = json.load(f)
    college_id = college_dict[f'{college_name}']
    return college_name, college_id

def extract_time(lesson_data: dict[str, Any]) -> tuple[list[tuple[str, str, str]], str, str]:
    if lesson_data['scheduleText']['dateTimePlacePersonText']['textZh'] is None:
        return ([('', '', '')], '', '')
    
    cleaned_input = lesson_data['scheduleText']['dateTimePlacePersonText']['textZh'].replace('\n', '').strip()
    time_blocks = [block.strip() for block in cleaned_input.split(';') if block.strip()]
    
    parsed_blocks = []
    teachers = [t['person']['nameZh'] for t in lesson_data['teacherAssignmentList']]

    for block in time_blocks:
        pattern = r'([\d,~()单双]+周)\s+(\S+)\s+([\d~]+节)'
        match = re.search(pattern, block)
        
        if match:
            weeks = match.group(1)
            day = match.group(2)
            period = match.group(3)
            
            # Normalize weeks
            week_parts = re.split(r',', weeks)
            formatted_parts = []
            for part in week_parts:
                if '(' in part and ')' in part:
                    bracket_match = re.match(r'([\d~]+)\(([^)]+)\)周', part)
                    if bracket_match:
                        main_part, modifier = bracket_match.groups()
                        formatted_parts.append(f"{main_part.replace('~', '-')}({modifier})周")
                    else:
                        formatted_parts.append(part.replace('~', '-'))
                else:
                    formatted_parts.append(part.replace('~', '-'))
            weeks_formatted = ','.join(formatted_parts)
            
            period_formatted = period.replace('~', '-')
            
            # Extract location
            end_pos = match.end()
            remaining = block[end_pos:].strip()
            rem_parts = remaining.split()
            
            location_parts = []
            for part in rem_parts:
                if part not in teachers:
                    location_parts.append(part)
            
            location = " ".join(location_parts)
            
            parsed_blocks.append({
                'day': day,
                'period': period_formatted,
                'weeks': weeks_formatted,
                'location': location
            })

    # Aggregate
    aggregated = {}
    for item in parsed_blocks:
        key = (item['day'], item['period'], item['location'])
        if key not in aggregated:
            aggregated[key] = []
        aggregated[key].append(item['weeks'])
        
    sksj_parts = []
    jxdd_parts = []
    details = []
    
    for (day, period, location), weeks_list in aggregated.items():
        unique_weeks = []
        seen = set()
        for w in weeks_list:
            if w not in seen:
                unique_weeks.append(w)
                seen.add(w)
        
        final_weeks_str = ",".join([w.replace('周', '') for w in unique_weeks]) + "周"
        
        sksj_parts.append(f"{day}第{period}{{{final_weeks_str}}}")
        jxdd_parts.append(location)
        details.append((day, period, final_weeks_str))
        
    if not details:
         details = [('', '', '')]

    return details, ";".join(sksj_parts), ";".join(jxdd_parts)

def extract_code(lesson_data: dict[str, Any]) -> str:
    return lesson_data['course']['code']

def extract_name(lesson_data: dict[str, Any]) -> str:
    return lesson_data['course']['nameZh']

def extract_class(lesson_data: dict[str, Any]) -> str:
    return lesson_data['code']

def extract_credits(lesson_data: dict[str, Any]) -> float:
    return lesson_data['course']['credits']

def extract_periods(lesson_data: dict[str, Any]) -> int:
    return lesson_data['requiredPeriodInfo']['total']

def extract_class_comp(lesson_data: dict[str, Any]) -> str:
    return lesson_data['nameZh']

def extract_compulsory(lesson_data: dict[str, Any]) -> str:
    return ','.join(lesson_data['compulsorys'])

def extract_remark(lesson_data: dict[str, Any]) -> str:
    return lesson_data['remark']

def extract_location(lesson_data: dict[str, Any]) -> str:
    if lesson_data['scheduleText']['dateTimePlacePersonText']['textZh'] == None:
        return ''
    return lesson_data['scheduleText']['dateTimePlacePersonText']['textZh'].split()[3]+','+lesson_data['scheduleText']['dateTimePlacePersonText']['textZh'].split()[4]

def extract_grade(lesson_data: dict[str, Any]) -> str:
    tmp = lesson_data['nameZh'].replace(';', ' ').replace(',', ' ').split()
    res = []
    for item in tmp:
        if re.match(r'^\d{4}$', item):
            if item not in res:
                res.append(item)
    return ','.join(res) if res else '无年级'

def extract_gen_type(lesson_data: dict[str, Any]) -> str:
        if lesson_data['courseProperty']:
            return lesson_data['courseType']['nameZh'] if ('通识' in lesson_data['courseProperty']['nameZh']) else ''
        return ''

def calculate_zcd(weeks_str: str) -> int:
    """
    Calculate the binary representation of weeks.
    Example: "1-4,7-10周" -> binary integer where bits 0-3 and 6-9 are 1.
    Note: bit 0 corresponds to week 1.
    """
    zcd = 0
    if not weeks_str:
        return zcd
    
    # Remove '周' and split by comma
    parts = weeks_str.replace('周', '').split(',')
    
    for part in parts:
        # Handle modifiers like (单) or (双) - currently ignoring them for simplicity
        # or treating them as full range. A more complex logic is needed for parity.
        # For now, let's strip modifiers to get the range numbers.
        clean_part = re.sub(r'\(.*?\)', '', part)
        
        if '-' in clean_part:
            try:
                start, end = map(int, clean_part.split('-'))
                for i in range(start, end + 1):
                    zcd |= (1 << (i - 1))
            except ValueError:
                pass # Handle cases where parsing fails
        else:
            try:
                week = int(clean_part)
                zcd |= (1 << (week - 1))
            except ValueError:
                pass

    return zcd

def calculate_cdjc(period_str: str) -> int:
    """
    Calculate the binary representation of class periods.
    Example: "1-3节" -> binary integer where bits 0-2 are 1.
    Note: bit 0 corresponds to period 1.
    """
    cdjc = 0
    if not period_str:
        return cdjc
        
    # Remove '节' and split by comma (though usually periods are single range)
    parts = period_str.replace('节', '').split(',')
    
    for part in parts:
        if '-' in part:
            try:
                start, end = map(int, part.split('-'))
                for i in range(start, end + 1):
                    cdjc |= (1 << (i - 1))
            except ValueError:
                pass
        else:
            try:
                period = int(part)
                cdjc |= (1 << (period - 1))
            except ValueError:
                pass
                
    return cdjc

def parse_single(lesson_data: dict[str, Any], year: str, semester: int, idx: int) -> list[dict[str, Any]]:
    time_details, sksj, jxdd = extract_time(lesson_data)
    aca_year = calc_aca_year(year, semester)
    res_list = []

    if not time_details or time_details == [('', '', '')]:
        # 无时间信息的回退处理
        res = {
            "qsjsz": "",
            "zjs": extract_teachers(lesson_data).split(',')[0],
            "jszc": extract_teachers(lesson_data),
            "kkbm_id": extract_college(lesson_data)[1],
            "xqj": "0", # Invalid day
            "kch": extract_code(lesson_data),
            "kkxy": extract_college(lesson_data)[0],
            "zcd": 0,
            "sksj": sksj,
            "kcmc": extract_name(lesson_data),
            "skjc": "",
            "jxbmc": f"({aca_year}-{semester})-{extract_class(lesson_data)}",
            "xf": extract_credits(lesson_data),
            "rwzxs": extract_periods(lesson_data),
            "jxbzc": extract_class_comp(lesson_data),
            "kcxzmc": extract_compulsory(lesson_data),
            "xkbz": extract_remark(lesson_data),
            "cdjc": 0,
            "xn": f"{aca_year}",
            "jsxx": extract_teachers(lesson_data),
            "xq": semester,
            "nj": extract_grade(lesson_data),
            "row_id": idx, # This might need to be unique across splits
            "kzmc": extract_gen_type(lesson_data),
            "jxdd": jxdd,
        }
        return [res]

    for i, (day_str, period_str, weeks_str) in enumerate(time_details):
        # 为“当前时间块”计算 zcd 与 cdjc
        current_zcd = calculate_zcd(weeks_str)
        current_cdjc = calculate_cdjc(period_str)
        
        # 将星期字符串转换为整数
        day_int = int(DAY_NAMES.get(day_str, 0))
        
        res = {
            "qsjsz": weeks_str,
            "zjs": extract_teachers(lesson_data).split(',')[0],
            "jszc": extract_teachers(lesson_data),
            "kkbm_id": extract_college(lesson_data)[1],
            "xqj": day_int, # 使用整数形式的星期
            "kch": extract_code(lesson_data),
            "kkxy": extract_college(lesson_data)[0],
            "zcd": current_zcd,
            "sksj": sksj, # 保留完整字符串用于展示
            "kcmc": extract_name(lesson_data),
            "skjc": period_str,
            "jxbmc": f"({aca_year}-{semester})-{extract_class(lesson_data)}",
            "xf": extract_credits(lesson_data),
            "rwzxs": extract_periods(lesson_data),
            "jxbzc": extract_class_comp(lesson_data),
            "kcxzmc": extract_compulsory(lesson_data),
            "xkbz": extract_remark(lesson_data),
            "cdjc": current_cdjc,
            "xn": f"{aca_year}",
            "jsxx": extract_teachers(lesson_data),
            "xq": semester,
            "nj": extract_grade(lesson_data),
            "row_id": f"{idx}_{i}", # 为拆分产生的记录生成唯一 row_id
            "kzmc": extract_gen_type(lesson_data),
            "jxdd": jxdd, # 保留完整字符串用于展示
        }
        res_list.append(res)
        
    return res_list

def main(year: str, semester: str) -> None:
    global BASE_PATH
    BASE_PATH = find_base_path()

    for filename in os.listdir(os.path.join(BASE_PATH, 'LessonData')):
        if filename.startswith('Parsed_'):
            continue
        if filename.startswith('Example'):
            continue
        if not filename.endswith('.json'):
            continue
        cur_year, cur_seme = filename[:-5].split('_')
        if year:
            if cur_year != year:
                continue
        if semester:
            if cur_seme != semester:
                continue

        if 'Autumn' in filename:
            semester_code = 1
        elif 'Spring' in filename:
            semester_code = 2
        else:
            semester_code = 3

        out_file_name = f'Parsed_{calc_aca_year(cur_year, semester_code)}_{cur_seme}.json'
        with open(os.path.join(BASE_PATH, 'LessonData', filename), 'r', encoding='utf-8') as f:
            lesson_data_list: list[dict[str, Any]] = json.load(f)
            parsed_data_list: list[dict[str, Any]] = []
            for idx, lesson_data in enumerate(lesson_data_list):
                parsed_entries = parse_single(lesson_data, year, semester_code, idx)
                parsed_data_list.extend(parsed_entries)
            with open(os.path.join(BASE_PATH, 'LessonData', out_file_name), 'w', encoding='utf-8') as fout:
                json.dump(parsed_data_list, fout, ensure_ascii=False, indent=4)

if __name__ == '__main__':
    main('2025', 'Autumn')
