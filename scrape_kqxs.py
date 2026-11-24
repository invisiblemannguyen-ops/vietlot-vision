import os
import re
import time
import datetime
import requests
from bs4 import BeautifulSoup

# Lấy thông tin cấu hình từ GitHub Secrets
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY or '',
    'Authorization': f'Bearer {SUPABASE_KEY or ""}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}

# Ánh chiếu tên đài Minh Ngọc sang station_id trong Supabase
STATION_MAP = {
    # Miền Nam
    "TP. HCM": "TPHCM", "TP.HCM": "TPHCM", "TPHCM": "TPHCM", "Đồng Tháp": "DONGTHAP", "Cà Mau": "CAMAU",
    "Bến Tre": "BENTRE", "Vũng Tàu": "VUNGTAU", "Bạc Liêu": "BACLIEU",
    "Đồng Nai": "DONGNAI", "Cần Thơ": "CANTHO", "Sóc Trăng": "SOCTRANG",
    "Tây Ninh": "TAYNINH", "An Giang": "ANGIANG", "Bình Thuận": "BINHTHUAN",
    "Vĩnh Long": "VINHLONG", "Bình Dương": "BINHDUONG", "Trà Vinh": "TRAVINH",
    "Long An": "LONGAN", "Bình Phước": "BINHPHUOC", "Hậu Giang": "HAUGIANG",
    "Tiền Giang": "TIENGIANG", "Kiên Giang": "KIENGIANG", "Đà Lạt": "DALAT",
    # Miền Trung
    "Thừa Thiên Huế": "TTHUE", "T.T.Huế": "TTHUE", "Phú Yên": "PHUYEN", "Đắc Lắc": "DAKLAK", "Đắk Lắk": "DAKLAK", "Quảng Nam": "QUANGNAM",
    "Đà Nẵng": "DANANG", "Khánh Hòa": "KHANHHOA", "Bình Định": "BINHDINH", "Quảng Trị": "QUANGTRI",
    "Quảng Bình": "QUANGBINH", "Gia Lai": "GIALAI", "Ninh Thuận": "NINHTHUAN",
    "Quảng Ngãi": "QUANGNGAI", "Đắc Nông": "DAKNONG", "Kon Tum": "KONTUM"
}

def extract_2d_lo(prizes_raw):
    """Trích xuất 2 số cuối của tất cả các giải"""
    lo_set = []
    for p in prizes_raw:
        clean_p = re.sub(r'\D', '', str(p))
        if len(clean_p) >= 2:
            lo_set.append(clean_p[-2:])
    return lo_set

# Cơ chế chống BOT giả lập Chrome qua curl_cffi
def fetch_page(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
    }
    try:
        from curl_cffi import requests as cffi_requests
        res = cffi_requests.get(url, headers=headers, impersonate="chrome120", timeout=15)
        if res.status_code == 200 and res.text:
            return res.text
    except Exception:
        pass
    try:
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code == 200 and res.text:
            return res.text
    except Exception:
        pass
    return None

# ==================== 1. CÀO MIỀN BẮC (KQXS.VN) ====================
def scrape_kqxs_mb(date_str):
    proto = "https"
    domain = "kqxs.vn"
    url = f"{proto}://{domain}/mien-bac?date={date_str}"
    
    html = fetch_page(url)
    if not html:
        print(f"❌ Không tải được MB ngày {date_str}")
        return None

    soup = BeautifulSoup(html, 'html.parser')
    box_table = soup.find('table', class_=re.compile(r'table|kqxs|bkqtmb', re.I))
    if not box_table:
        return None

    prizes_raw = []
    special_prize = ""
    g7_numbers = []

    for tr in box_table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) >= 2:
            label = tds[0].text.strip()
            nums = [re.sub(r'\D', '', n) for n in tds[1].text.split('-') if re.sub(r'\D', '', n)]
            if not nums:
                continue
            if re.search(r'ĐB|Đặc biệt|GĐB', label, re.I):
                special_prize = nums[0] if nums else ""
            if re.search(r'G7|Giải 7|Giải Bảy', label, re.I):
                g7_numbers.extend(nums)
            prizes_raw.extend(nums)

    if not prizes_raw:
        return None

    db_date = datetime.datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")
    lo_numbers = extract_2d_lo(prizes_raw)

    return {
        "station_id": "MB",
        "draw_date": db_date,
        "special_prize": special_prize,
        "seventh_or_eighth": g7_numbers,
        "lo_numbers": lo_numbers,
        "raw_prizes": prizes_raw
    }

