from dotenv import load_dotenv
from os import path, getenv
from re import fullmatch, match, IGNORECASE

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
    if not path.exists(dotenv_path):
        raise FileNotFoundError(f"你.env哪里去了，是不是没从.env.example复制，还是复制了但没改对名字？")
    load_dotenv(dotenv_path)

    required_vars = ["STU_ID", "SESSION", "URL"]
    for var in required_vars:
        if not getenv(var):
            raise ValueError(f"你tm没填 '{var}'，回去看.env.example的格式，填好.env")
    if not fullmatch(r"^\d{6}$", getenv("STU_ID")):
        raise ValueError("STU_ID 应该是一个意义不明的6位数字的字符串，你是不是填错了")
    if not fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", getenv("SESSION"), IGNORECASE):
        raise ValueError("SESSION 应该是一个UUID格式的字符串，你是不是填错了")
    if not match(r"^https?://", getenv("URL")):
        raise ValueError("URL 应该是一个有效的HTTP或HTTPS URL，虽然不知道你怎么改了它，但总之错了")
    global url_id, url, session
    url_id = getenv("STU_ID")
    url = getenv("URL")
    session = getenv("SESSION")
load_and_check_dotenv()