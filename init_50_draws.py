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

# ==================== 2. MẢNG SLUG URL TỪNG ĐÀI ====================
STATION_SLUGS = {
    # Miền Bắc
    "MB": "/mien-bac",

    # Miền Nam (21 đài)
    "TPHCM": "/mien-nam/xo-so-tp-hcm",
    "DONGTHAP": "/mien-nam/xo-so-dong-thap",
    "CAMAU": "/mien-nam/xo-so-ca-mau",
    "BENTRE": "/mien-nam/xo-so-ben-tre",
    "VUNGTAU": "/mien-nam/xo-so-vung-tau",
    "BACLIEU": "/mien-nam/xo-so-bac-lieu",
    "DONGNAI": "/mien-nam/xo-so-dong-nai",
    "CANTHO": "/mien-nam/xo-so-can-tho",
    "SOCTRANG": "/mien-nam/xo-so-soc-trang",
    "TAYNINH": "/mien-nam/xo-so-tay-ninh",
    "ANGIANG": "/mien-nam/xo-so-an-giang",
    "BINHTHUAN": "/mien-nam/xo-so-binh-thuan",
    "VINHLONG": "/mien-nam/xo-so-vinh-long",
    "BINHDUONG": "/mien-nam/xo-so-binh-duong",
    "TRAVINH": "/mien-nam/xo-so-tra-vinh",
    "LONGAN": "/mien-nam/xo-so-long-an",
    "BINHPHUOC": "/mien-nam/xo-so-binh-phuoc",
    "HAUGIANG": "/mien-nam/xo-so-hau-giang",
    "TIENGIANG": "/mien-nam/xo-so-tien-giang",
    "KIENGIANG": "/mien-nam/xo-so-kien-giang",
    "DALAT": "/mien-nam/xo-so-da-lat",

    # Miền Trung (14 đài)
    "PHUYEN": "/mien-trung/xo-so-phu-yen",
    "TTHUE": "/mien-trung/xo-so-thua-thien-hue",
    "DAKLAK": "/mien-trung/xo-so-dak-lak",
    "QUANGNAM": "/mien-trung/xo-so-quang-nam",
    "DANANG": "/mien-trung/xo-so-da-nang",
    "KHANHHOA": "/mien-trung/xo-so-khanh-hoa",
    "BINHDINH": "/mien-trung/xo-so-binh-dinh",
    "QUANGTRI": "/mien-trung/xo-so-quang-tri",
    "QUANGBINH": "/mien-trung/xo-so-quang-binh",
    "GIALAI": "/mien-trung/xo-so-gia-lai",
    "NINHTHUAN": "/mien-trung/xo-so-ninh-thuan",
    "QUANGNGAI": "/mien-trung/xo-so-quang-ngai",
    "DAKNONG": "/mien-trung/xo-so-dak-nong",
    "KONTUM": "/mien-trung/xo-so-kon-tum"
}

