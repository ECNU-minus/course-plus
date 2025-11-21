
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

base_path = find_base_path()

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
    with open('./public/course-plus-data/college_id.json', 'r', encoding='utf-8') as f:
        college_dict = json.load(f)
    college_id = college_dict[f'{college_name}']
    return college_name, college_id

def extract_time(lesson_data: dict[str, Any]) -> tuple[list[tuple[str, str, str]], str]:
    # 移除换行符和多余空格
    if lesson_data['scheduleText']['dateTimePlacePersonText']['textZh'] == None:
        return ([('', '', '')], '')
    cleaned_input = lesson_data['scheduleText']['dateTimePlacePersonText']['textZh'].replace('\n', '').strip()
    
    # 按分号分割不同的时间段
    time_blocks = [block.strip() for block in cleaned_input.split(';') if block.strip()]
    
    # 存储详细信息
    details = []
    
    for block in time_blocks:
        # 使用正则表达式匹配完整的时间段
        pattern = r'([\d,~()单双]+周)\s+(\S+)\s+([\d~]+节)'
        match = re.search(pattern, block)
        
        if match:
            weeks = match.group(1)  # 周次，包含"周"字
            day = match.group(2)    # 星期
            period = match.group(3) # 节次，包含"节"字
            
            # 处理周次格式，将~替换为-，但保留括号和修饰符
            week_parts = re.split(r',', weeks)
            formatted_parts = []
            
            for part in week_parts:
                # 检查是否有括号
                if '(' in part and ')' in part:
                    # 使用更健壮的正则表达式匹配括号内容
                    bracket_match = re.match(r'([\d~]+)\(([^)]+)\)周', part)
                    if bracket_match:
                        main_part, modifier = bracket_match.groups()
                        formatted_parts.append(f"{main_part.replace('~', '-')}({modifier})周")
                    else:
                        # 如果正则匹配失败，保留原始格式
                        formatted_parts.append(part.replace('~', '-'))
                else:
                    # 没有括号，直接替换~，保留"周"字
                    formatted_parts.append(part.replace('~', '-'))
            
            weeks_formatted = ','.join(formatted_parts)
            
            # 处理节次格式，将~替换为-，保留"节"字
            period_formatted = period.replace('~', '-')
            
            # 添加到详细信息列表
            details.append((day, period_formatted, weeks_formatted))
    
    # 构建格式化字符串
    schedule_dict = {}
    for day, period, weeks in details:
        key = f"{day}第{period}"
        if key in schedule_dict:
            # 合并周范围时去掉重复的"周"字
            existing_weeks = schedule_dict[key].rstrip('周')
            new_weeks = weeks.rstrip('周')
            schedule_dict[key] = f"{existing_weeks},{new_weeks}周"
        else:
            schedule_dict[key] = weeks
    
    result_parts = []
    for key, weeks in schedule_dict.items():
        result_parts.append(f"{key}{{{weeks}}}")
    
    formatted_str = ';'.join(result_parts)
    
    return details, formatted_str

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
    tmp = lesson_data['nameZh'].replace(';',' ').split(' ')
    res = ''
    for item in tmp:
        if re.match(r'^\d{4}$', item):
            if item not in res.split(' '):
                res += item + ' '
    res.strip()
    return res if res else '无年级'

def extract_gen_type(lesson_data: dict[str, Any]) -> str:
        if lesson_data['courseProperty']:
            return lesson_data['courseType']['nameZh'] if ('通识' in lesson_data['courseProperty']['nameZh']) else ''
        return ''

def extract_time_location(lesson_data: dict[str, Any]) -> str:
    if 'textZh' not in lesson_data['scheduleText']['dateTimePlacePersonText']:
        return ''
    if lesson_data['scheduleText']['dateTimePlacePersonText']['textZh'] == None:
        return ''
    return lesson_data['scheduleText']['dateTimePlacePersonText']['textZh']

def parse_single(lesson_data: dict[str, Any], aca_year: int, semester: str, idx: int) -> dict[str, Any]:
    res: dict[str, Any] = {
        "qsjsz": extract_time(lesson_data)[0][0][2],   # 周
        "zjs": extract_teachers(lesson_data).split(',')[0],
        "jszc": extract_teachers(lesson_data),
        "kkbm_id": extract_college(lesson_data)[1],     # 开课部门ID
        "xqj": extract_time(lesson_data)[0][0][0],   # 星期几
        #"zhxs": "理论(6.0)",
        "kch": extract_code(lesson_data),
        "kkxy": extract_college(lesson_data)[0],  # 开课学院
        #"cdskjc": "第1-4节,7-14节",
        #"xqm": "16",
        #"jxbrs": 27,
        #"zjxh": 64,
        "zcd": 114514, #看不懂
        "sksj": extract_time(lesson_data)[1], # 完整时间
        "kcmc": extract_name(lesson_data),
        #"totalresult": 64,
        #"kklx": "一专",
        "skjc": extract_time(lesson_data)[0][0][1], # 节次
        #"xqh_id": "02",
        "jxbmc": extract_class(lesson_data),
        "xf": extract_credits(lesson_data),
        "rwzxs": extract_periods(lesson_data),
        "jxbzc": extract_class_comp(lesson_data),
        "kcxzmc": extract_compulsory(lesson_data),
        "xkbz": extract_remark(lesson_data),
        "cdjc": 114514, #看不懂
        #"cdqsjsz": "第1-4周",
        #"xnm": "2021",
        "xn": f"{aca_year}-{aca_year + 1}",
        #"xqmc": extract_campus(lesson_data),
        "jsxx": extract_teachers(lesson_data),
        "xq": semester,
        #"jc": 114514, # 看不懂
        "nj": extract_grade(lesson_data),
        "row_id": idx,
        "kzmc": extract_gen_type(lesson_data),
        "jxdd": extract_time_location(lesson_data),
    }
    return res

def main() -> None:
    for filename in os.listdir(os.path.join(base_path, 'LessonData')):
        if filename.startswith('Parsed_'):
            continue
        if filename.startswith('Example'):
            continue
        aca_year = int(filename.split('_')[0])
        if 'Fall' in filename:
            semester = '1'
        elif 'Spring' in filename:
            semester = '2'
            aca_year -= 1
        else:
            semester = '3'
            aca_year -= 1
        with open(os.path.join(base_path, 'LessonData', filename), 'r', encoding='utf-8') as f:
            lesson_data_list: list[dict[str, Any]] = json.load(f)
            parsed_data_list: list[dict[str, Any]] = []
            for idx, lesson_data in enumerate(lesson_data_list):
                parsed_data = parse_single(lesson_data, aca_year, semester, idx)
                parsed_data_list.append(parsed_data)
            with open(os.path.join(base_path, 'LessonData', f'Parsed_{filename}'), 'w', encoding='utf-8') as fout:
                json.dump(parsed_data_list, fout, ensure_ascii=False, indent=4)
        

if __name__ == '__main__':
    main()
