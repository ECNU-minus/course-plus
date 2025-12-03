# 虚拟排课

ECNU 学期开课表索引与排课。

## 本地运行

1. clone 本仓库

    ```shell
    git clone https://github.com/ECNU-minus/course-plus.git
    ```

2. 获取数据

    ```shell
    rm -r public/course-plus-data
    mkdir public/course-plus-data

    git checkout data -- \
    college_id.json \
    lessonData_index.json \
    lesson_conversion.json \
    LessonData

    mv college_id.json \
    lessonData_index.json \
    lesson_conversion.json \
    LessonData \
    public/course-plus-data

    git add .
    ```

3. 安装依赖

    ```
    yarn
    ```

4. 运行

    ```
    yarn start
    ```

5. 访问[localhost:1234](localhost:1234)

Fork 自[SJTU-Geek/course-plus](https://github.com/SJTU-Geek/course-plus)，
在此对 [SJTU-Plus](https://github.com/SJTU-Plus) 与 [SJTU-Geek](https://github.com/SJTU-Geek) 表示感谢。

以下为原仓库`README.md`文件。

> # course-plus
>
> SJTU 学期开课表索引与排课。
>
> ## 使用方法
>
> ### 在线使用
>
> 本项目已部署至思源极客协会网站 ，网址: <https://geek.sjtu.edu.cn/course-plus>
>
> ### 从代码运行
>
> 软件需求
>
> [Node.js](https://nodejs.org/)
>
> 克隆存储库
>
> ```
> git clone https://github.com/SJTU-Geek/course-plus.git
> cd course-plus
> git submodule init
> git submodule update
> ```
>
> 安装依赖包
>
> ```
> yarn
> ```
>
> 启动本地服务
>
> ```
> npm run start
> ```
>
> 浏览器访问 <http://localhost:1234> , 访问本地服务。部分功能需要接入 jAccount 使用，这些功能已经提供 mock API。
>
> ## 免责声明
>
> 本网站课程相关数据来自上海交通大学[教学信息服务网](https://i.sjtu.edu.cn)。本网站所展示的数据可能不是最新版本。具体开课情况以教务网为准。
