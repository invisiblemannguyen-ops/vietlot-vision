"""
CÀO BÙ MIỀN BẮC NGÀY 26/11/2026  (file dùng một lần - chạy xong có thể xóa)

Chạy:   python backfill_mb_26_11.py
Ngày khác (nếu cần):   python backfill_mb_26_11.py --date 25-11-2026

Cần 2 biến môi trường: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Không xóa dữ liệu nào. Kỳ nào dư ngoài 50 kỳ sẽ được script hằng ngày tự dọn ở lần chạy kế tiếp.
"""
import os
import re
import sys
import time
import argparse
import datetime
import unicodedata
import requests
from bs4 import BeautifulSoup

try:
    from curl_cffi import requests as cffi_requests
except Exception:
    cffi_requests = None

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
TRUNCATE_DIGITS = 3   # giống script hằng ngày
STATION_ID = "MB"

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY or '',
    'Authorization': f'Bearer {SUPABASE_KEY or ""}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

EXPECTED_COUNT_MB = {'DB': 1, 'G1': 1, 'G2': 2, 'G3': 6, 'G4': 4, 'G5': 6, 'G6': 3, 'G7': 4}
EXPECTED_LEN_MB = {'DB': 5, 'G1': 5, 'G2': 5, 'G3': 5, 'G4': 4, 'G5': 4, 'G6': 3, 'G7': 2}
PRIZE_ORDER_MB = ['DB', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7']

LABELS = [
    ('DB', ['ĐẶC BIỆT', 'ĐB']),
    ('G8', ['G.8', 'G8', 'GIẢI 8', 'GIẢI TÁM']),
    ('G7', ['G.7', 'G7', 'GIẢI 7', 'GIẢI BẢY']),
    ('G6', ['G.6', 'G6', 'GIẢI 6', 'GIẢI SÁU']),
    ('G5', ['G.5', 'G5', 'GIẢI 5', 'GIẢI NĂM']),
    ('G4', ['G.4', 'G4', 'GIẢI TƯ', 'GIẢI 4']),
    ('G3', ['G.3', 'G3', 'GIẢI BA', 'GIẢI 3']),
    ('G2', ['G.2', 'G2', 'GIẢI NHÌ', 'GIẢI 2']),
    ('G1', ['G.1', 'G1', 'GIẢI NHẤT', 'GIẢI 1']),
]


def norm(text):
    text = re.sub(r'\s+', ' ', str(text or ''))
    return unicodedata.normalize('NFC', text).strip().upper()


def format_prize_number(raw_str):
    clean = re.sub(r'\D', '', str(raw_str))
    if TRUNCATE_DIGITS and len(clean) >= 3:
        return clean[-TRUNCATE_DIGITS:]
    elif len(clean) == 2:
        return clean[-2:]
    return clean


def classify_label(label):
    for key, words in LABELS:
        if any(w in label for w in words):
            return key
    return None


def fetch_kqxs_html(path_url):
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
               'Accept-Language': 'vi-VN,vi;q=0.9'}
    for domain in ["www.kqxs.vn", "kqxs.vn"]:
        full_url = f"https://{domain}{path_url}"
        if cffi_requests:
            try:
                res = cffi_requests.get(full_url, headers=headers, impersonate="chrome120", timeout=15)
                if res.status_code == 200 and res.text:
                    return res.text
            except Exception:
                pass
        try:
            res = requests.get(full_url, headers=headers, timeout=15)
            if res.status_code == 200 and res.text:
                return res.text
        except Exception:
            pass
    return None


# ---------- PARSER MIỀN BẮC (giống script hằng ngày) ----------
def page_matches_date(soup, d_obj):
    parts = []
    if soup.title:
        parts.append(soup.title.get_text(' '))
    og = soup.find('meta', attrs={'property': 'og:title'})
    if og and og.get('content'):
        parts.append(og.get('content'))
    h1 = soup.find('h1')
    if h1:
        parts.append(h1.get_text(' '))
    found = {f.replace('/', '-') for f in re.findall(r'\d{2}[/-]\d{2}[/-]\d{4}', ' '.join(parts))}
    return d_obj.strftime("%d-%m-%Y") in found


