import argparse
import os
import re
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv(override=False)

BYYT_ENTRY_URL = "https://byyt.ecnu.edu.cn/student/for-std/lesson-search/"
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)


def fetch_session(debug: bool = False) -> tuple[str, str]:
    username = os.environ["ECNU_USERNAME"]
    password = os.environ["ECNU_PASSWORD"]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not debug, slow_mo=300 if debug else 0)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        try:
            page.goto(BYYT_ENTRY_URL, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_url(re.compile(r"(sso|byyt)\.ecnu\.edu\.cn"), timeout=30000)

            if "sso.ecnu.edu.cn" in page.url:
                user_input = page.get_by_role("textbox", name="学工号 username")
                pwd_input = page.get_by_role("textbox", name="密码 password")

                user_input.fill(username)
                pwd_input.fill(password)
                pwd_input.press("Enter")

                # 等待 SSO 登录完成并跳回 byyt 域名
                page.wait_for_url("https://byyt.ecnu.edu.cn/**", timeout=30000)
                page.wait_for_load_state("domcontentloaded")

            # 手动跳转到 lesson-search/，触发自动重定向到 index/六位数字
            page.goto(BYYT_ENTRY_URL, wait_until="domcontentloaded", timeout=30000)

            page.wait_for_url(re.compile(r"lesson-search/index/\d{6}"), timeout=30000)

            # 提取 index/ 后的 6 位 STU_ID
            stu_id_match = re.search(r"index/(\d{6})", page.url)
            if not stu_id_match:
                raise RuntimeError(f"未能从 URL 中提取 6 位 STU_ID，当前 URL: {page.url}")
            stu_id = stu_id_match.group(1)

            # 提取 UUID 格式的 SESSION Cookie
            session_id = None
            for c in context.cookies("https://byyt.ecnu.edu.cn"):
                if c["name"] == "SESSION" and UUID_PATTERN.fullmatch(c["value"]):
                    session_id = c["value"]
                    break

            if not session_id:
                raise RuntimeError("登录跳转成功，但未在 Cookie 中找到 UUID 格式的 SESSION")

            return session_id, stu_id

        except Exception as e:
            page.screenshot(path="login_error.png", full_page=True)
            if debug:
                print(f"调试模式捕获异常: {e}，按回车键关闭浏览器...")
                input()
            raise RuntimeError(f"Playwright 自动登录失败: {e}")
        finally:
            browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--debug", action="store_true", help="有头模式运行，方便本地可视化调试")
    args = parser.parse_args()

    session_val, stu_id_val = fetch_session(debug=args.debug)
    github_env = os.getenv("GITHUB_ENV")

    if github_env:
        # 通知 GitHub Actions 对敏感值全局打码，避免暴露在公开日志中
        print(f"::add-mask::{session_val}")
        print(f"::add-mask::{stu_id_val}")
        with open(github_env, "a", encoding="utf-8") as f:
            f.write(f"SESSION={session_val}\n")
            f.write(f"STU_ID={stu_id_val}\n")
        print("已成功获取 SESSION 与 STU_ID 并注入 GITHUB_ENV")
    else:
        print(f"成功获取 SESSION: {session_val}")
        print(f"成功获取 STU_ID: {stu_id_val}")
        env_path = ".env"
        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                lines = [
                    line for line in f
                    if not line.startswith(("SESSION=", "STU_ID="))
                ]
        lines.append(f"SESSION={session_val}\n")
        lines.append(f"STU_ID={stu_id_val}\n")
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(lines)
        print("已更新本地 .env 中的 SESSION 和 STU_ID")