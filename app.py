from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DEEPL_FREE_URL = "https://api-free.deepl.com"
DEEPL_PRO_URL = "https://api.deepl.com"
DEEPL_TRANSLATE_PATH = "/v2/translate"
MAX_TEXT = int(os.environ.get("MAX_TRANSLATE_CHARS", "8000"))
RATE_LIMIT = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "20"))
# MOCK_OPENAI is accepted temporarily so old local test commands keep working.
MOCK_TRANSLATION = (
    os.environ.get("MOCK_TRANSLATION", "0") == "1"
    or os.environ.get("MOCK_OPENAI", "0") == "1"
)

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")
_rate_events: dict[str, deque[float]] = defaultdict(deque)

LANGUAGE_LABELS = {"ko": "Korean", "en": "English", "ru": "Russian"}
DEEPL_SOURCE_CODES = {"ko": "KO", "en": "EN", "ru": "RU"}
DEEPL_TARGET_CODES = {"ko": "KO", "en": "EN-US", "ru": "RU"}
TARGETS = {"ko": ("en", "ru"), "en": ("ko", "ru"), "ru": ("en", "ko")}


def detect_language(text: str) -> str:
    counts = {
        "ko": len(re.findall(r"[가-힣]", text)),
        "ru": len(re.findall(r"[А-Яа-яЁё]", text)),
        "en": len(re.findall(r"[A-Za-z]", text)),
    }
    source, count = max(counts.items(), key=lambda item: item[1])
    if count == 0:
        raise ValueError("한국어, 영어, 러시아어 중 하나로 입력해 주세요.")
    return source


def rate_allowed(client_id: str) -> bool:
    now = time.time()
    events = _rate_events[client_id]
    while events and now - events[0] > 60:
        events.popleft()
    if len(events) >= RATE_LIMIT:
        return False
    events.append(now)
    return True


def deepl_base_url(api_key: str) -> str:
    configured = os.environ.get("DEEPL_API_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    # DeepL Free keys conventionally end in :fx. Without a key, use the
    # documented Free endpoint as the safe local/default display value.
    return DEEPL_FREE_URL if not api_key or api_key.endswith(":fx") else DEEPL_PRO_URL


def translate_one_with_deepl(text: str, source: str, target: str, api_key: str) -> str:
    payload = {
        "text": [text],
        "target_lang": DEEPL_TARGET_CODES[target],
        "source_lang": DEEPL_SOURCE_CODES[source],
        "preserve_formatting": True,
    }
    req = urllib.request.Request(
        f"{deepl_base_url(api_key)}{DEEPL_TRANSLATE_PATH}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"DeepL-Auth-Key {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:800]
        raise RuntimeError(f"DeepL API 오류({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"DeepL API 연결 오류: {exc.reason}") from exc

    translations = data.get("translations")
    if not isinstance(translations, list) or not translations or not translations[0].get("text"):
        raise ValueError("DeepL 응답에서 번역 결과를 찾지 못했습니다.")
    return str(translations[0]["text"]).strip()


def translate_with_deepl(text: str, source: str) -> dict[str, str]:
    targets = TARGETS[source]
    if MOCK_TRANSLATION:
        return {target: f"[MOCK {target.upper()}] {text}" for target in targets}

    api_key = os.environ.get("DEEPL_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("서버에 DEEPL_API_KEY가 설정되지 않았습니다.")

    return {
        target: translate_one_with_deepl(text, source, target, api_key)
        for target in targets
    }


@app.after_request
def add_api_headers(response):
    origin = request.headers.get("Origin")
    allowed = {
        item.strip()
        for item in os.environ.get("ALLOWED_ORIGINS", "").split(",")
        if item.strip()
    }
    # Same-origin requests do not need CORS. When a separate GitHub Pages
    # frontend is used, only explicitly configured origins may call the API.
    if origin and origin in allowed:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/api/health")
def health():
    api_key = os.environ.get("DEEPL_API_KEY", "").strip()
    return jsonify(
        {
            "ok": True,
            "service": "nz-exchange-news-deepl",
            "provider": "DeepL",
            "deepl_configured": bool(api_key) or MOCK_TRANSLATION,
            "mock_mode": MOCK_TRANSLATION,
            "api_base": deepl_base_url(api_key),
        }
    )


@app.route("/api/translate", methods=["OPTIONS", "POST"])
def translate():
    if request.method == "OPTIONS":
        return ("", 204)
    client_id = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    if not rate_allowed(client_id):
        return jsonify({"ok": False, "error": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."}), 429
    body = request.get_json(silent=True) or {}
    text = body.get("text", "")
    if not isinstance(text, str) or not text.strip():
        return jsonify({"ok": False, "error": "번역할 글을 입력해 주세요."}), 400
    text = text.strip()
    if len(text) > MAX_TEXT:
        return jsonify({"ok": False, "error": f"번역할 글은 {MAX_TEXT}자 이내여야 합니다."}), 400
    try:
        source = detect_language(text)
        translations = translate_with_deepl(text, source)
        return jsonify(
            {
                "ok": True,
                "provider": "DeepL",
                "sourceLanguage": source,
                "translations": translations,
            }
        )
    except (ValueError, RuntimeError) as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
