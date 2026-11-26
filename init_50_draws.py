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

# ==================== 2. MẢNG TÊN ĐÀI VÀ SLUG URL ====================
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

# Danh sách từ khóa tên đài để đối chiếu chính xác
STATION_KEYWORDS = {
    "MB": ["MIỀN BẮC", "MIEN BAC", "HÀ NỘI", "HA NOI"],
    "TPHCM": ["TP.HCM", "TP. HCM", "HỒ CHÍ MINH", "HO CHI MINH", "TPHCM"],
    "DONGTHAP": ["ĐỒNG THÁP", "DONG THAP"],
    "CAMAU": ["CÀ MAU", "CA MAU"],
    "BENTRE": ["BẾN TRE", "BEN TRE"],
    "VUNGTAU": ["VŨNG TÀU", "VUNG TAU"],
    "BACLIEU": ["BẠC LIÊU", "BAC LIEU"],
    "DONGNAI": ["ĐỒNG NAI", "DONG NAI"],
    "CANTHO": ["CẦN THƠ", "CAN THO"],
    "SOCTRANG": ["SÓC TRĂNG", "SOC TRANG"],
    "TAYNINH": ["TÂY NINH", "TAY NINH"],
    "ANGIANG": ["AN GIANG"],
    "BINHTHUAN": ["BÌNH THUẬN", "BINH THUAN"],
    "VINHLONG": ["VĨNH LONG", "VINH LONG"],
    "BINHDUONG": ["BÌNH DƯƠNG", "BINH DUONG"],
    "TRAVINH": ["TRÀ VINH", "TRA VINH"],
    "LONGAN": ["LONG AN"],
    "BINHPHUOC": ["BÌNH PHƯỚC", "BINH PHUOC"],
    "HAUGIANG": ["HẬU GIANG", "HAU GIANG"],
    "TIENGIANG": ["TIỀN GIANG", "TIEN GIANG"],
    "KIENGIANG": ["KIÊN GIANG", "KIEN GIANG"],
    "DALAT": ["ĐÀ LẠT", "DA LAT", "LÂM ĐỒNG"],
    "PHUYEN": ["PHÚ YÊN", "PHU YEN"],
    "TTHUE": ["THỪA THIÊN HUẾ", "THUA THIEN HUE", "T.T.HUẾ", "HUẾ"],
    "DAKLAK": ["ĐẮK LẮK", "ĐẮC LẮC", "DAK LAK"],
    "QUANGNAM": ["QUẢNG NAM", "QUANG NAM"],
    "DANANG": ["ĐÀ NẴNG", "DA NANG"],
    "KHANHHOA": ["KHÁNH HÒA", "KHANH HOA"],
    "BINHDINH": ["BÌNH ĐỊNH", "BINH DINH"],
    "QUANGTRI": ["QUẢNG TRỊ", "QUANG TRI"],
    "QUANGBINH": ["QUẢNG BÌNH", "QUANG BINH"],
    "GIALAI": ["GIA LAI"],
    "NINHTHUAN": ["NINH THUẬN", "NINH THUAN"],
    "QUANGNGAI": ["QUẢNG NGÃI", "QUANG NGAI"],
    "DAKNONG": ["ĐẮK NÔNG", "ĐẮC NÔNG", "DAK NONG"],
    "KONTUM": ["KON TUM"]
}

def remove_accents(text):
    if not text:
        return ""
    text = unicodedata.normalize('NFD', str(text))
    text = re.sub(r'[\u0300-\u036f]', '', text)
    return text.replace('Đ', 'D').replace('đ', 'd')

# ==================== 3. HÀM XÁC THỰC SỐ KỲ TRONG SUPABASE ====================
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

# ==================== 4. HÀM CÀO HTML ====================
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

