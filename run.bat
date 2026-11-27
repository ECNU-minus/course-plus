@echo off
echo "Running Windows CMD script..."

REM Delete directory
rmdir /s /q "public\course-plus-data"

REM Create directory
mkdir "public\course-plus-data"

REM Checkout files from the data branch
git checkout data -- college_id.json lessonData_index.json lesson_conversion.json LessonData

REM Move files to the target directory
move "college_id.json" "public\course-plus-data\"
move "lessonData_index.json" "public\course-plus-data\"
move "lesson_conversion.json" "public\course-plus-data\"
move "LessonData" "public\course-plus-data\"

REM Add all changes to git
git add .

echo "Data retrieved"
echo "Configuring environment. After configuration is complete, use yarn start for local deployment"

yarn