# ==================== 3. LỊCH MỞ THƯỞNG CỦA 36 ĐÀI (0=Thứ 2, ..., 6=Chủ Nhật) ====================
STATION_SCHEDULE = {
    # Miền Bắc (Tất cả các ngày trong tuần)
    "MB": [0, 1, 2, 3, 4, 5, 6],

    # Miền Nam (21 đài)
    "TPHCM": [0, 5],      # Thứ 2, Thứ 7 (2 lần/tuần)
    "DONGTHAP": [0],      # Thứ 2
    "CAMAU": [0],         # Thứ 2
    "BENTRE": [1],        # Thứ 3
    "VUNGTAU": [1],       # Thứ 3
    "BACLIEU": [1],       # Thứ 3
    "DONGNAI": [2],       # Thứ 4
    "CANTHO": [2],        # Thứ 4
    "SOCTRANG": [2],      # Thứ 4
    "TAYNINH": [3],       # Thứ 5
    "ANGIANG": [3],       # Thứ 5
    "BINHTHUAN": [3],     # Thứ 5
    "VINHLONG": [4],      # Thứ 6
    "BINHDUONG": [4],     # Thứ 6
    "TRAVINH": [4],       # Thứ 6
    "LONGAN": [5],        # Thứ 7
    "BINHPHUOC": [5],     # Thứ 7
    "HAUGIANG": [5],      # Thứ 7
    "TIENGIANG": [6],     # Chủ Nhật
    "KIENGIANG": [6],     # Chủ Nhật
    "DALAT": [6],         # Chủ Nhật

    # Miền Trung (14 đài)
    "PHUYEN": [0],        # Thứ 2
    "TTHUE": [0, 6],      # Thứ 2, Chủ Nhật (2 lần/tuần)
    "DAKLAK": [1],        # Thứ 3
    "QUANGNAM": [1],      # Thứ 3
    "DANANG": [2, 5],     # Thứ 4, Thứ 7 (2 lần/tuần)
    "KHANHHOA": [2, 6],   # Thứ 4, Chủ Nhật (2 lần/tuần)
    "BINHDINH": [3],      # Thứ 5
    "QUANGTRI": [3],      # Thứ 5
    "QUANGBINH": [3],     # Thứ 5
    "GIALAI": [4],        # Thứ 6
    "NINHTHUAN": [4],     # Thứ 6
    "QUANGNGAI": [5],     # Thứ 7
    "DAKNONG": [5],       # Thứ 7
    "KONTUM": [6]         # Chủ Nhật
}

# ==================== 4. HÀM XÁC THỰC SỐ KỲ TRONG SUPABASE ====================
def get_supabase_count(station_id):
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

# ==================== 5. HÀM CÀO HTML (CHỐNG BOT TỐI ƯU) ====================
def fetch_kqxs_html(path_url):
    domain_host = "kqxs.vn"
    full_target = f"https://{domain_host}{path_url}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9'
    }
    try:
        from curl_cffi import requests as cffi_requests
        res = cffi_requests.get(full_target, headers=headers, impersonate="chrome120", timeout=15)
        if res.status_code == 200 and res.text:
            return res.text
    except Exception:
        pass
    try:
        res = requests.get(full_target, headers=headers, timeout=15)
        if res.status_code == 200 and res.text:
            return res.text
    except Exception:
        pass
    return None

