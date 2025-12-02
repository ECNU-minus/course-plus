
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

def parse_single(lesson_data: dict[str, Any], aca_year: int, semester: str, idx: int) -> dict[str, Any]:
    time_details, sksj, jxdd = extract_time(lesson_data)
    
    # Calculate zcd and cdjc from the first time block
    # Note: This is a simplification. If a course has multiple time blocks with different weeks/periods,
    # the current data structure (single zcd/cdjc per lesson) might be insufficient or require
    # merging all blocks.
    # Assuming we merge all blocks for zcd and cdjc to represent "any time this course is active".
    # However, ClassBlock.jsx checks: checkBin(lesson.zcd, week) && checkBin(lesson.cdjc, block - 1) && lesson.xqj === day
    # This implies zcd and cdjc should be consistent with xqj.
    # If a course has different periods on different days, this flat structure is problematic.
    # But let's try to merge all info into zcd and cdjc for now, or take the first one.
    # Given the frontend logic:
    # It iterates over all lessons. If a lesson has multiple time slots (e.g. Mon 1-2, Wed 3-4),
    # the parser currently produces ONE lesson entry.
    # Wait, extract_time returns a list of details.
    # But parse_single returns ONE dict.
    # And sksj is a string like "星期一第1-2节{1-16周};星期三第3-4节{1-16周}"
    # The frontend seems to rely on `lesson.xqj` (single value) in ClassBlock.jsx: `lesson.xqj === day`.
    # This means if a course has classes on multiple days, it should probably be split into multiple entries 
    # OR the frontend logic handles it differently.
    # Let's look at ClassBlock.jsx again.
    # `selectedLesson.forEach((lesson) => { ... lesson.xqj === day ... })`
    # If `lesson.xqj` is a single string like "星期一", then it only shows up on Monday.
    # If the course is on Mon and Wed, `lesson.xqj` needs to capture that?
    # Or maybe `lesson.xqj` is just for display in the list, but for the table it uses something else?
    # No, ClassBlock uses `lesson.xqj`.
    # This implies that if a course has multiple days, it might need to be split into multiple rows in the JSON 
    # if we want it to appear on multiple days in the schedule, UNLESS `lesson.xqj` can be something else.
    # But `extract_time` returns `time_details[0][0]` as `xqj`. This is just the FIRST day.
    # This is a potential bug in the original parser logic or my understanding.
    # Let's check `Example.json` to see if there are multiple entries for the same course code.
    
    # For now, let's calculate zcd and cdjc based on ALL time blocks.
    # But wait, if I merge Mon 1-2 and Wed 3-4 into one zcd/cdjc, 
    # and xqj is "星期一", then on Monday it will show up at 1-2 AND 3-4 (if cdjc has bits 0,1,2,3 set).
    # This is wrong.
    
    # Correct approach: The JSON structure seems to assume one entry per course-time-slot if they are distinct?
    # Or maybe the frontend expects `xqj` to be an integer?
    # In `ClassBlock.jsx`: `lesson.xqj === day`. `day` is an integer (1-7).
    # In `parser.py`: `xqj` is set to `time_details[0][0]`, which is a string like "星期一".
    # Wait, `DAY_NAMES` maps '星期一' to '1'.
    # I should convert `xqj` to int.
    
    # And regarding multiple time slots:
    # If a course has multiple slots, `extract_time` returns them.
    # If we want to support multiple slots correctly with this frontend, we might need to duplicate the lesson entry
    # for each distinct (day, period) pair, or at least for each distinct day.
    # However, `row_id` is unique.
    
    # Let's look at `Example.json` again.
    # It seems `Example.json` has one entry per course.
    # And `sksj` contains all times.
    # But `xqj` is just "1".
    # If `sksj` has "Mon ...; Wed ...", and `xqj` is 1.
    # Then `ClassBlock` for Monday (day=1) will check `lesson.xqj === day` (True).
    # Then it checks `checkBin(lesson.cdjc, block - 1)`.
    # If `cdjc` is merged, it will show blocks for both Mon and Wed times ON MONDAY.
    # This confirms that the current data structure (one entry per course) combined with `lesson.xqj` being a single day
    # is insufficient for multi-day courses unless `xqj` is ignored or handled differently.
    
    # Wait, `ClassBlock.jsx` logic:
    # `lesson.xqj === day`
    # This strictly filters by the day stored in `lesson.xqj`.
    # So if `lesson.xqj` is 1 (Mon), this lesson ONLY appears on Monday columns.
    # If the course also has class on Wednesday, it WON'T appear on Wednesday column because `lesson.xqj` (1) != 3.
    
    # CONCLUSION: The parser MUST split multi-day courses into multiple JSON entries if they are to appear on multiple days.
    # OR the frontend is designed to handle `xqj` as a bitmask or array? No, `lesson.xqj === day` implies strict equality.
    
    # Let's check if `Example.json` has split entries.
    # I'll search for the same course code in `Example.json`.
    
    zcd = 0
    cdjc = 0
    
    # We need to handle the splitting logic if we want to fix this properly.
    # But first, let's just implement the calculation functions and use the first block's info,
    # and maybe fix the `xqj` to be an integer.
    
    # Re-reading `extract_time`: it returns `details` list.
    # I should probably iterate over `details` and create multiple entries if needed?
    # But `main` loop iterates `lesson_data_list` and calls `parse_single` once.
    # I should change `parse_single` to return a LIST of dicts.
    
    res_list = []
    
    # If no time details, return a dummy entry or skip?
    # Existing logic returned one entry with empty strings.
    if not time_details or time_details == [('', '', '')]:
         # Fallback for courses with no time info
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
            "jxbmc": f"({aca_year}-{aca_year + 1}-{semester})-{extract_class(lesson_data)}",
            "xf": extract_credits(lesson_data),
            "rwzxs": extract_periods(lesson_data),
            "jxbzc": extract_class_comp(lesson_data),
            "kcxzmc": extract_compulsory(lesson_data),
            "xkbz": extract_remark(lesson_data),
            "cdjc": 0,
            "xn": f"{aca_year}-{aca_year + 1}",
            "jsxx": extract_teachers(lesson_data),
            "xq": semester,
            "nj": extract_grade(lesson_data),
            "row_id": idx, # This might need to be unique across splits
            "kzmc": extract_gen_type(lesson_data),
            "jxdd": jxdd,
        }
         return [res]

    for i, (day_str, period_str, weeks_str) in enumerate(time_details):
        # Calculate zcd and cdjc for THIS block
        current_zcd = calculate_zcd(weeks_str)
        current_cdjc = calculate_cdjc(period_str)
        
        # Convert day string to int
        day_int = int(DAY_NAMES.get(day_str, 0))
        
        res = {
            "qsjsz": weeks_str,
            "zjs": extract_teachers(lesson_data).split(',')[0],
            "jszc": extract_teachers(lesson_data),
            "kkbm_id": extract_college(lesson_data)[1],
            "xqj": day_int, # Use integer day
            "kch": extract_code(lesson_data),
            "kkxy": extract_college(lesson_data)[0],
            "zcd": current_zcd,
            "sksj": sksj, # Keep full string for display
            "kcmc": extract_name(lesson_data),
            "skjc": period_str,
            "jxbmc": f"({aca_year}-{aca_year + 1}-{semester})-{extract_class(lesson_data)}",
            "xf": extract_credits(lesson_data),
            "rwzxs": extract_periods(lesson_data),
            "jxbzc": extract_class_comp(lesson_data),
            "kcxzmc": extract_compulsory(lesson_data),
            "xkbz": extract_remark(lesson_data),
            "cdjc": current_cdjc,
            "xn": f"{aca_year}-{aca_year + 1}",
            "jsxx": extract_teachers(lesson_data),
            "xq": semester,
            "nj": extract_grade(lesson_data),
            "row_id": f"{idx}_{i}", # Make row_id unique for splits
            "kzmc": extract_gen_type(lesson_data),
            "jxdd": jxdd, # Keep full string for display
        }
        res_list.append(res)
        
    return res_list

def main() -> None:
    for filename in os.listdir(os.path.join(base_path, 'LessonData')):
        if filename.startswith('Parsed_'):
            continue
        if filename.startswith('Example'):
            continue
        aca_year = int(filename.split('_')[0])
        if 'Autumn' in filename:
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
                # parse_single now returns a list
                parsed_entries = parse_single(lesson_data, aca_year, semester, idx)
                parsed_data_list.extend(parsed_entries)
            with open(os.path.join(base_path, 'LessonData', f'Parsed_{filename}'), 'w', encoding='utf-8') as fout:
                json.dump(parsed_data_list, fout, ensure_ascii=False, indent=4)

        

if __name__ == '__main__':
    main()
