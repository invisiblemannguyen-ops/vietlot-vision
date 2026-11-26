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
    domain = "kqxs.vn"
    full_url = f"https://{domain}{path_url}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9'
    }
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

# ==================== 4. PARSER BÓC TÁCH BẢNG GIẢI TP.HCM ====================
def parse_hcm_page(html, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if not tables:
        return None

    box_table = None
    for t in tables:
        if t.find(string=re.compile(r'Đặc biệt|GĐB|Giải 1|G1|Giải tám|G8', re.I)):
            box_table = t
            break
    if not box_table:
        box_table = tables[0]

    raw_prizes = []
    special_prize = ""
    g8_list = []

    for tr in box_table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) < 2:
            continue

        label_raw = tds[0].get_text(separator=' ').strip().upper()
        if any(k in label_raw for k in ['KÝ HIỆU', 'MÃ ĐB', 'MÃ', 'ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'THỐNG KÊ']):
            continue

        nums_raw = []
        for td in tds[1:]:
            nums_raw.extend(re.findall(r'\d+', td.get_text(separator=' ')))

        formatted_nums = [format_prize_number(n) for n in nums_raw if len(n) >= 2]
        if not formatted_nums:
            continue

        if any(k in label_raw for k in ['ĐB', 'ĐẶC BIỆT']):
            special_prize = formatted_nums[0] if formatted_nums else ""
        elif any(k in label_raw for k in ['G8', 'G.8', 'GIẢI 8', 'GIẢI TÁM']):
            g8_list.extend(formatted_nums)

        raw_prizes.extend(formatted_nums)

    # Đảm bảo đủ 18 giải
    if len(raw_prizes) != 18 or not special_prize:
        return None

    return {
        "station_id": "TPHCM",
        "draw_date": db_date,
        "special_prize": special_prize,
        "seventh_or_eighth": g8_list,
        "raw_prizes": raw_prizes
    }

# ==================== 5. LƯU BẢN GHI VÀO SUPABASE ====================
def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        return False

    raw_prizes = data.get("raw_prizes", [])
    lo_2d = [p[-2:] for p in raw_prizes if len(p) >= 2]
    
    payload = {
        "station_id": "TPHCM",
        "draw_date": data["draw_date"],
        "special_prize": str(data["special_prize"]).strip(),
        "all_prizes": {
            "special_prize": str(data["special_prize"]).strip(),
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": raw_prizes,
            "lo_numbers": lo_2d
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date"
    try:
        resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=12)
        if resp.status_code in (200, 201, 204, 409):
            print(f"  ✅ [THÀNH CÔNG TPHCM] Ngày: {data['draw_date']} | ĐB (3D): '{data['special_prize']}' | Đủ 18 giải")
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

    # Lập danh sách đúng 50 ngày mở thưởng cho TPHCM (Thứ 2 = 0, Thứ 7 = 5)
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date()
    target_dates = []
    curr = today
    while len(target_dates) < 50:
        if curr.weekday() in [0, 5]: # Thứ 2 (0) & Thứ 7 (5)
            target_dates.append(curr)
        curr -= datetime.timedelta(days=1)

    print(f"📌 Đã lập danh sách 50 ngày mở thưởng TP.HCM (Từ {target_dates[0]} về {target_dates[-1]})")

    saved_count = current_count
    for d_obj in target_dates:
        if saved_count >= 50:
            break

        d_str = d_obj.strftime("%d-%m-%Y")
        db_date = d_obj.strftime("%Y-%m-%d")

        # Đường dẫn chuẩn khớp với link tham khảo
        candidate_paths = [
            f"/mien-nam/xo-so-ho-chi-minh/ngay-{d_str}",
            f"/mien-nam/xo-so-tp-hcm/ngay-{d_str}",
            f"/mien-nam?date={d_str}"
        ]

        parsed = None
        for path in candidate_paths:
            html = fetch_kqxs_html(path)
            if html:
                parsed = parse_hcm_page(html, db_date)
                if parsed:
                    break

        if parsed:
            if save_to_supabase(parsed):
                saved_count += 1
                time.sleep(0.1)

    final_cnt = get_supabase_count(station_id)
    print(f"\n🎉 [HOÀN TẤT] TPHCM đã nạp: {final_cnt}/50 kỳ vào Supabase!")

if __name__ == '__main__':
    scrape_50_tphcm()
