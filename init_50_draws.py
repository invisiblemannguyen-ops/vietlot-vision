import os
import re
import sys
import time
import datetime
import unicodedata
import requests
from bs4 import BeautifulSoup

try:
    from curl_cffi import requests as cffi_requests
except Exception:
    cffi_requests = None

# ==================== 1. CẤU HÌNH ====================
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

STATION_ID = "TPHCM"
TARGET_COUNT = 50          # số kỳ cần có trong DB
MAX_LOOKBACK_DRAWS = 70    # duyệt tối đa bấy nhiêu kỳ mở thưởng (T2 & T7) ngược về trước
TRUNCATE_DIGITS = 3        # giữ 3 số cuối cho các giải >= 3D, Giải 8 (2D) giữ nguyên.

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY or '',
    'Authorization': f'Bearer {SUPABASE_KEY or ""}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

# Cơ cấu giải TPHCM: số lượng giải và độ dài số của từng giải
EXPECTED_COUNT = {'DB': 1, 'G1': 1, 'G2': 1, 'G3': 2, 'G4': 7, 'G5': 1, 'G6': 3, 'G7': 1, 'G8': 1}
EXPECTED_LEN = {
    'DB': (5, 6),
    'G1': (5,),
    'G2': (5,),
    'G3': (5,),
    'G4': (5,),
    'G5': (4,),
    'G6': (4, 3),
    'G7': (3,),
    'G8': (2,)
}
PRIZE_ORDER = ['DB', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8']

LABELS = [
    ('DB', ['ĐẶC BIỆT', 'ĐB']),
    ('G8', ['G.8', 'G8', 'GIẢI 8', 'GIẢI TÁM']),
    ('G7', ['G.7', 'G7', 'GIẢI 7', 'GIẢI BẢY']),
    ('G6', ['G.6', 'G6', 'GIẢI 6', 'GIẢI SÁU']),
    ('G5', ['G.5', 'G5', 'GIẢI 5', 'GIẢI NĂM']),
    ('G4', ['G.4', 'G4', 'GIẢI 4', 'GIẢI TƯ']),
    ('G3', ['G.3', 'G3', 'GIẢI 3', 'GIẢI BA']),
    ('G2', ['G.2', 'G2', 'GIẢI 2', 'GIẢI NHÌ']),
    ('G1', ['G.1', 'G1', 'GIẢI 1', 'GIẢI NHẤT']),
]

STATION_ALIASES = ["TP. HCM", "TP.HCM", "TPHCM", "TP HCM", "HỒ CHÍ MINH", "HO CHI MINH"]


def norm(text):
    text = re.sub(r'\s+', ' ', str(text or ''))
    return unicodedata.normalize('NFC', text).strip().upper()


# ==================== 2. SUPABASE: LẤY CÁC NGÀY ĐÃ CÓ ====================
def get_existing_dates(station_id=STATION_ID):
    """Trả về set các draw_date (YYYY-MM-DD) đã có trong DB."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return set()
    endpoint = (f"{SUPABASE_URL}/rest/v1/draw_results"
                f"?station_id=eq.{station_id}&select=draw_date&limit=1000")
    try:
        res = requests.get(endpoint, headers=HEADERS_SUPABASE, timeout=10)
        if res.status_code == 200:
            data = res.json()
            if isinstance(data, list):
                return {str(r.get('draw_date'))[:10] for r in data if r.get('draw_date')}
        else:
            print(f"  ⚠️ [SUPABASE GET] {res.status_code} - {res.text[:200]}")
    except Exception as e:
        print(f"  ⚠️ [SUPABASE GET] {e}")
    return set()


# ==================== 3. TẢI HTML CHỐNG BOT ====================
def fetch_kqxs_html(path_url):
    domains = ["www.kqxs.vn", "kqxs.vn"]
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9'
    }
    for domain in domains:
        full_url = f"https://{domain}{path_url}"
        if cffi_requests is not None:
            try:
                res = cffi_requests.get(full_url, headers={'Accept-Language': headers['Accept-Language']},
                                        impersonate="chrome120", timeout=12)
                if res.status_code == 200 and res.text:
                    return res.text
            except Exception:
                pass
        try:
            res = requests.get(full_url, headers=headers, timeout=12)
            if res.status_code == 200 and res.text:
                return res.text
        except Exception:
            pass
    return None


def date_in_html(html, d_obj):
    """Chống lưu nhầm ngày: trang phải thực sự chứa ngày đang cần."""
    d1 = d_obj.strftime("%d-%m-%Y")
    d2 = d_obj.strftime("%d/%m/%Y")
    d3 = d_obj.strftime("%Y-%m-%d")
    return (d1 in html) or (d2 in html) or (d3 in html)


def format_prize_number(raw_str):
    """Số >= 3D cắt lấy 3D cuối. Giải 8 (2D) giữ nguyên 2D."""
    clean = re.sub(r'\D', '', str(raw_str))
    if TRUNCATE_DIGITS and len(clean) > TRUNCATE_DIGITS:
        return clean[-TRUNCATE_DIGITS:]
    return clean


# ==================== 4. PARSER VẠN NĂNG (BÓC TÁCH ĐA ĐÀI + ĐƠN ĐÀI) ====================
def classify_label(label):
    for key, words in LABELS:
        if any(w in label for w in words):
            return key
    return None


def expand_table(table):
    """Ma trận hóa bảng HTML xử lý triệt để rowspan/colspan."""
    rows = table.find_all('tr')
    grid = []
    active_rowspans = {}
    for r in rows:
        row_cells = []
        c_idx = 0
        html_cells = r.find_all(['td', 'th'])
        cell_iter = iter(html_cells)
        while True:
            if c_idx in active_rowspans:
                rem, text = active_rowspans[c_idx]
                row_cells.append(text)
                if rem - 1 > 0:
                    active_rowspans[c_idx] = (rem - 1, text)
                else:
                    del active_rowspans[c_idx]
                c_idx += 1
                continue
            try:
                cell = next(cell_iter)
            except StopIteration:
                break
            rowspan = int(cell.get('rowspan', 1))
            colspan = int(cell.get('colspan', 1))
            text = cell.get_text(separator=' ').strip()
            for _ in range(colspan):
                row_cells.append(text)
                if rowspan > 1:
                    active_rowspans[c_idx] = (rowspan - 1, text)
                c_idx += 1
        grid.append(row_cells)
    return grid


def find_station_column(grid):
    """Tìm chỉ số cột của TPHCM ở bảng đa đài hoặc đơn đài."""
    for row in grid[:4]:
        if len(row) <= 1:
            continue
        for idx in range(1, len(row)):
            txt = norm(row[idx])
            if len(txt) > 50:
                continue
            txt_clean = re.sub(r'^(XS|XỔ SỐ|XO SO|KQXS)\s+', '', txt)
            if any(a in txt_clean for a in STATION_ALIASES):
                return idx
    max_cols = max((len(r) for r in grid), default=0)
    if max_cols == 2:
        return 1
    return None


def collect_prizes(grid, col=1):
    """Gom số theo từng giải từ ma trận grid đã mở rộng rowspan."""
    prizes = {}
    for r in grid:
        if len(r) <= col:
            continue
        label = norm(r[0])
        if any(k in label for k in ['ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'MÃ', 'THỐNG KÊ']):
            continue
        key = classify_label(label)
        if not key:
            continue
        cell_text = r[col]
        for n in re.findall(r'\d+', cell_text):
            valid_lens = EXPECTED_LEN[key] if isinstance(EXPECTED_LEN[key], (tuple, list)) else (EXPECTED_LEN[key],)
            if len(n) in valid_lens:
                prizes.setdefault(key, []).append(n)
    return prizes


def build_result(prizes, db_date):
    for key, cnt in EXPECTED_COUNT.items():
        if len(prizes.get(key, [])) != cnt:
            return None
    raw_prizes = []
    for key in PRIZE_ORDER:
        raw_prizes.extend(format_prize_number(n) for n in prizes[key])
    return {
        "station_id": STATION_ID,
        "draw_date": db_date,
        "special_prize": format_prize_number(prizes['DB'][0]),
        "seventh_or_eighth": [format_prize_number(n) for n in prizes['G8']],
        "raw_prizes": raw_prizes,
    }


def parse_tphcm(html, db_date):
    if not html:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    for t in soup.find_all('table'):
        grid = expand_table(t)
        col = find_station_column(grid)
        if col is not None:
            prizes = collect_prizes(grid, col)
            result = build_result(prizes, db_date)
            if result:
                return result
    return None


# ==================== 5. LƯU BẢN GHI VÀO SUPABASE ====================
def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        return False

    raw_prizes = data.get("raw_prizes", [])
    lo_2d = [p[-2:] for p in raw_prizes if len(p) >= 2]
    sp_prize = str(data["special_prize"]).strip()

    payload = {
        "station_id": STATION_ID,
        "draw_date": data["draw_date"],
        "special_prize": sp_prize,
        "all_prizes": {
            "special_prize": sp_prize,
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": raw_prizes,
            "lo_numbers": lo_2d
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date"
    try:
        resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=12)
        if resp.status_code in (200, 201, 204):
            print(f"  ✅ [THÀNH CÔNG TPHCM] Ngày: {data['draw_date']} | ĐB (3D): '{sp_prize}' | G8 (2D): {data.get('seventh_or_eighth', [])} | Đủ 18 giải")
            return True
        print(f"  ❌ [LỖI LƯU SUPABASE]: {resp.status_code} - {resp.text[:300]}")
    except Exception as e:
        print(f"  ❌ [EXCEPT]: {e}")
    return False


# ==================== 6. NẠP 50 KỲ TPHCM ====================
def scrape_50_tphcm():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong biến môi trường.")
        sys.exit(1)

    existing = get_existing_dates()
    print(f"🚀 [TPHCM {TARGET_COUNT} KỲ] Đang có {len(existing)}/{TARGET_COUNT} kỳ trong Supabase")
    if len(existing) >= TARGET_COUNT:
        print(f"✅ Đài TPHCM ĐÃ ĐỦ {TARGET_COUNT} KỲ!")
        return

    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date()
    curr = today
    checked = 0      # số kỳ mở thưởng đã duyệt
    have = 0         # số kỳ hợp lệ (đã có sẵn + mới nạp) trong các kỳ đã duyệt
    new_saved = 0

    while have < TARGET_COUNT and checked < MAX_LOOKBACK_DRAWS:
        if curr.weekday() not in (0, 5):   # Thứ 2 (0) & Thứ 7 (5)
            curr -= datetime.timedelta(days=1)
            continue

        d_obj = curr
        curr -= datetime.timedelta(days=1)
        checked += 1

        d_str = d_obj.strftime("%d-%m-%Y")
        db_date = d_obj.strftime("%Y-%m-%d")

        if db_date in existing:
            have += 1
            continue

        candidate_paths = [
            f"/mien-nam?date={d_str}",
            f"/mien-nam/xo-so-ho-chi-minh/ngay-{d_str}",
            f"/mien-nam/xo-so-tp-hcm/ngay-{d_str}"
        ]

        parsed = None
        used_path = ""
        for path in candidate_paths:
            html = fetch_kqxs_html(path)
            if html and date_in_html(html, d_obj):
                parsed = parse_tphcm(html, db_date)
                if parsed:
                    used_path = path
                    break

        if parsed and save_to_supabase(parsed):
            have += 1
            new_saved += 1
            print(f"  [{have}/{TARGET_COUNT}] Nạp thành công kỳ ngày {db_date} (nguồn: {used_path})")
            time.sleep(0.15)
        elif not parsed:
            print(f"  ⚠️ Không tìm thấy dữ liệu đài TPHCM cho ngày {d_str}")

    final_cnt = len(get_existing_dates())
    print(f"\n🎉 [HOÀN TẤT] Nạp mới {new_saved} kỳ | TPHCM hiện có {final_cnt}/{TARGET_COUNT} kỳ trong Supabase")


if __name__ == '__main__':
    scrape_50_tphcm()