def collect_mb_prizes(table):
    prizes = {}
    current = None
    for tr in table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) < 2:
            continue
        label = norm(tds[0].get_text(' '))
        if label:
            if any(k in label for k in ['MÃ', 'KÝ HIỆU', 'ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'THỐNG KÊ']):
                current = None
                continue
            key = classify_label(label)
            if key not in EXPECTED_LEN_MB:
                current = None
                continue
            current = key
        elif current is None:
            continue
        key = current
        for td in tds[1:]:
            for n in re.findall(r'\d+', td.get_text(' ')):
                if len(n) == EXPECTED_LEN_MB[key]:
                    prizes.setdefault(key, []).append(n)
    return prizes


def parse_mb(html, db_date, d_obj):
    if not html:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    if not page_matches_date(soup, d_obj):
        print("  ℹ️ Tiêu đề trang không phải ngày cần cào, bỏ qua.")
        return None
    best = None
    for t in soup.find_all('table'):
        prizes = collect_mb_prizes(t)
        if not prizes:
            continue
        if all(len(prizes.get(k, [])) == c for k, c in EXPECTED_COUNT_MB.items()):
            raw_prizes = [format_prize_number(n) for key in PRIZE_ORDER_MB for n in prizes[key]]
            return {
                "station_id": STATION_ID,
                "draw_date": db_date,
                "special_prize": format_prize_number(prizes['DB'][0]),
                "seventh_or_eighth": [format_prize_number(n) for n in prizes['G7']],
                "raw_prizes": raw_prizes,
            }
        if best is None or sum(len(v) for v in best.values()) < sum(len(v) for v in prizes.values()):
            best = prizes
    if best:
        print(f"  ℹ️ Bảng chưa đủ 27 giải: { {k: len(v) for k, v in best.items()} }")
    else:
        print("  ℹ️ Không thấy bảng kết quả nào trong HTML.")
    return None


# ---------- SUPABASE ----------
def already_exists(db_date):
    endpoint = (f"{SUPABASE_URL}/rest/v1/draw_results"
                f"?station_id=eq.{STATION_ID}&draw_date=eq.{db_date}&select=draw_date")
    try:
        res = requests.get(endpoint, headers=HEADERS_SUPABASE, timeout=10)
        return res.status_code == 200 and len(res.json()) > 0
    except Exception:
        return False


def ensure_station_exists():
    try:
        res = requests.get(f"{SUPABASE_URL}/rest/v1/stations?select=*", headers=HEADERS_SUPABASE, timeout=10)
        if res.status_code == 200:
            ids = {str(s.get("id", s.get("station_id", ""))).upper() for s in res.json()}
            if STATION_ID in ids:
                return
    except Exception:
        pass
    for p in [{"id": STATION_ID, "name": "Miền Bắc", "region": "MB"},
              {"station_id": STATION_ID, "id": STATION_ID, "name": "Miền Bắc", "region": "MB"}]:
        try:
            r = requests.post(f"{SUPABASE_URL}/rest/v1/stations", json=p, headers=HEADERS_SUPABASE, timeout=10)
            if r.status_code in (200, 201, 204, 409):
                break
        except Exception:
            pass


def save_to_supabase(data):
    raw_prizes = data["raw_prizes"]
    sp = str(data["special_prize"]).strip()
    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": sp,
        "all_prizes": {
            "special_prize": sp,
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": raw_prizes,
            "lo_numbers": [p[-2:] for p in raw_prizes if len(p) >= 2],
        },
    }
    try:
        resp = requests.post(f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date",
                             json=payload, headers=HEADERS_SUPABASE, timeout=12)
        if resp.status_code in (200, 201, 204):
            print(f"  ✅ ĐÃ LƯU MB ngày {data['draw_date']} | ĐB: '{sp}' | {len(raw_prizes)} giải")
            return True
        print(f"  ❌ Lỗi lưu Supabase: {resp.status_code} - {resp.text[:300]}")
    except Exception as e:
        print(f"  ❌ Lỗi lưu Supabase: {e}")
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="26-11-2026", help="Ngày cần cào bù, định dạng dd-mm-yyyy")
    args = ap.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.")
        sys.exit(1)

    d_obj = datetime.datetime.strptime(args.date, "%d-%m-%Y").date()
    d_str = d_obj.strftime("%d-%m-%Y")
    db_date = d_obj.strftime("%Y-%m-%d")
    print(f"🚀 Cào bù Miền Bắc ngày {d_str}")

    if already_exists(db_date):
        print(f"✅ MB ngày {db_date} đã có trong Supabase, không cần cào.")
        return

    ensure_station_exists()

    paths = [f"/mien-bac/ngay-{d_str}", f"/xo-so-mien-bac/ngay-{d_str}", f"/mien-bac?date={d_str}"]
    for attempt in range(1, 4):
        print(f"🔄 Lần thử {attempt}/3")
        for path in paths:
            html = fetch_kqxs_html(path)
            parsed = parse_mb(html, db_date, d_obj) if html else None
            if parsed:
                print(f"  Nguồn: {path}")
                if save_to_supabase(parsed):
                    return
                sys.exit(1)
        if attempt < 3:
            time.sleep(10)

    print("💥 Không lấy được dữ liệu MB sau 3 lần thử.")
    sys.exit(1)


if __name__ == '__main__':
    main()