# ==================== 2. CÀO MIỀN NAM & MIỀN TRUNG (KQXS.VN) ====================
def scrape_kqxs_mn_mt(region_code, date_str):
    proto = "https"
    domain = "kqxs.vn"
    # region_code: "mien-nam" hoặc "mien-trung"
    url = f"{proto}://{domain}/{region_code}?date={date_str}"
    
    html = fetch_page(url)
    if not html:
        print(f"❌ Không tải được {region_code} ngày {date_str}")
        return []

    soup = BeautifulSoup(html, 'html.parser')
    box_table = soup.find('table', class_=re.compile(r'table|kqxs|bkqtmiennam|bkqtmientrung', re.I))
    if not box_table:
        return []

    header_row = box_table.find('tr', class_=re.compile(r'header|head', re.I)) or box_table.find('tr')
    if not header_row:
        return []

    station_names = [td.text.strip() for td in header_row.find_all(['td', 'th']) if td.text.strip()]
    station_results = {name: {"special": "", "g8": [], "raw_prizes": []} for name in station_names}

    rows = box_table.find_all('tr')
    for row in rows:
        tds = row.find_all(['td', 'th'])
        if len(tds) <= 1:
            continue

        prize_name = tds[0].text.strip()
        for idx, td in enumerate(tds[1:]):
            if idx < len(station_names):
                st_name = station_names[idx]
                nums = [re.sub(r'\D', '', n) for n in td.text.split('-') if re.sub(r'\D', '', n)]
                if not nums:
                    continue
                
                if prize_name in ['G.8', 'Giải 8', 'Giải Tám', 'G8']:
                    station_results[st_name]["g8"].extend(nums)
                elif prize_name in ['ĐB', 'Giải ĐB', 'Giải Đặc Biệt', 'GĐB']:
                    station_results[st_name]["special"] = nums[0] if nums else ""

                station_results[st_name]["raw_prizes"].extend(nums)

    db_date = datetime.datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")
    records = []

    for name, res_data in station_results.items():
        st_id = STATION_MAP.get(name)
        if st_id and res_data["raw_prizes"]:
            lo_numbers = extract_2d_lo(res_data["raw_prizes"])
            records.append({
                "station_id": st_id,
                "draw_date": db_date,
                "special_prize": res_data["special"],
                "seventh_or_eighth": res_data["g8"],
                "lo_numbers": lo_numbers,
                "raw_prizes": res_data["raw_prizes"]
            })
    return records

# ==================== 3. LƯU & DỌN DẸP SUPABASE ====================
def get_existing_count(station_id):
    if not SUPABASE_URL:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id"
    try:
        res = requests.get(url, headers=HEADERS_SUPABASE)
        if res.status_code == 200 and isinstance(res.json(), list):
            return len(res.json())
    except Exception:
        pass
    return 0

def save_to_supabase(data):
    if not data or not SUPABASE_URL:
        return False
    
    # Đóng gói dữ liệu khớp 100% với cột CSDL Supabase
    sp = data.get("special_prize", "")
    if isinstance(sp, list):
        sp = sp[0] if len(sp) > 0 else ""
    else:
        sp = str(sp)

    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": sp,
        "all_prizes": {
            "lo_numbers": data.get("lo_numbers", []),
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": data.get("raw_prizes", [])
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results"
    resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE)
    if resp.status_code in (200, 201):
        print(f"✅ Đã lưu thành công đài {data['station_id']} ngày {data['draw_date']}")
        return True
    else:
        print(f"❌ Lỗi lưu Supabase [{data['station_id']}]: {resp.status_code} - {resp.text}")
        return False

def clean_rolling_50(station_id):
    if not SUPABASE_URL:
        return
    url = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id&order=draw_date.desc&offset=50"
    try:
        res = requests.get(url, headers=HEADERS_SUPABASE).json()
        if res and isinstance(res, list) and len(res) > 0:
            old_ids = [str(row['id']) for row in res]
            delete_url = f"{SUPABASE_URL}/rest/v1/draw_results?id=in.({','.join(old_ids)})"
            requests.delete(delete_url, headers=HEADERS_SUPABASE)
            print(f"🧹 Đã dọn dẹp {len(old_ids)} kỳ cũ của đài {station_id}.")
    except Exception as e:
        print(f"Lỗi dọn dẹp đài {station_id}: {e}")

# ==================== 4. CHƯƠNG TRÌNH CHÍNH ====================
if __name__ == '__main__':
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    today_str = today.strftime("%d-%m-%Y")
    
    print(f"🚀 Bắt đầu tiến trình cào dữ liệu xổ số tự động ngày {today_str}...")

    total_saved = 0

    # 1. Cào Miền Bắc
    mb_count = get_existing_count("MB")
    if mb_count < 50:
        print(f"🔄 Đài MB mới có {mb_count}/50 kỳ. Đang nạp đủ 50 kỳ lịch sử...")
        for i in range(50):
            d_str = (today - datetime.timedelta(days=i)).strftime("%d-%m-%Y")
            item = scrape_kqxs_mb(d_str)
            if item:
                if save_to_supabase(item):
                    total_saved += 1
            time.sleep(0.2)
        clean_rolling_50("MB")
    else:
        print(f"✅ Đài MB đã đủ 50 kỳ. Cào bổ sung hôm nay ({today_str})...")
        item = scrape_kqxs_mb(today_str)
        if item:
            if save_to_supabase(item):
                total_saved += 1
            clean_rolling_50("MB")

    # 2. Cào Miền Nam & Miền Trung
    print(f"🌐 Đang cào Miền Nam & Miền Trung ngày {today_str}...")
    mn_items = scrape_kqxs_mn_mt("mien-nam", today_str)
    for item in mn_items:
        if save_to_supabase(item):
            total_saved += 1
        clean_rolling_50(item["station_id"])

    mt_items = scrape_kqxs_mn_mt("mien-trung", today_str)
    for item in mt_items:
        if save_to_supabase(item):
            total_saved += 1
        clean_rolling_50(item["station_id"])

    print(f"🎉 Hoàn tất quá trình cào! Tổng cộng đã lưu {total_saved} bản ghi vào Supabase.")
    if total_saved == 0:
        raise RuntimeError("❌ LỖI: Không có bản ghi nào được lưu vào Supabase!")