# ==================== 5. PARSER CÓ BƯỚC XÁC THỰC TÊN ĐÀI MỚI CÀO ====================
def parse_single_station_page_strict(html, station_id, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    
    # 📌 BƯỚC KIỂM TRA ÁNH XẠ TÊN ĐÀI (BẮT BUỘC KHỚP NẾU KHÔNG SẼ BỎ QUA)
    page_text_upper = remove_accents(soup.get_text()).upper()
    expected_keywords = STATION_KEYWORDS.get(station_id, [])
    
    match_found = False
    for kw in expected_keywords:
        kw_unacc = remove_accents(kw).upper()
        if kw_unacc in page_text_upper:
            match_found = True
            break
            
    if not match_found:
        # Tên đài không xuất hiện trên trang -> Ngày này đài không quay -> BỎ QUA
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
        box_table = tables

    raw_prizes = []
    special_prize = ""
    g7_or_g8 = []

    PRIZE_PATTERNS = {
        'DB': re.compile(r'^(ĐB|GĐB|GIẢI ĐB|GIẢI ĐẶC BIỆT|ĐẶC BIỆT)$', re.I),
        'G1': re.compile(r'^(G1|G\.1|GIẢI NHẤT|GIẢI 1)$', re.I),
        'G2': re.compile(r'^(G2|G\.2|GIẢI NHÌ|GIẢI 2)$', re.I),
        'G3': re.compile(r'^(G3|G\.3|GIẢI BA|GIẢI 3)$', re.I),
        'G4': re.compile(r'^(G4|G\.4|GIẢI TƯ|GIẢI 4)$', re.I),
        'G5': re.compile(r'^(G5|G\.5|GIẢI NĂM|GIẢI 5)$', re.I),
        'G6': re.compile(r'^(G6|G\.6|GIẢI SÁU|GIẢI 6)$', re.I),
        'G7': re.compile(r'^(G7|G\.7|GIẢI BẢY|GIẢI 7)$', re.I),
        'G8': re.compile(r'^(G8|G\.8|GIẢI TÁM|GIẢI 8)$', re.I),
    }

    for tr in box_table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) < 2:
            continue
        
        label_raw = tds.get_text(separator=' ').strip()
        label_clean = re.sub(r'\s+', ' ', label_raw).upper()

        matched_key = None
        for key, pat in PRIZE_PATTERNS.items():
            if pat.search(label_clean):
                matched_key = key
                break
        
        if not matched_key:
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

        if matched_key == 'DB':
            special_prize = formatted_nums
        elif matched_key == 'G8' and station_id != 'MB':
            g7_or_g8.extend(formatted_nums)
        elif matched_key == 'G7' and station_id == 'MB':
            g7_or_g8.extend(formatted_nums)

        raw_prizes.extend(formatted_nums)

    # Đảm bảo số lượng giải chính xác: 27 giải (MB) hoặc 18 giải (MN/MT)
    expected_count = 27 if station_id == 'MB' else 18
    if len(raw_prizes) != expected_count:
        return None

    if not special_prize or special_prize == '000':
        return None

    return {
        "station_id": station_id,
        "draw_date": db_date,
        "special_prize": special_prize,
        "seventh_or_eighth": g7_or_g8,
        "raw_prizes": raw_prizes
    }

# ==================== 6. LƯU BẢN GHI VÀO SUPABASE ====================
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

# ==================== 7. CHƯƠNG TRÌNH NẠP 50 KỲ LỊCH SỬ ====================
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

    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    days_checked = 0
    max_days_lookback = 365

    while current_in_db < num_target and days_checked < max_days_lookback:
        d_obj = today - datetime.timedelta(days=days_checked)
        days_checked += 1
        d_str = d_obj.strftime("%d-%m-%Y")
        db_date = d_obj.strftime("%Y-%m-%d")

        url_path = f"{slug}?date={d_str}"
        html = fetch_kqxs_html(url_path)

        if html:
            item = parse_single_station_page_strict(html, station_id, db_date)
            if item:
                if save_to_supabase(item):
                    current_in_db = get_supabase_count(station_id)
                    time.sleep(0.2)

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
