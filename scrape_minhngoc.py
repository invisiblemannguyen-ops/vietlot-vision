import os
import re
import time
import datetime
import requests
from bs4 import BeautifulSoup

# ===========================================================================
# CẤU HÌNH SUPABASE TRỰC TIẾP
# ===========================================================================
SUPABASE_URL = "https://hdonvadjftzkhqjqizrx.supabase.co"
SUPABASE_KEY = "sb_publishable_gd0nNLRnNq4ppRWbMk6KEw_F8n13jQf"

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}

HEADERS_WEB = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
}

SCHEME = "https://"
HOST = "www.minhngoc.net.vn"

# Ánh chiếu tên đài Minh Ngọc sang station_id chuẩn trong Supabase
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

def fetch_soup(urls):
    for url in urls:
        try:
            res = requests.get(url, headers=HEADERS_WEB, timeout=12)
            if res.status_code == 200 and len(res.text) > 1000:
                return BeautifulSoup(res.text, 'html.parser')
        except Exception:
            continue
    return None

# ==================== 1. CÀO MIỀN BẮC ====================
def scrape_minhngoc_mb(date_str):
    urls = [
        f"{SCHEME}{HOST}/ket-qua-xo-so/mien-bac/{date_str.strip()}.html",
        f"{SCHEME}{HOST}/ket-qua-xo-so/ket-qua-xoso-mien-bac/{date_str.strip()}.html"
    ]
    soup = fetch_soup(urls)
    if not soup:
        print(f"⚠️ MB {date_str}: Không tải được trang")
        return None

    # Tìm bảng kết quả: ưu tiên regex class, nếu không có thì tìm parent từ ô gdb
    box_table = soup.find('table', class_=re.compile(r'bkqtmb|bkqmb|box_kqxs'))
    if not box_table:
        gdb_td = soup.find('td', class_='gdb')
        if gdb_td:
            box_table = gdb_td.find_parent('table')

    if not box_table:
        print(f"⚠️ MB {date_str}: Không tìm thấy bảng kết quả")
        return None

    prizes_raw = []
    special_prize = ""
    gdb_cell = box_table.find('td', class_='gdb')
    if gdb_cell:
        special_prize = re.sub(r'\D', '', gdb_cell.text.strip())
        prizes_raw.append(special_prize)

    g7_numbers = []
    for td in box_table.find_all('td'):
        classes = td.get('class', [])
        if 'g7' in classes:
            nums = [re.sub(r'\D', '', n) for n in td.text.split('-') if n.strip().isdigit()]
            g7_numbers.extend(nums)
        elif any(c in classes for c in ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']):
            nums = [re.sub(r'\D', '', n) for n in td.text.split('-') if n.strip().isdigit()]
            prizes_raw.extend(nums)

    prizes_raw.extend(g7_numbers)
    if not prizes_raw:
        return None

    db_date = datetime.datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")
    lo_numbers = extract_2d_lo(prizes_raw)

    return {
        "station_id": "MB",
        "draw_date": db_date,
        "special_prize": str(special_prize),
        "seventh_or_eighth": g7_numbers,
        "lo_numbers": lo_numbers
    }

# ==================== 2. CÀO MIỀN NAM & MIỀN TRUNG ====================
def scrape_minhngoc_mn_mt(region_code, date_str):
    urls = [
        f"{SCHEME}{HOST}/ket-qua-xo-so/{region_code}/{date_str.strip()}.html"
    ]
    soup = fetch_soup(urls)
    if not soup:
        return []

    box_table = soup.find('table', class_=re.compile(r'bkqtmiennam|bkqtmientrung|bkqtmn|bkqtmt'))
    if not box_table:
        header_tr = soup.find('tr', class_='header')
        if header_tr:
            box_table = header_tr.find_parent('table')

    if not box_table:
        return []

    header_row = box_table.find('tr', class_='header')
    if not header_row:
        return []

    station_names = [td.text.strip() for td in header_row.find_all('td') if td.text.strip() and "Giải" not in td.text and "Tỉnh" not in td.text]
    station_results = {name: {"special": "", "g8": [], "raw_prizes": []} for name in station_names}

    rows = box_table.find_all('tr')
    for row in rows:
        tds = row.find_all('td')
        if len(tds) <= 1:
            continue

        prize_name = tds[0].text.strip()
        for idx, td in enumerate(tds[1:]):
            if idx < len(station_names):
                st_name = station_names[idx]
                nums = [re.sub(r'\D', '', n) for n in td.text.split('-') if n.strip().isdigit()]
                if not nums:
                    continue
                
                if prize_name in ['G.8', 'Giải 8', 'Giải Tám', '8']:
                    station_results[st_name]["g8"].extend(nums)
                elif prize_name in ['ĐB', 'Giải ĐB', 'Giải Đặc Biệt', 'DB']:
                    station_results[st_name]["special"] = nums[0] if nums else ""

                station_results[st_name]["raw_prizes"].extend(nums)

    db_date = datetime.datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")
    records = []

    for name, res_data in station_results.items():
        st_id = STATION_MAP.get(name)
        if st_id and res_data["raw_prizes"]:
            lo_numbers = extract_2d_lo(res_data["raw_prizes"])
            special_val = str(res_data["special"]) if res_data["special"] else ""
            records.append({
                "station_id": st_id,
                "draw_date": db_date,
                "special_prize": special_val,
                "seventh_or_eighth": res_data["g8"],
                "lo_numbers": lo_numbers
            })
    return records

# ==================== 3. LƯU & DỌN DẸP SUPABASE ====================
def get_existing_count(station_id):
    url = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id"
    try:
        res = requests.get(url, headers=HEADERS_SUPABASE, timeout=10)
        if res.status_code == 200 and isinstance(res.json(), list):
            return len(res.json())
        else:
            print(f"⚠️ Kiểm tra đài {station_id}: HTTP {res.status_code} - {res.text[:100]}")
    except Exception as e:
        print(f"❌ Lỗi kiểm tra đài {station_id}: {e}")
    return 0

def save_to_supabase(data):
    if not data:
        return
    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date"
    try:
        resp = requests.post(endpoint, json=data, headers=HEADERS_SUPABASE, timeout=10)
        if resp.status_code in (200, 201):
            print(f"✅ Đã lưu thành công đài {data['station_id']} ngày {data['draw_date']}")
        else:
            print(f"❌ Lỗi lưu Supabase [{data['station_id']}]: Mã {resp.status_code} - {resp.text[:150]}")
    except Exception as e:
        print(f"❌ Lỗi kết nối Supabase [{data['station_id']}]: {e}")

def clean_rolling_50(station_id):
    url = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id&order=draw_date.desc&offset=50"
    try:
        res = requests.get(url, headers=HEADERS_SUPABASE, timeout=10).json()
        if res and isinstance(res, list) and len(res) > 0:
            old_ids = [str(row['id']) for row in res]
            delete_url = f"{SUPABASE_URL}/rest/v1/draw_results?id=in.({','.join(old_ids)})"
            requests.delete(delete_url, headers=HEADERS_SUPABASE, timeout=10)
            print(f"🧹 Đã dọn dẹp {len(old_ids)} kỳ cũ của đài {station_id}.")
    except Exception as e:
        print(f"Lỗi dọn dẹp đài {station_id}: {e}")

# ==================== 4. CHƯƠNG TRÌNH CHÍNH ====================
if __name__ == '__main__':
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    today_str = today.strftime("%d-%m-%Y")
    
    print(f"🚀 Bắt đầu tiến trình cào dữ liệu xổ số tự động ngày {today_str}...")

    # 1. Cào Miền Bắc
    mb_count = get_existing_count("MB")
    if mb_count < 50:
        print(f"🔄 Đài MB mới có {mb_count}/50 kỳ. Đang nạp đủ 50 kỳ lịch sử...")
        for i in range(50):
            d_str = (today - datetime.timedelta(days=i)).strftime("%d-%m-%Y")
            item = scrape_minhngoc_mb(d_str)
            if item:
                save_to_supabase(item)
            time.sleep(0.15)
        clean_rolling_50("MB")
    else:
        print(f"✅ Đài MB đã đủ 50 kỳ. Cào bổ sung hôm nay ({today_str})...")
        item = scrape_minhngoc_mb(today_str)
        if item:
            save_to_supabase(item)
            clean_rolling_50("MB")

    # 2. Cào Miền Nam & Miền Trung (quét lùi 120 ngày để nạp đủ 50 kỳ cho tất cả các đài)
    print(f"🌐 Đang cào dữ liệu cho Miền Nam & Miền Trung...")
    for i in range(120):
        d_str = (today - datetime.timedelta(days=i)).strftime("%d-%m-%Y")
        
        mn_items = scrape_minhngoc_mn_mt("mien-nam", d_str)
        for item in mn_items:
            save_to_supabase(item)
            clean_rolling_50(item["station_id"])

        mt_items = scrape_minhngoc_mn_mt("mien-trung", d_str)
        for item in mt_items:
            save_to_supabase(item)
            clean_rolling_50(item["station_id"])
            
        time.sleep(0.15)

    print("🎉 Hoàn tất quá trình cào và dọn dẹp 50 kỳ cuốn chiếu!")
