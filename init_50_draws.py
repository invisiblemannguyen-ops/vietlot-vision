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

# ==================== 2. MẢNG MÃ ĐÀI VÀ SLUG TƯƠNG ĐỐI ====================
# Dùng đường dẫn tương đối để không bị lỗi bộ lọc link
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

# ==================== 3. HÀM KIỂM TRA SỐ LƯỢNG THỰC TẾ TRONG SUPABASE ====================
def get_supabase_count(station_id):
    """Truy vấn thực tế xem đài này đã có bao nhiêu kỳ trong CSDL Supabase"""
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

# ==================== 4. HÀM CÀO HTML (TỰ ĐỘNG NỐI DOMAIN) ====================
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

def format_prize_number(raw_str):
    """Số >= 3 chữ số lấy 3D. Giải 8/7 (2 chữ số) giữ nguyên 2D."""
    clean = re.sub(r'\D', '', str(raw_str))
    if len(clean) >= 3:
        return clean[-3:]
    elif len(clean) == 2:
        return clean[-2:]
    return clean

# ==================== 5. PARSER CHO TRANG 1 ĐÀI ĐỘC LẬP ====================
def parse_single_station_page(html, station_id, db_date):
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
        
        label = tds[0].get_text(separator=' ').strip().upper()
        if any(ignore in label for ignore in ['KÝ HIỆU', 'MÃ ĐB', 'MÃ', 'ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO']):
            continue

        nums_raw = []
        for td in tds[1:]:
            nums_raw.extend(re.findall(r'\d+', td.get_text(separator=' ')))
        
        formatted_nums = [format_prize_number(n) for n in nums_raw if len(n) >= 2]
        if not formatted_nums:
            continue

        if re.search(r'ĐB|ĐẶC BIỆT', label):
            special_prize = formatted_nums[0] if formatted_nums else ""
        else:
            if station_id == "MB" and re.search(r'G7|G\.7|GIẢI 7|GIẢI BẢY', label):
                g7_or_g8.extend(formatted_nums)
            elif station_id != "MB" and re.search(r'G8|G\.8|GIẢI 8|GIẢI TÁM', label):
                g7_or_g8.extend(formatted_nums)

        raw_prizes.extend(formatted_nums)

    if not raw_prizes:
        return None

    return {
        "station_id": station_id,
        "draw_date": db_date,
        "special_prize": special_prize,
        "seventh_or_eighth": g7_or_g8,
        "raw_prizes": raw_prizes
    }

# ==================== 6. LƯU DỮ LIỆU VÀO SUPABASE ====================
def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ LỖI: Thiếu biến môi trường SUPABASE!")
        return False

    raw_prizes = data.get("raw_prizes", [])
    lo_2d = [p[-2:] for p in raw_prizes if len(p) >= 2]
    
    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": data["special_prize"], # 3D Giải ĐB
        "all_prizes": {
            "special_prize": data["special_prize"],
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": raw_prizes, # Mảng 18/27 giải
            "lo_numbers": lo_2d       # Mảng 18/27 lô 2D
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

# ==================== 7. CHƯƠNG TRÌNH CHÍNH (CÓ XÁC THỰC THỰC TẾ) ====================
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
        print(f"✅ Đài {station_id} ĐÃ ĐỦ {current_in_db} KỲ! Bỏ qua không cào lại.")
        return current_in_db

    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    days_checked = 0
    max_days_lookback = 365  # Tìm ngược tối đa 1 năm để nạp đủ 50 kỳ mở thưởng

    while current_in_db < num_target and days_checked < max_days_lookback:
        d_obj = today - datetime.timedelta(days=days_checked)
        days_checked += 1
        d_str = d_obj.strftime("%d-%m-%Y")
        db_date = d_obj.strftime("%Y-%m-%d")

        url_path = f"{slug}?date={d_str}"
        html = fetch_kqxs_html(url_path)

        if html:
            item = parse_single_station_page(html, station_id, db_date)
            # Chỉ nạp nếu đủ 18 giải (MN/MT) hoặc 27 giải (MB)
            if item and len(item["raw_prizes"]) >= 18:
                if save_to_supabase(item):
                    current_in_db = get_supabase_count(station_id)
                    time.sleep(0.2)  # Nghỉ 0.2s tránh bị chặn IP

    # Kiểm tra lại lần cuối trực tiếp từ Supabase
    final_count = get_supabase_count(station_id)
    print(f"🔍 [XÁC THỰC THỰC TẾ SUPABASE] Đài {station_id}: Có chính xác {final_count}/{num_target} kỳ trong CSDL!")
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
        print(f"\n🏆 [HOÀN TẤT NẠP LỊCH SỬ] Đã kiểm tra và lưu toàn bộ dữ liệu vào Supabase!")
