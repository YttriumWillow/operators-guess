# -*- coding: utf-8 -*-
"""
拉取 PRTS 六星干员元数据与图片，生成静态站点所需数据。

- 元数据：PRTS Cargo API（chara 表，rarity=5 即六星，charIndex>0 排除卫戍协议等非获取角色）
- 图片：优先 torappu.prts.wiki 游戏资源镜像，失败时降级 media.prts.wiki 上传库
出新干员后重跑本脚本即可（已存在的图片会跳过）。
"""
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, "js", "data", "operators.json")
AVATAR_DIR = os.path.join(ROOT, "assets", "avatar")
PORTRAIT_DIR = os.path.join(ROOT, "assets", "portrait")

CARGO_API = "https://prts.wiki/api.php"
TORAPPU = "https://torappu.prts.wiki/assets"
MEDIA = "https://media.prts.wiki"

FIELDS = ",".join([
    "chara._pageName=name",
    "chara.en=en",
    "chara.jp=ja",
    "chara.charId=charId",
    "chara.charIndex=sortId",
    "chara.profession=profession",
    "chara.subProfession=subProfession",
])
PARAMS = {
    "action": "cargoquery",
    "tables": "chara",
    "fields": FIELDS,
    "where": "chara.rarity=5 AND chara.charIndex>0",
    "order_by": "chara.charIndex",
    "limit": "500",
    "format": "json",
}


def fetch_json():
    url = CARGO_API + "?" + urllib.parse.urlencode(PARAMS)
    print("GET", url)
    req = urllib.request.Request(url, headers={"User-Agent": "OperatorsGuessBuilder/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.load(resp)
    operators = []
    for row in payload["cargoquery"]:
        t = row["title"]
        operators.append({
            "name": t["name"],
            "en": t["en"],
            "ja": t["ja"],
            "charId": t["charId"],
            "sortId": int(t["sortId"]),
            "profession": t["profession"],
            "subProfession": t["subProfession"],
        })
    operators.sort(key=lambda o: o["sortId"])
    return operators


def wiki_url(filename):
    """media.prts.wiki 的 md5 哈希目录直链，与官方前端 xb() 逻辑一致。"""
    h = hashlib.md5(filename.encode("utf-8")).hexdigest()
    return "%s/%s/%s/%s" % (
        MEDIA, h[0], h[:2], urllib.parse.quote(filename)
    )


def download_one(op):
    char_id = op["charId"]
    name = op["name"]
    jobs = [
        ("avatar", os.path.join(AVATAR_DIR, char_id + ".png"),
         "%s/char_avatar/%s.png" % (TORAPPU, char_id),
         wiki_url("头像_%s.png" % name)),
        ("portrait", os.path.join(PORTRAIT_DIR, char_id + "_1.png"),
         "%s/char_portrait/%s_1.png" % (TORAPPU, char_id),
         wiki_url("半身像_%s_1.png" % name)),
    ]
    results = []
    for kind, dest, primary, fallback in jobs:
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            results.append((kind, "skip"))
            continue
        last_err = None
        for url in (primary, fallback):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "OperatorsGuessBuilder/1.0"})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                if len(data) < 1000:
                    raise IOError("suspiciously small file: %d bytes" % len(data))
                with open(dest, "wb") as f:
                    f.write(data)
                results.append((kind, "ok(%dKB)" % (len(data) // 1024)))
                break
            except Exception as exc:  # noqa: BLE001
                last_err = exc
        else:
            results.append((kind, "FAIL: %s" % last_err))
    return char_id, results


def main():
    for d in (AVATAR_DIR, PORTRAIT_DIR, os.path.dirname(DATA_PATH)):
        os.makedirs(d, exist_ok=True)

    operators = fetch_json()
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(operators, f, ensure_ascii=False, indent=1)
    print("wrote %s (%d operators)" % (DATA_PATH, len(operators)))

    failures = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for i, (char_id, results) in enumerate(pool.map(download_one, operators), 1):
            status = ", ".join("%s=%s" % r for r in results)
            print("[%3d/%d] %s %s" % (i, len(operators), char_id, status))
            if any("FAIL" in r[1] for r in results):
                failures.append((char_id, results))

    if failures:
        print("\n%d operators had download failures:" % len(failures))
        for char_id, results in failures:
            print(" ", char_id, results)
        sys.exit(1)
    print("\nall done: %d operators, images in %s" % (len(operators), os.path.join(ROOT, "assets")))


if __name__ == "__main__":
    main()
