# 虚拟排课

ECNU 学期开课表索引与排课。

## 本地运行

1. **clone 本仓库**

    ```shell
    git clone https://github.com/ECNU-minus/course-plus.git
    cd course-plus
    ```

2. **环境配置**

    - Linux
      >在 shell 中调用`./run.sh`

    - Windows
      >在 cmd 中调用`.\run.bat` 或 `run.bat`
      >或在 powershell 中调用 `./run.bat` 或 `.\run.bat`

3. **运行**

    ```
    yarn start
    ```

4. **访问 [localhost:1234](localhost:1234)**
    部分情况下端口不为`1234`，请根据 `yarn start` 的提示访问正确的端口。

5. **附加：关于本地数据更新**
    在 `data` 分支下（通过 `git checkout data` 切换到该分支）：
    执行 `cp .env.example .env` 来创建 `.env` 文件（或者手动复制并改名），并根据提示填写相关信息
    ***（若有必要可以事先使用 `venv` 或 `conda`等工具创建虚拟环境）***
    执行 `pip install -r requirements.txt` 来安装 Python 依赖包。
    之后运行 `python fetcher.py` ，并根据提示输入相关信息，来获取最新的课程数据并更新本地数据文件。

### Fork 自[SJTU-Geek/course-plus](https://github.com/SJTU-Geek/course-plus)，在此对 [SJTU-Plus](https://github.com/SJTU-Plus) 与 [SJTU-Geek](https://github.com/SJTU-Geek) 表示感谢。


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
