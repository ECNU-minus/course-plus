@echo off
echo 正在执行 Windows CMD 脚本...

REM 删除目录
rmdir /s /q "public\course-plus-data"

REM 创建目录
mkdir "public\course-plus-data"

REM 从 data 分支检出文件
git checkout data -- college_id.json lessonData_index.json lesson_conversion.json LessonData

REM 移动文件到目标目录
move "college_id.json" "public\course-plus-data\"
move "lessonData_index.json" "public\course-plus-data\"
move "lesson_conversion.json" "public\course-plus-data\"
move "LessonData" "public\course-plus-data\"

REM 添加所有更改到 git
git add .

echo 已获取数据
echo 正在进行环境配置，等待配置完成后使用 yarn start 本地部署

yarn
