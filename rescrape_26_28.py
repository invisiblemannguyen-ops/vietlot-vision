import os
import re
import sys
import time
import argparse
import datetime
import unicodedata
import requests
import smtplib
from email.mime.text import MIMEText
from bs4 import BeautifulSoup

try:
    from curl_cffi import requests as cffi_requests
except Exception:
    cffi_requests = None

# ==================== 1. CẤU HÌNH SUPABASE & EMAIL ====================
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
NOTIFY_EMAIL = "invisibleman.nguyen@gmail.com"

TARGET_COUNT = 50          # Duy trì đúng 50 kỳ gần nhất cuốn chiếu
TRUNCATE_DIGITS = 3        # Cắt lấy 3D cho các giải >= 3D

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY or '',
    'Authorization': f'Bearer {SUPABASE_KEY or ""}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

# ==================== 2. LỊCH QUAY THƯỜNG CÁC ĐÀI (T2 -> CN) ====================
STATION_DB = {
    # MIỀN NAM (18 GIẢI / ĐÀI)
    "TPHCM":     {"name": "TP.HCM", "region": "MN", "days": (0, 5), "aliases": ["TP.HCM", "TP. HCM", "TP HCM", "TPHCM", "HỒ CHÍ MINH", "HO CHI MINH"], "path": "xo-so-ho-chi-minh"},
    "DONGTHAP":  {"name": "Đồng Tháp", "region": "MN", "days": (0,), "aliases": ["ĐỒNG THÁP", "DONGTHAP"], "path": "xo-so-dong-thap"},
    "CAMAU":     {"name": "Cà Mau", "region": "MN", "days": (0,), "aliases": ["CÀ MAU", "CAMAU"], "path": "xo-so-ca-mau"},
    "BENTRE":    {"name": "Bến Tre", "region": "MN", "days": (1,), "aliases": ["BẾN TRE", "BENTRE"], "path": "xo-so-ben-tre"},
    "VUNGTAU":   {"name": "Vũng Tàu", "region": "MN", "days": (1,), "aliases": ["VŨNG TÀU", "VUNGTAU"], "path": "xo-so-vung-tau"},
    "BACLIEU":   {"name": "Bạc Liêu", "region": "MN", "days": (1,), "aliases": ["BẠC LIÊU", "BACLIEU"], "path": "xo-so-bac-lieu"},
    "DONGNAI":   {"name": "Đồng Nai", "region": "MN", "days": (2,), "aliases": ["ĐỒNG NAI", "DONGNAI"], "path": "xo-so-dong-nai"},
    "CANTHO":    {"name": "Cần Thơ", "region": "MN", "days": (2,), "aliases": ["CẦN THƠ", "CANTHO"], "path": "xo-so-can-tho"},
    "SOCTRANG":  {"name": "Sóc Trăng", "region": "MN", "days": (2,), "aliases": ["SÓC TRĂNG", "SOCTRANG"], "path": "xo-so-soc-trang"},
    "TAYNINH":   {"name": "Tây Ninh", "region": "MN", "days": (3,), "aliases": ["TÂY NINH", "TAYNINH"], "path": "xo-so-tay-ninh"},
    "ANGIANG":   {"name": "An Giang", "region": "MN", "days": (3,), "aliases": ["AN GIANG", "ANGIANG"], "path": "xo-so-an-giang"},
    "BINHTHUAN": {"name": "Bình Thuận", "region": "MN", "days": (3,), "aliases": ["BÌNH THUẬN", "BINHTHUAN"], "path": "xo-so-binh-thuan"},
    "VINHLONG":  {"name": "Vĩnh Long", "region": "MN", "days": (4,), "aliases": ["VĨNH LONG", "VINHLONG"], "path": "xo-so-vinh-long"},
    "BINHDUONG": {"name": "Bình Dương", "region": "MN", "days": (4,), "aliases": ["BÌNH DƯƠNG", "BINHDUONG"], "path": "xo-so-binh-duong"},
    "TRAVINH":   {"name": "Trà Vinh", "region": "MN", "days": (4,), "aliases": ["TRÀ VINH", "TRAVINH"], "path": "xo-so-tra-vinh"},
    "LONGAN":    {"name": "Long An", "region": "MN", "days": (5,), "aliases": ["LONG AN", "LONGAN"], "path": "xo-so-long-an"},
    "BINHPHUOC": {"name": "Bình Phước", "region": "MN", "days": (5,), "aliases": ["BÌNH PHƯỚC", "BINHPHUOC"], "path": "xo-so-binh-phuoc"},
    "HAUGIANG":  {"name": "Hậu Giang", "region": "MN", "days": (5,), "aliases": ["HẬU GIANG", "HAUGIANG"], "path": "xo-so-hau-giang"},
    "TIENGIANG": {"name": "Tiền Giang", "region": "MN", "days": (6,), "aliases": ["TIỀN GIANG", "TIENGIANG"], "path": "xo-so-tien-giang"},
    "KIENGIANG": {"name": "Kiên Giang", "region": "MN", "days": (6,), "aliases": ["KIÊN GIANG", "KIENGIANG"], "path": "xo-so-kien-giang"},
    "DALAT":     {"name": "Đà Lạt", "region": "MN", "days": (6,), "aliases": ["ĐÀ LẠT", "DALAT", "LÂM ĐỒNG"], "path": "xo-so-da-lat"},

    # MIỀN TRUNG (18 GIẢI / ĐÀI)
    "TTHUE":     {"name": "Thừa Thiên Huế", "region": "MT", "days": (0, 6), "aliases": ["THỪA THIÊN HUẾ", "T.T.HUẾ", "TTHUE", "HUẾ"], "path": "xo-so-thua-thien-hue"},
    "PHUYEN":    {"name": "Phú Yên", "region": "MT", "days": (0,), "aliases": ["PHÚ YÊN", "PHUYEN"], "path": "xo-so-phu-yen"},
    "DAKLAK":    {"name": "Đắc Lắc", "region": "MT", "days": (1,), "aliases": ["ĐẮK LẮK", "ĐẮC LẮC", "DAKLAK", "DAC LAC"], "path": "xo-so-dac-lac"},
    "QUANGNAM":  {"name": "Quảng Nam", "region": "MT", "days": (1,), "aliases": ["QUẢNG NAM", "QUANGNAM"], "path": "xo-so-quang-nam"},
    "DANANG":    {"name": "Đà Nẵng", "region": "MT", "days": (2, 5), "aliases": ["ĐÀ NẴNG", "DANANG"], "path": "xo-so-da-nang"},
    "KHANHHOA":  {"name": "Khánh Hòa", "region": "MT", "days": (2, 6), "aliases": ["KHÁNH HÒA", "KHANHHOA"], "path": "xo-so-khanh-hoa"},
    "BINHDINH":  {"name": "Bình Định", "region": "MT", "days": (3,), "aliases": ["BÌNH ĐỊNH", "BINHDINH"], "path": "xo-so-binh-dinh"},
    "QUANGTRI":  {"name": "Quảng Trị", "region": "MT", "days": (3,), "aliases": ["QUẢNG TRỊ", "QUANGTRI"], "path": "xo-so-quang-tri"},
    "QUANGBINH": {"name": "Quảng Bình", "region": "MT", "days": (3,), "aliases": ["QUẢNG BÌNH", "QUANGBINH"], "path": "xo-so-quang-binh"},
    "GIALAI":    {"name": "Gia Lai", "region": "MT", "days": (4,), "aliases": ["GIA LAI", "GIALAI"], "path": "xo-so-gia-lai"},
    "NINHTHUAN": {"name": "Ninh Thuận", "region": "MT", "days": (4,), "aliases": ["NINH THUẬN", "NINHTHUAN"], "path": "xo-so-ninh-thuan"},
    "QUANGNGAI": {"name": "Quảng Ngãi", "region": "MT", "days": (5,), "aliases": ["QUẢNG NGÃI", "QUANGNGAI"], "path": "xo-so-quang-ngai"},
    "DAKNONG":   {"name": "Đắc Nông", "region": "MT", "days": (5,), "aliases": ["ĐẮK NÔNG", "ĐẮC NÔNG", "DAKNONG", "DAC NONG"], "path": "xo-so-dac-nong"},
    "KONTUM":    {"name": "Kon Tum", "region": "MT", "days": (6,), "aliases": ["KON TUM", "KONTUM"], "path": "xo-so-kon-tum"},

    # MIỀN BẮC (27 GIẢI - KHÔNG GIẢI 8)
    "MB":        {"name": "Miền Bắc", "region": "MB", "days": (0, 1, 2, 3, 4, 5, 6), "aliases": ["MIỀN BẮC", "MB", "HÀ NỘI"], "path": "mien-bac"}
}