# ==================== 6. PARSER BÓC TÁCH CHUẨN XÁC ====================
def parse_single_station_page_strict(html, station_id, db_date):
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
        box_table = tables

    raw_prizes = []
    special_prize = ""
    g7_or_g8 = []

    for tr in box_table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) < 2:
            continue
        
        label_raw = tds[0].get_text(separator=' ').strip()
        label_upper = label_raw.upper()

        if any(k in label_upper for k in ['ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'MÃ', 'KÝ HIỆU', 'THỐNG KÊ']):
            continue

        nums_raw = []
        for td in tds[1:]:
            nums_raw.extend(re.findall(r'\d+', td.get_text(separator=' ')))
        
        formatted_nums = []
        for n in nums_raw:
            clean_n = re.sub(r'\D', '', n)
            if len(clean_n) >= 3:
                formatted_nums.append(clean_n[-3:])
            elif len(clean_n) == 2:
                formatted_nums.append(clean_n[-2:])

        if not formatted_nums:
            continue

        if any(k in label_upper for k in ['ĐB', 'ĐẶC BIỆT']):
            special_prize = formatted_nums[0] if formatted_nums else ""
        elif any(k in label_upper for k in ['G8', 'G.8', 'GIẢI 8', 'GIẢI TÁM']) and station_id != 'MB':
            g7_or_g8.extend(formatted_nums)
        elif any(k in label_upper for k in ['G7', 'G.7', 'GIẢI 7', 'GIẢI BẢY']) and station_id == 'MB':
            g7_or_g8.extend(formatted_nums)

        raw_prizes.extend(formatted_nums)

    expected_count = 27 if station_id == 'MB' else 18
    if len(raw_prizes) != expected_count:
        return None

    if not special_prize or special_prize in ['000', '00']:
        return None

    return {
        "station_id": station_id,
        "draw_date": db_date,
        "special_prize": special_prize,
        "seventh_or_eighth": g7_or_g8,
        "raw_prizes": raw_prizes
    }

# ==================== 7. LƯU BẢN GHI VÀO SUPABASE ====================
def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ LỖI: Thiếu biến môi trường SUPABASE!")
        return False

    raw_prizes = data.get("raw_prizes", [])
    lo_2d = [p[-2:] for p in raw_prizes if len(p) >= 2]
    
    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": data["special_prize"],
        "all_prizes": {
            "special_prize": data["special_prize"],
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": raw_prizes,
            "lo_numbers": lo_2d
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date"
    try:
        resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=15)
        if resp.status_code in (200, 201, 204, 409):
            print(f"  ✅ [LƯU THÀNH CÔNG] Đài: {payload['station_id']} | Ngày: {payload['draw_date']} | ĐB (3D): '{data['special_prize']}' | Đủ {len(raw_prizes)} giải")
            return True
        else:
            print(f"  ❌ [LỖI LƯU SUPABASE] Đài {payload['station_id']}: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ [EXCEPT] {payload['station_id']}: {e}")
        return False

# ==================== 8. NẠP LỊCH SỬ CHUẨN LỊCH MỞ THƯỞNG TỪNG ĐÀI ====================
def scrape_50_draws_for_station(station_id, num_target=50):
    if station_id not in STATION_SLUGS:
        print(f"❌ Mã đài '{station_id}' không có trong danh sách slug!")
        return 0

    slug = STATION_SLUGS[station_id]
    current_in_db = get_supabase_count(station_id)

    print(f"\n==================================================")
    print(f"📌 Kiểm tra đài: {station_id} ({slug})")
    print(f"📊 Hiện có thực tế trong Supabase: {current_in_db}/{num_target} kỳ")

    if current_in_db >= num_target:
        print(f"✅ Đài {station_id} ĐÃ ĐỦ {current_in_db} KỲ! Bỏ qua.")
        return current_in_db

    # Lấy danh sách các thứ mở thưởng của đài này (0=T2, 1=T3, ..., 6=CN)
    schedule = STATION_SCHEDULE.get(station_id, [0, 1, 2, 3, 4, 5, 6])
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    
    d_obj = today
    days_checked = 0
    max_days_lookback = 400

    while current_in_db < num_target and days_checked < max_days_lookback:
        # CHỈ CÀO NẾU NGÀY HÔM ĐÓ KHỚP VỚI LỊCH MỞ THƯỞNG CỦA ĐÀI
        if d_obj.weekday() in schedule:
            d_str = d_obj.strftime("%d-%m-%Y")
            db_date = d_obj.strftime("%Y-%m-%d")

            url_path = f"{slug}?date={d_str}"
            html = fetch_kqxs_html(url_path)

            if html:
                item = parse_single_station_page_strict(html, station_id, db_date)
                if item:
                    if save_to_supabase(item):
                        current_in_db = get_supabase_count(station_id)
                        time.sleep(0.15)

        d_obj = d_obj - datetime.timedelta(days=1)
        days_checked += 1

    final_count = get_supabase_count(station_id)
    print(f"🔍 [XÁC THỰC SUPABASE] Đài {station_id}: Có chính xác {final_count}/{num_target} kỳ trong CSDL!\n")
    return final_count

if __name__ == '__main__':
    target_st = os.environ.get('TARGET_STATION', '').strip().upper()

    if target_st:
        print(f"🚀 [GIAI ĐOẠN 1] Nạp 50 kỳ cho ĐÀI CHỈ ĐỊNH: {target_st}")
        scrape_50_draws_for_station(target_st, num_target=50)
    else:
        print("🚀 [GIAI ĐOẠN 1] Kiểm tra & Nạp đủ 50 kỳ cho TẤT CẢ CÁC ĐÀI...")
        for st_id in STATION_SLUGS.keys():
            scrape_50_draws_for_station(st_id, num_target=50)
        print("\n🏆 [HOÀN TẤT NẠP LỊCH SỬ] Đã kiểm tra và lưu toàn bộ dữ liệu vào Supabase!")
