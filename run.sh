#!/bin/bash

echo "正在执行 bash 脚本..."

# 删除目录
rm -r public/course-plus-data

# 创建目录
mkdir public/course-plus-data

# 从 data 分支检出文件
git checkout data -- \
college_id.json \
lessonData_index.json \
lesson_conversion.json \
LessonData

# 移动文件到目标目录
mv college_id.json \
lessonData_index.json \
lesson_conversion.json \
LessonData \
public/course-plus-data

# 添加所有更改到 git
git add .

echo 已获取数据
echo 正在进行环境配置，等待配置完成后使用 yarn start 本地部署

yarn