EXPECTED_COUNT_MN_MT = {'DB': 1, 'G1': 1, 'G2': 1, 'G3': 2, 'G4': 7, 'G5': 1, 'G6': 3, 'G7': 1, 'G8': 1}
EXPECTED_LEN_MN_MT = {'DB': (5, 6), 'G1': (5,), 'G2': (5,), 'G3': (5,), 'G4': (5,), 'G5': (4,), 'G6': (4, 3), 'G7': (3,), 'G8': (2,)}
PRIZE_ORDER_MN_MT = ['DB', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8']

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


def send_error_email(to_email, region, failed_stations, db_date):
    """Chỉ gửi email khi LẦN 3 THẤT BẠI."""
    gmail_user = os.environ.get('GMAIL_USER')
    gmail_pass = os.environ.get('GMAIL_APP_PASS')
    
    if not gmail_user or not gmail_pass:
        print(f"  ℹ️ [THÔNG BÁO] GMAIL_USER/GMAIL_APP_PASS chưa cài trong Secrets. GitHub Actions sẽ phát lệnh exit(1) để báo đỏ.")
        return

    subject = f"🚨 [CẢNH BÁO KQXS] Miền {region} ngày {db_date} bị thiếu đài!"
    body = f"""Hệ thống đã cào 3 lần (cách nhau 5 phút) nhưng KHÔNG THỂ lấy đủ dữ liệu Miền {region} ngày {db_date}.

Danh sách đài thất bại:
- {', '.join(failed_stations)}

Vui lòng kiểm tra lại nguồn kqxs.vn hoặc log trên GitHub Actions!
"""
    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'] = subject
    msg['From'] = gmail_user
    msg['To'] = to_email

    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(gmail_user, gmail_pass)
        server.sendmail(gmail_user, [to_email], msg.as_string())
        server.close()
        print(f"  ✉️ Đã gửi email thông báo thất bại lần 3 tới {to_email}!")
    except Exception as e:
        print(f"  ⚠️ Lỗi gửi email SMTP: {e}")


def ensure_station_exists(station_id, station_name, region):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    endpoint_get = f"{SUPABASE_URL}/rest/v1/stations?select=*"
    try:
        res = requests.get(endpoint_get, headers=HEADERS_SUPABASE, timeout=10)
        if res.status_code == 200:
            existing_ids = {str(s.get("id", s.get("station_id", ""))).upper() for s in res.json()}
            if station_id.upper() in existing_ids:
                return
    except Exception:
        pass

    endpoint_post = f"{SUPABASE_URL}/rest/v1/stations"
    for p in [{"id": station_id, "name": station_name, "region": region}, {"station_id": station_id, "id": station_id, "name": station_name, "region": region}]:
        try:
            r = requests.post(endpoint_post, json=p, headers=HEADERS_SUPABASE, timeout=10)
            if r.status_code in (200, 201, 204, 409):
                break
        except Exception:
            pass


def get_existing_date_for_station(station_id, db_date):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False
    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&draw_date=eq.{db_date}&select=draw_date"
    try:
        res = requests.get(endpoint, headers=HEADERS_SUPABASE, timeout=10)
        if res.status_code == 200 and len(res.json()) > 0:
            return True
    except Exception:
        pass
    return False


def cleanup_old_records(station_id):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=draw_date&order=draw_date.desc&limit=1000"
    try:
        res = requests.get(endpoint, headers=HEADERS_SUPABASE, timeout=10)
        if res.status_code == 200:
            data = res.json()
            if isinstance(data, list) and len(data) > TARGET_COUNT:
                all_dates = sorted([str(r.get('draw_date'))[:10] for r in data if r.get('draw_date')], reverse=True)
                delete_dates = all_dates[TARGET_COUNT:]
                for old_date in delete_dates:
                    del_ep = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&draw_date=eq.{old_date}"
                    requests.delete(del_ep, headers=HEADERS_SUPABASE, timeout=10)
                print(f"  🧹 [{station_id}] Đã dọn dẹp {len(delete_dates)} kỳ cũ (duy trì 50 kỳ cuốn chiếu).")
    except Exception as e:
        print(f"  ⚠️ [CLEANUP LỖI] {e}")


def fetch_kqxs_html(path_url):
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36', 'Accept-Language': 'vi-VN,vi;q=0.9'}
    for domain in ["www.kqxs.vn", "kqxs.vn"]:
        full_url = f"https://{domain}{path_url}"
        if cffi_requests:
            try:
                res = cffi_requests.get(full_url, headers=headers, impersonate="chrome120", timeout=12)
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


def expand_table(table):
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
            rowspan, colspan = int(cell.get('rowspan', 1)), int(cell.get('colspan', 1))
            text = cell.get_text(separator=' ').strip()
            for _ in range(colspan):
                row_cells.append(text)
                if rowspan > 1:
                    active_rowspans[c_idx] = (rowspan - 1, text)
                c_idx += 1
        grid.append(row_cells)
    return grid


def find_station_column(grid, aliases):
    for row in grid[:4]:
        if len(row) <= 1:
            continue
        for idx in range(1, len(row)):
            txt = norm(row[idx])
            txt_clean = re.sub(r'^(XS|XỔ SỐ|XO SO|KQXS)\s+', '', txt)
            if any(a in txt_clean for a in aliases):
                return idx
    return 1 if max((len(r) for r in grid), default=0) == 2 else None


def collect_prizes(grid, col=1):
    prizes = {}
    for r in grid:
        if len(r) <= col:
            continue
        label = norm(r)
        if any(k in label for k in ['ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'MÃ', 'THỐNG KÊ']):
            continue
        key = classify_label(label)
        if not key:
            continue
        for n in re.findall(r'\d+', r[col]):
            valid_lens = EXPECTED_LEN_MN_MT[key] if isinstance(EXPECTED_LEN_MN_MT[key], (tuple, list)) else (EXPECTED_LEN_MN_MT[key],)
            if len(n) in valid_lens:
                prizes.setdefault(key, []).append(n)
    return prizes


# ==================== PARSER CHUYÊN DỤNG CHO MIỀN BẮC (27 GIẢI - KHÔNG GIẢI 8) ====================
# Cấu trúc giống init_50_draws: date_in_html -> collect_prizes -> build_result -> parse
EXPECTED_COUNT_MB = {'DB': 1, 'G1': 1, 'G2': 2, 'G3': 6, 'G4': 4, 'G5': 6, 'G6': 3, 'G7': 4}
EXPECTED_LEN_MB = {'DB': 5, 'G1': 5, 'G2': 5, 'G3': 5, 'G4': 4, 'G5': 4, 'G6': 3, 'G7': 2}
PRIZE_ORDER_MB = ['DB', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7']


def date_in_html_mb(html, db_date):
    """Chống lưu nhầm ngày: title/heading của trang phải chứa đúng ngày đang cần."""
    y, m, d = db_date.split('-')
    soup = BeautifulSoup(html, 'html.parser')
    head = ' '.join(t.get_text(' ') for t in soup.find_all(['title', 'h1', 'h2', 'h3']))
    return (f"{d}-{m}-{y}" in head) or (f"{d}/{m}/{y}" in head)


def collect_prizes_mb(rows):
    """Gom số theo từng giải. Dòng tiếp nối (ô nhãn trống) thuộc giải ngay trước nó."""
    prizes = {}
    current = None
    for r in rows:
        tds = r.find_all(['td', 'th'])
        if len(tds) < 2:
            continue
        label = norm(tds[0].get_text(' '))
        if label:
            if any(k in label for k in ['ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'MÃ', 'KÝ HIỆU', 'THỐNG KÊ']):
                current = None
                continue
            key = classify_label(label)
            if key is None or key not in EXPECTED_COUNT_MB:
                current = None
                continue
            current = key
        elif current is None:
            continue
        key = current

        for cell in tds[1:]:
            for n in re.findall(r'\d+', cell.get_text(' ')):
                if len(n) == EXPECTED_LEN_MB[key]:
                    prizes.setdefault(key, []).append(n)
    return prizes


def build_result_mb(prizes, db_date):
    for key, cnt in EXPECTED_COUNT_MB.items():
        if len(prizes.get(key, [])) != cnt:
            return None
    raw_prizes = []
    for key in PRIZE_ORDER_MB:
        raw_prizes.extend(format_prize_number(n) for n in prizes[key])
    return {
        "station_id": "MB",
        "draw_date": db_date,
        "special_prize": format_prize_number(prizes['DB'][0]),
        "seventh_or_eighth": [format_prize_number(n) for n in prizes['G7']],
        "raw_prizes": raw_prizes,
    }


def parse_mb(html, db_date):
    if not html or not date_in_html_mb(html, db_date):
        return None
    soup = BeautifulSoup(html, 'html.parser')
    for t in soup.find_all('table'):
        result = build_result_mb(collect_prizes_mb(t.find_all('tr')), db_date)
        if result:
            return result
    return None


# ==================== PARSER CHO MIỀN NAM VÀ MIỀN TRUNG (18 GIẢI) ====================
def parse_mn_mt(html, station_id, aliases, db_date):
    if not html:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    for t in soup.find_all('table'):
        grid = expand_table(t)
        col = find_station_column(grid, aliases)
        if col is not None:
            prizes = collect_prizes(grid, col)
            for key, cnt in EXPECTED_COUNT_MN_MT.items():
                if len(prizes.get(key, [])) != cnt:
                    return None
            raw_prizes = [format_prize_number(n) for key in PRIZE_ORDER_MN_MT for n in prizes[key]]
            return {
                "station_id": station_id,
                "draw_date": db_date,
                "special_prize": format_prize_number(prizes['DB']),
                "seventh_or_eighth": [format_prize_number(n) for n in prizes['G8']],
                "raw_prizes": raw_prizes,
            }
    return None


def parse_station_html(html, station_id, aliases, db_date):
    if station_id == "MB":
        return parse_mb(html, db_date)
    return parse_mn_mt(html, station_id, aliases, db_date)


def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        return False
    raw_prizes = data.get("raw_prizes", [])
    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": str(data["special_prize"]).strip(),
        "all_prizes": {
            "special_prize": str(data["special_prize"]).strip(),
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": raw_prizes,
            "lo_numbers": [p[-2:] for p in raw_prizes if len(p) >= 2]
        }
    }
    try:
        resp = requests.post(f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date", json=payload, headers=HEADERS_SUPABASE, timeout=12)
        if resp.status_code in (200, 201, 204):
            print(f"  ✅ [LƯU THÀNH CÔNG] Đài: {data['station_id']} | Ngày: {data['draw_date']} | ĐB: '{data['special_prize']}' | Số giải: {len(raw_prizes)}")
            return True
        print(f"  ❌ [SUPABASE TRẢ LỖI] {data['station_id']} {data['draw_date']} | HTTP {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        print(f"  ❌ [LỖI LƯU SUPABASE] {e}")
    return False


def get_candidate_paths(st_id, cfg, d_str):
    region = cfg["region"]
    path_slug = cfg["path"]
    if st_id == "MB":
        return [
            f"/ngay-{d_str}",
            f"/mien-bac/ngay-{d_str}",
            f"/xo-so-mien-bac/ngay-{d_str}",
            f"/mien-bac?date={d_str}",
            f"/mien-bac"
        ]
    
    region_dir = "mien-nam" if region == "MN" else "mien-trung"
    return [
        f"/{region_dir}/{path_slug}/ngay-{d_str}",
        f"/{path_slug}/ngay-{d_str}",
        f"/{region_dir}/{path_slug}?date={d_str}",
        f"/{region_dir}?date={d_str}"
    ]


# ==================== CÀO LẠI 26, 27, 28/11/2026 - TẤT CẢ ĐÀI - GHI ĐÈ ====================
DATES = [datetime.date(2026, 11, 26), datetime.date(2026, 11, 27), datetime.date(2026, 11, 28)]
# Giờ VN: trước giờ này trang chưa có kết quả của ngày hôm nay -> bỏ qua, không tính là lỗi
PUBLISH_AFTER = {"MN": (16, 40), "MT": (17, 40), "MB": (18, 40)}


def find_station_column_strict(grid, aliases):
    """Như find_station_column nhưng KHÔNG đoán cột 1 khi bảng có 2 cột
    (trang gộp 3 miền có bảng MB 2 cột sẽ bị nhận nhầm cho đài MN/MT)."""
    for row in grid[:4]:
        if len(row) <= 1:
            continue
        for idx in range(1, len(row)):
            txt = norm(row[idx])
            txt_clean = re.sub(r'^(XS|XỔ SỐ|XO SO|KQXS)\s+', '', txt)
            if any(a in txt_clean for a in aliases):
                return idx
    return None


def parse_mn_mt_multi(html, station_id, aliases, db_date):
    """Parse đài MN/MT từ trang gộp: duyệt hết các bảng, bảng nào có đúng cột đài + đủ 18 giải thì lấy."""
    if not html:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    for t in soup.find_all('table'):
        grid = expand_table(t)
        col = find_station_column_strict(grid, aliases)
        if col is None:
            continue
        prizes = collect_prizes(grid, col)
        if any(len(prizes.get(k, [])) != cnt for k, cnt in EXPECTED_COUNT_MN_MT.items()):
            continue
        raw_prizes = [format_prize_number(n) for key in PRIZE_ORDER_MN_MT for n in prizes[key]]
        return {
            "station_id": station_id,
            "draw_date": db_date,
            "special_prize": format_prize_number(prizes['DB']),
            "seventh_or_eighth": [format_prize_number(n) for n in prizes['G8']],
            "raw_prizes": raw_prizes,
        }
    return None


def page_ok(html, path_url, d_str, db_date):
    """Trang phải đúng ngày: heading có ngày, hoặc URL dạng /ngay-DD-MM-YYYY và trang có ghi ngày đó."""
    if not html:
        return False
    if date_in_html_mb(html, db_date):
        return True
    y, m, d = db_date.split('-')
    return "/ngay-" in path_url and (d_str in html or f"{d}/{m}/{y}" in html)


def parse_station_for_date(st_id, cfg, d_str, db_date, cache):
    aliases = cfg["aliases"]
    gop = f"/ngay-{d_str}"                       # trang gộp 3 miền
    paths = get_candidate_paths(st_id, cfg, d_str)   # MB: trang gộp đứng đầu; MN/MT: URL riêng từng đài như daily
    if st_id != "MB":
        paths.insert(2, gop)
    for path_url in paths:
        if path_url not in cache:
            cache[path_url] = fetch_kqxs_html(path_url)
        html = cache[path_url]
        if not page_ok(html, path_url, d_str, db_date):
            continue
        if st_id != "MB" and path_url == gop:
            parsed = parse_mn_mt_multi(html, st_id, aliases, db_date)
        else:
            parsed = parse_station_html(html, st_id, aliases, db_date)
        if parsed:
            return parsed, path_url
    return None, ""


def count_draws(station_id):
    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=draw_date&limit=1000"
    try:
        res = requests.get(endpoint, headers=HEADERS_SUPABASE, timeout=10)
        if res.status_code == 200:
            return len(res.json())
    except Exception:
        pass
    return None


def rescrape(dates):
    vn_tz = datetime.timezone(datetime.timedelta(hours=7))
    now = datetime.datetime.now(vn_tz)
    ensured = set()
    ok, skipped, failed = [], [], []

    for day in dates:
        d_str = day.strftime("%d-%m-%Y")
        db_date = day.strftime("%Y-%m-%d")
        weekday = day.weekday()
        stations = [(i, c) for i, c in STATION_DB.items() if weekday in c["days"]]
        cache = {}
        print(f"\n==================== NGÀY {d_str} ({len(stations)} đài theo lịch) ====================")

        for st_id, cfg in stations:
            tag = f"{st_id} {db_date}"
            if day == now.date() and (now.hour, now.minute) < PUBLISH_AFTER[cfg["region"]]:
                print(f"  ⏭️  {tag}: chưa tới giờ công bố, bỏ qua")
                skipped.append(tag)
                continue
            parsed, used = parse_station_for_date(st_id, cfg, d_str, db_date, cache)
            if not parsed:
                print(f"  ❌ {tag}: không cào được")
                failed.append(tag)
                continue
            if st_id not in ensured:
                ensure_station_exists(st_id, cfg["name"], cfg["region"])
                ensured.add(st_id)
            if save_to_supabase(parsed):
                print(f"     (nguồn: {used})")
                ok.append(tag)
            else:
                failed.append(tag)

    print("\n==================== KIỂM TRA 50 KỲ CUỐN CHIẾU ====================")
    short = []
    for st_id in STATION_DB:
        cleanup_old_records(st_id)          # chỉ giữ 50 kỳ mới nhất mỗi đài
        n = count_draws(st_id)
        flag = "" if (n is not None and n >= TARGET_COUNT) else "  ⚠️ CHƯA ĐỦ 50"
        print(f"  {st_id:<10} {n if n is not None else '?'} kỳ{flag}")
        if flag:
            short.append(f"{st_id}={n}")

    print(f"\n📊 TỔNG KẾT: ghi đè OK {len(ok)} | bỏ qua {len(skipped)} | LỖI {len(failed)}")
    if failed:
        print("💥 Đài lỗi: " + ", ".join(failed))
    if short:
        print("⚠️ Đài chưa đủ 50 kỳ (script này không nạp bù kỳ cũ): " + ", ".join(short))
    return not failed


if __name__ == '__main__':
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong biến môi trường.")
        sys.exit(1)
    sys.exit(0 if rescrape(DATES) else 1)
