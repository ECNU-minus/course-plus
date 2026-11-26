from dotenv import load_dotenv
from os import path, getenv
from re import fullmatch, match, IGNORECASE

DEFAULT_URL = "https://byyt.ecnu.edu.cn/student/for-std/lesson-search/search/"


def find_base_path() -> str:
    current_path = path.abspath(__file__)
    while True:
        parent_path = path.dirname(current_path)
        if path.basename(parent_path) == "course-plus":
            return parent_path
        if parent_path == current_path:
            raise Exception("Base path 'course-plus' not found.")
        current_path = parent_path


base_path = find_base_path()


def load_and_check_dotenv():
    dotenv_path = path.join(base_path, ".env")
    # 本地存在 .env 时加载，且不覆盖已有的系统环境变量（CI 环境优先）
    if path.exists(dotenv_path):
        load_dotenv(dotenv_path, override=True)

    global url_id, url, session
    url_id = getenv("STU_ID")
    url = getenv("URL") or DEFAULT_URL
    session = getenv("SESSION")

    if not url_id or not session:
        raise ValueError("缺少必要的环境变量 'STU_ID' 或 'SESSION'（本地请检查 .env，云端请检查 Secrets/Playwright）")
    if not fullmatch(r"^\d{6}$", url_id):
        raise ValueError("STU_ID 应该是一个6位数字的字符串")
    if not fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", session, IGNORECASE):
        raise ValueError("SESSION 应该是一个UUID格式的字符串")
    if not match(r"^https?://", url):
        raise ValueError("URL 应该是一个有效的HTTP或HTTPS URL")


load_and_check_dotenv()