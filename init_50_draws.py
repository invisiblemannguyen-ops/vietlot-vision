import os
import re
import time
import datetime
import requests
from bs4 import BeautifulSoup

# ==================== 1. CẤU HÌNH SUPABASE ====================
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY or '',
    'Authorization': f'Bearer {SUPABASE_KEY or ""}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}

# ==================== 2. HÀM ĐẾM SỐ KỲ TRONG SUPABASE ====================
def get_supabase_count(station_id="TPHCM"):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return 0
    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id"
    try:
        res = requests.get(endpoint, headers=HEADERS_SUPABASE, timeout=10)
        if res.status_code == 200 and isinstance(res.json(), list):
            return len(res.json())
    except Exception:
        pass
    return 0

# ==================== 3. HÀM TẢI HTML CHỐNG BOT ====================
def fetch_kqxs_html(path_url):
    domains = ["www.kqxs.vn", "kqxs.vn"]
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9'
    }
    for domain in domains:
        full_url = f"https://{domain}{path_url}"
        try:
            from curl_cffi import requests as cffi_requests
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
    if len(clean) >= 3:
        return clean[-3:]
    elif len(clean) == 2:
        return clean[-2:]
    return clean

# ==================== 4. PARSER VẠN NĂNG (BÓC TÁCH ĐA ĐÀI + ĐƠN ĐÀI) ====================
def parse_tphcm(html, db_date):
    if not html:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if not tables:
        return None

    STATION_MAP = {
        "TP. HCM": "TPHCM", "TP.HCM": "TPHCM", "TPHCM": "TPHCM", "HỒ CHÍ MINH": "TPHCM", "TP HCM": "TPHCM", "HO CHIMINH": "TPHCM"
    }

    # TH1: Bảng Đa đài (Multi-column từ /mien-nam?date=...)
    for t in tables:
        rows = t.find_all('tr')
        col_stations = {}
        for r in rows:
            cells = r.find_all(['td', 'th'])
            if len(cells) <= 1:
                continue
            for idx, cell in enumerate(cells):
                txt = cell.get_text(separator=' ').strip().upper()
                txt_clean = re.sub(r'^(XS|XỔ SỐ|XO SO|KQXS)\s+', '', txt).replace('.', '').strip()
                for k, v in STATION_MAP.items():
                    if k.upper().replace('.', '') == txt_clean or k.upper() in txt:
                        col_stations[idx] = v
                        break

        if "TPHCM" in col_stations.values():
            target_col_idx = [idx for idx, st in col_stations.items() if st == "TPHCM"]
            raw_prizes = []
            special_prize = ""
            g8_list = []

            for row in rows:
                tds = row.find_all(['td', 'th'])
                if len(tds) <= target_col_idx:
                    continue
                label_upper = tds.get_text(separator=' ').strip().upper()
                if any(ignore in label_upper for ignore in ['ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'MÃ', 'THỐNG KÊ']):
                    continue
                if not any(k in label_upper for k in ['G.8', 'G.7', 'G.6', 'G.5', 'G.4', 'G.3', 'G.2', 'G.1', 'G8', 'G7', 'G6', 'G5', 'G4', 'G3', 'G2', 'G1', 'ĐB', 'GIẢI', 'ĐẶC BIỆT']):
                    continue

                nums_raw = re.findall(r'\d+', tds[target_col_idx].get_text(separator=' '))
                formatted = [format_prize_number(n) for n in nums_raw if len(n) >= 2]
                if not formatted:
                    continue

                if any(k in label_upper for k in ['G8', 'G.8', 'GIẢI 8', 'GIẢI TÁM']):
                    g8_list.extend(formatted)
                elif any(k in label_upper for k in ['ĐB', 'ĐẶC BIỆT']):
                    special_prize = formatted if formatted else ""

                raw_prizes.extend(formatted)

            if len(raw_prizes) == 18 and special_prize:
                return {
                    "station_id": "TPHCM",
                    "draw_date": db_date,
                    "special_prize": special_prize,
                    "seventh_or_eighth": g8_list,
                    "raw_prizes": raw_prizes
                }

    # TH2: Bảng Đơn đài (Single-column từ /mien-nam/xo-so-ho-chi-minh/ngay-...)
    for t in tables:
        rows = t.find_all('tr')
        raw_prizes = []
        special_prize = ""
        g8_list = []
        for r in rows:
            tds = r.find_all(['td', 'th'])
            if len(tds) < 2:
                continue
            label_upper = tds.get_text(separator=' ').strip().upper()
            if any(ignore in label_upper for ignore in ['ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'MÃ', 'THỐNG KÊ']):
                continue
            if not any(k in label_upper for k in ['G.8', 'G.7', 'G.6', 'G.5', 'G.4', 'G.3', 'G.2', 'G.1', 'G8', 'G7', 'G6', 'G5', 'G4', 'G3', 'G2', 'G1', 'ĐB', 'GIẢI', 'ĐẶC BIỆT']):
                continue

            nums_raw = []
            for cell in tds[1:]:
                nums_raw.extend(re.findall(r'\d+', cell.get_text(separator=' ')))

            formatted = [format_prize_number(n) for n in nums_raw if len(n) >= 2]
            if not formatted:
                continue

            if any(k in label_upper for k in ['G8', 'G.8', 'GIẢI 8', 'GIẢI TÁM']):
                g8_list.extend(formatted)
            elif any(k in label_upper for k in ['ĐB', 'ĐẶC BIỆT']):
                special_prize = formatted if formatted else ""

            raw_prizes.extend(formatted)

        if len(raw_prizes) == 18 and special_prize:
            return {
                "station_id": "TPHCM",
                "draw_date": db_date,
                "special_prize": special_prize,
                "seventh_or_eighth": g8_list,
                "raw_prizes": raw_prizes
            }

    return None

# ==================== 5. LƯU BẢN GHI VÀO SUPABASE ====================
def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        return False

    raw_prizes = data.get("raw_prizes", [])
    lo_2d = [p[-2:] for p in raw_prizes if len(p) >= 2]
    sp_prize = str(data["special_prize"]).strip()

    payload = {
        "station_id": "TPHCM",
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
        if resp.status_code in (200, 201, 204, 409):
            print(f"  ✅ [THÀNH CÔNG TPHCM] Ngày: {data['draw_date']} | ĐB (3D): '{sp_prize}' | Đủ 18 giải")
            return True
        else:
            print(f"  ❌ [LỖI LƯU SUPABASE]: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"  ❌ [EXCEPT]: {e}")
    return False

# ==================== 6. CHƯƠNG TRÌNH NẠP 50 KỲ TPHCM ====================
def scrape_50_tphcm():
    station_id = "TPHCM"
    current_count = get_supabase_count(station_id)
    print(f"🚀 [TPHCM 50 KỲ] Đang có {current_count}/50 kỳ trong Supabase")
    if current_count >= 50:
        print("✅ Đài TPHCM ĐÃ ĐỦ 50 KỲ!")
        return

    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date()
    target_dates = []
    curr = today
    while len(target_dates) < 50:
        if curr.weekday() in (0, 5):  # Thứ 2 (0) & Thứ 7 (5)
            target_dates.append(curr)
        curr -= datetime.timedelta(days=1)

    print(f"📌 Đã lập danh sách 50 ngày mở thưởng TP.HCM (Từ {target_dates} về {target_dates[-1]})")

    saved_count = current_count
    for idx, d_obj in enumerate(target_dates, 1):
        if saved_count >= 50:
            break

        d_str = d_obj.strftime("%d-%m-%Y")
        db_date = d_obj.strftime("%Y-%m-%d")

        candidate_paths = [
            f"/mien-nam?date={d_str}",
            f"/mien-nam/xo-so-ho-chi-minh/ngay-{d_str}",
            f"/mien-nam/xo-so-tp-hcm/ngay-{d_str}"
        ]

        parsed = None
        used_path = ""
        for path in candidate_paths:
            html = fetch_kqxs_html(path)
            if html:
                parsed = parse_tphcm(html, db_date)
                if parsed:
                    used_path = path
                    break

        if parsed:
            if save_to_supabase(parsed):
                saved_count += 1
                print(f"  [{idx}/50] Nạp thành công kỳ ngày {db_date} (nguồn: {used_path})")
                time.sleep(0.15)
        else:
            print(f"  ⚠️ [{idx}/50] Không tìm thấy dữ liệu đài TPHCM cho ngày {d_str}")

    final_cnt = get_supabase_count(station_id)
    print(f"\n🎉 [HOÀN TẤT] TPHCM đã nạp thành công: {final_cnt}/50 kỳ vào Supabase!")

if __name__ == '__main__':
    scrape_50_tphcm()
