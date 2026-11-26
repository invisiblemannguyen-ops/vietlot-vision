import os
import re
import time
import datetime
import unicodedata
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

# ==================== 2. CẤU HÌNH 3 ĐÀI MỞ THƯỞNG 2 LẦN/TUẦN ====================
TARGET_STATIONS = {
    "TPHCM": {
        "name": "TP. Hồ Chí Minh",
        "slugs": ["/mien-nam/xo-so-tp-hcm", "/xo-so-tp-hcm", "/mien-nam/xo-so-tphcm"],
        "days": [0, 5],  # Thứ 2 (0) & Thứ 7 (5)
        "keywords": ["TPHCM", "HUCHIMINH", "HOCHIMINH", "THANHPHOHOCHIMINH"]
    },
    "DANANG": {
        "name": "Đà Nẵng",
        "slugs": ["/mien-trung/xo-so-da-nang", "/xo-so-da-nang"],
        "days": [2, 5],  # Thứ 4 (2) & Thứ 7 (5)
        "keywords": ["DANANG"]
    },
    "KHANHHOA": {
        "name": "Khánh Hòa",
        "slugs": ["/mien-trung/xo-so-khanh-hoa", "/xo-so-khanh-hoa"],
        "days": [2, 6],  # Thứ 4 (2) & Chủ Nhật (6)
        "keywords": ["KHANHHOA"]
    }
}

def clean_text_for_match(text):
    """Xóa sạch dấu, khoảng trắng, ký tự đặc biệt -> chỉ giữ chữ cái & số UPPERCASE"""
    if not text:
        return ""
    unacc = unicodedata.normalize('NFD', str(text))
    unacc = re.sub(r'[\u0300-\u036f]', '', unacc).replace('Đ', 'D').replace('đ', 'd').upper()
    return re.sub(r'[^A-Z0-9]', '', unacc)

# ==================== 3. HÀM KIỂM TRA ĐẾM TRỰC TIẾP SUPABASE ====================
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

# ==================== 4. HÀM TẢI HTML ====================
def fetch_kqxs_html(path_url):
    domain_host = "kqxs.vn"
    full_target = f"https://{domain_host}{path_url}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9'
    }
    try:
        from curl_cffi import requests as cffi_requests
        res = cffi_requests.get(full_target, headers=headers, impersonate="chrome120", timeout=12)
        if res.status_code == 200 and res.text:
            return res.text
    except Exception:
        pass
    try:
        res = requests.get(full_target, headers=headers, timeout=12)
        if res.status_code == 200 and res.text:
            return res.text
    except Exception:
        pass
    return None

# ==================== 5. PARSER BÓC TÁCH CHUẨN XÁC 18 GIẢI ====================
def parse_station_page(html, station_id, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    page_text_clean = clean_text_for_match(soup.get_text())
    
    # 1. Kiểm tra xác thực tên đài (Chuẩn hóa không dấu, không ký tự đặc biệt)
    keywords = TARGET_STATIONS[station_id]["keywords"]
    if not any(kw in page_text_clean for kw in keywords):
        return None

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
        
        label_raw = tds[0].get_text(separator=' ').strip()
        label_clean = clean_text_for_match(label_raw)

        if any(k in label_clean for k in ['DAU', 'DUOI', 'LOTO', 'MA', 'KYHIEU', 'THONGKE']):
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

        if 'DB' in label_clean or 'DACBIET' in label_clean:
            special_prize = formatted_nums[0] if formatted_nums else ""
        elif 'G8' in label_clean or 'TRAM' in label_clean or 'TAM' in label_clean:
            g8_list.extend(formatted_nums)

        raw_prizes.extend(formatted_nums)

    # Miền Nam & Miền Trung bắt buộc đúng 18 giải
    if len(raw_prizes) != 18:
        return None

    if not special_prize or special_prize in ['000', '00']:
        return None

    return {
        "station_id": station_id,
        "draw_date": db_date,
        "special_prize": special_prize,
        "seventh_or_eighth": g8_list,
        "raw_prizes": raw_prizes
    }

# ==================== 6. LƯU VÀO SUPABASE ====================
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
        resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=12)
        if resp.status_code in (200, 201, 204, 409):
            print(f"  ✅ [THÀNH CÔNG] Đài: {payload['station_id']} | Ngày: {payload['draw_date']} | ĐB (3D): '{data['special_prize']}' | Đủ 18 giải")
            return True
        else:
            print(f"  ❌ [LỖI] Đài {payload['station_id']}: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ [EXCEPT] {payload['station_id']}: {e}")
        return False

# ==================== 7. CHƯƠNG TRÌNH NẠP 50 KỲ CHO 3 ĐÀI ====================
def scrape_50_draws_for_target_station(station_id, num_target=50):
    info = TARGET_STATIONS[station_id]
    current_in_db = get_supabase_count(station_id)

    print(f"\n==================================================")
    print(f"📌 Đài: {info['name']} ({station_id}) - Lịch mở thưởng: 2 lần/tuần")
    print(f"📊 Hiện có thực tế trong Supabase: {current_in_db}/{num_target} kỳ")

    if current_in_db >= num_target:
        print(f"✅ Đài {station_id} ĐÃ ĐỦ {current_in_db} KỲ! Bỏ qua.")
        return current_in_db

    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    d_obj = today
    days_checked = 0
    max_days_lookback = 300  # 2 lần/tuần -> 50 kỳ chỉ cần lùi khoảng 25-30 tuần (~200 ngày)

    while current_in_db < num_target and days_checked < max_days_lookback:
        # Chỉ thử các ngày thuộc lịch quay thưởng của đài đó
        if d_obj.weekday() in info["days"]:
            d_str = d_obj.strftime("%d-%m-%Y")
            db_date = d_obj.strftime("%Y-%m-%d")

            for slug in info["slugs"]:
                url_path = f"{slug}?date={d_str}"
                html = fetch_kqxs_html(url_path)
                if html:
                    item = parse_station_page(html, station_id, db_date)
                    if item:
                        if save_to_supabase(item):
                            current_in_db = get_supabase_count(station_id)
                            time.sleep(0.15)
                            break
            
        d_obj = d_obj - datetime.timedelta(days=1)
        days_checked += 1

    final_count = get_supabase_count(station_id)
    print(f"🔍 [XÁC THỰC SUPABASE] Đài {station_id}: Có chính xác {final_count}/{num_target} kỳ trong CSDL!\n")
    return final_count

if __name__ == '__main__':
    print("🚀 [NẠP 50 KỲ TẬP TRUNG] Bắt đầu nạp 50 kỳ cho TPHCM, Đà Nẵng, Khánh Hòa...")
    for st_id in TARGET_STATIONS.keys():
        scrape_50_draws_for_target_station(st_id, num_target=50)
    print("\n🏆 [HOÀN TẤT] Nạp xong 50 kỳ lịch sử cho cả 3 đài!")
