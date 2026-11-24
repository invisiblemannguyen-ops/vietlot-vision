import os
import re
import time
import datetime
import json
import requests
from bs4 import BeautifulSoup

# Lấy thông tin cấu hình từ GitHub Secrets
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}

# Ánh chiếu tên đài sang station_id chuẩn trong Supabase
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
    "Quảng Ngãi": "QUANGNGAI", "Đắc Nông": "DAKNONG", "Đắk Nông": "DAKNONG", "Kon Tum": "KONTUM"
}

def extract_2d_lo(prizes_raw):
    """Trích xuất 2 số cuối của tất cả các giải"""
    lo_set = []
    for p in prizes_raw:
        clean_p = re.sub(r'\D', '', str(p))
        if len(clean_p) >= 2:
            lo_set.append(clean_p[-2:])
    return lo_set

def fetch_html(url):
    """Tải HTML qua curl_cffi để tránh bị Anti-bot/Cloudflare chặn"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    try:
        from curl_cffi import requests as cffi_requests
        res = cffi_requests.get(url, headers=headers, impersonate="chrome120", timeout=15)
        if res.status_code == 200:
            return res.text
        print(f"⚠️ curl_cffi HTTP {res.status_code} từ {url}")
    except Exception as e:
        print(f"⚠️ Lỗi curl_cffi khi tải {url}: {e}")
    
    try:
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code == 200:
            return res.text
        print(f"⚠️ requests HTTP {res.status_code} từ {url}")
    except Exception as e:
        print(f"⚠️ Lỗi requests fallback: {e}")
    return None

# ==================== 1. CÀO MIỀN BẮC ====================
def scrape_kqxs_mb(date_str):
    url_kqxs = f"[suspicious link removed]{date_str}"
    print(f"🔄 Đang cào MB từ: {url_kqxs}")
    html = fetch_html(url_kqxs)

    prizes_raw = []
    special_prize = ""
    g7_numbers = []

    if html:
        soup = BeautifulSoup(html, 'html.parser')
        box_table = soup.find('table', class_=re.compile(r'table|box-kqxs|kqxs|bkqtmb', re.I))
        if box_table:
            for tr in box_table.find_all('tr'):
                tds = tr.find_all(['td', 'th'])
                if len(tds) >= 2:
                    label = tds[0].text.strip()
                    nums = [re.sub(r'\D', '', n) for n in tds[1].text.split('-') if re.sub(r'\D', '', n)]
                    if re.search(r'ĐB|Đặc biệt|GĐB', label, re.I) and nums:
                        special_prize = nums[0]
                    if re.search(r'G7|Giải 7|Giải Bảy', label, re.I):
                        g7_numbers.extend(nums)
                    prizes_raw.extend(nums)

    # Fallback sang minhngoc.net.vn nếu kqxs.vn trống
    if not prizes_raw:
        url_mn = f"[suspicious link removed]{date_str}.html"
        print(f"🔄 Fallback cào MB từ Minh Ngọc: {url_mn}")
        html_mn = fetch_html(url_mn)
        if html_mn:
            soup = BeautifulSoup(html_mn, 'html.parser')
            box_table = soup.find('table', class_='bkqtmb')
            if box_table:
                gdb_cell = box_table.find('td', class_='gdb')
                if gdb_cell:
                    special_prize = re.sub(r'\D', '', gdb_cell.text.strip())
                    prizes_raw.append(special_prize)
                for td in box_table.find_all('td'):
                    classes = td.get('class', [])
                    if 'g7' in classes:
                        nums = [re.sub(r'\D', '', n) for n in td.text.split('-') if re.sub(r'\D', '', n)]
                        g7_numbers.extend(nums)
                        prizes_raw.extend(nums)
                    elif any(c in classes for c in ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']):
                        nums = [re.sub(r'\D', '', n) for n in td.text.split('-') if re.sub(r'\D', '', n)]
                        prizes_raw.extend(nums)

    if not prizes_raw:
        print(f"❌ KHÔNG BÓC TÁCH ĐƯỢC DỮ LIỆU MB NGÀY {date_str}")
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

# ==================== 2. CÀO MIỀN NAM & MIỀN TRUNG ====================
def scrape_kqxs_mn_mt(region_code, date_str):
    url_kqxs = f"[suspicious link removed]{region_code}-{date_str}"
    print(f"🌐 Đang cào {region_code.upper()} từ: {url_kqxs}")
    html = fetch_html(url_kqxs)

    records = []
    db_date = datetime.datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")

    if html:
        soup = BeautifulSoup(html, 'html.parser')
        box_table = soup.find('table', class_=re.compile(r'table|box-kqxs|kqxs|bkqtmiennam|bkqtmientrung', re.I))
        if box_table:
            header_row = box_table.find('tr', class_=re.compile(r'header|head', re.I)) or box_table.find('tr')
            if header_row:
                station_names = [td.text.strip() for td in header_row.find_all(['td', 'th']) if td.text.strip()]
                station_results = {name: {"special": "", "g8": [], "raw_prizes": []} for name in station_names}

                for row in box_table.find_all('tr'):
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
                            if re.search(r'G8|Giải 8|Giải Tám', prize_name, re.I):
                                station_results[st_name]["g8"].extend(nums)
                            elif re.search(r'ĐB|Giải ĐB|Giải Đặc Biệt', prize_name, re.I):
                                station_results[st_name]["special"] = nums[0] if nums else ""
                            station_results[st_name]["raw_prizes"].extend(nums)

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

    # Fallback sang minhngoc nếu kqxs.vn trống
    if not records:
        region_mn_name = "mien-nam" if region_code == "mn" else "mien-trung"
        url_mn = f"https://www.minhngoc.net.vn/ket-qua-xo-so/{region_mn_name}/{date_str}.html"
        print(f"🔄 Fallback cào {region_code.upper()} từ Minh Ngọc: {url_mn}")
        html_mn = fetch_html(url_mn)
        if html_mn:
            soup = BeautifulSoup(html_mn, 'html.parser')
            box_table = soup.find('table', class_=re.compile(r'bkqtmiennam|bkqtmientrung'))
            if box_table:
                header_row = box_table.find('tr', class_='header')
                if header_row:
                    station_names = [td.text.strip() for td in header_row.find_all('td') if td.text.strip()]
                    station_results = {name: {"special": "", "g8": [], "raw_prizes": []} for name in station_names}
                    for row in box_table.find_all('tr'):
                        tds = row.find_all('td')
                        if len(tds) <= 1:
                            continue
                        prize_name = tds[0].text.strip()
                        for idx, td in enumerate(tds[1:]):
                            if idx < len(station_names):
                                st_name = station_names[idx]
                                nums = [re.sub(r'\D', '', n) for n in td.text.split('-') if re.sub(r'\D', '', n)]
                                if not nums:
                                    continue
                                if prize_name in ['G.8', 'Giải 8', 'Giải Tám']:
                                    station_results[st_name]["g8"].extend(nums)
                                elif prize_name in ['ĐB', 'Giải ĐB', 'Giải Đặc Biệt']:
                                    station_results[st_name]["special"] = nums[0] if nums else ""
                                station_results[st_name]["raw_prizes"].extend(nums)

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
    if not SUPABASE_URL or not SUPABASE_KEY:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id"
    try:
        res = requests.get(url, headers=HEADERS_SUPABASE, timeout=15)
        if res.status_code == 200 and isinstance(res.json(), list):
            return len(res.json())
    except Exception:
        pass
    return 0

def save_to_supabase(data):
    if not data:
        return False
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ LỖI: Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY!")
        raise Exception("Thiếu biến môi trường Supabase")

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
            "g8": data.get("seventh_or_eighth", []),
            "raw_prizes": data.get("raw_prizes", [])
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results"
    resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=15)
    if resp.status_code in (200, 201):
        print(f"✅ ĐÃ LƯU THÀNH CÔNG SUPABASE: Đài {payload['station_id']} | Ngày {payload['draw_date']}")
        return True
    else:
        print(f"❌ LỖI LƯU SUPABASE [{payload['station_id']}]: HTTP {resp.status_code} - {resp.text}")
        raise Exception(f"Lỗi lưu Supabase [{payload['station_id']}]: HTTP {resp.status_code} - {resp.text}")

def clean_rolling_50(station_id):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    url = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id&order=draw_date.desc&offset=50"
    try:
        res = requests.get(url, headers=HEADERS_SUPABASE, timeout=15).json()
        if res and isinstance(res, list) and len(res) > 0:
            old_ids = [str(row['id']) for row in res]
            delete_url = f"{SUPABASE_URL}/rest/v1/draw_results?id=in.({','.join(old_ids)})"
            requests.delete(delete_url, headers=HEADERS_SUPABASE, timeout=15)
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
                save_to_supabase(item)
                total_saved += 1
            time.sleep(0.3)
        clean_rolling_50("MB")
    else:
        print(f"✅ Đài MB đã đủ 50 kỳ. Cào bổ sung hôm nay ({today_str})...")
        item = scrape_kqxs_mb(today_str)
        if item:
            save_to_supabase(item)
            total_saved += 1
            clean_rolling_50("MB")

    # 2. Cào Miền Nam & Miền Trung
    print(f"🌐 Đang cào Miền Nam & Miền Trung ngày {today_str}...")
    mn_items = scrape_kqxs_mn_mt("mn", today_str)
    for item in mn_items:
        save_to_supabase(item)
        total_saved += 1
        clean_rolling_50(item["station_id"])

    mt_items = scrape_kqxs_mn_mt("mt", today_str)
    for item in mt_items:
        save_to_supabase(item)
        total_saved += 1
        clean_rolling_50(item["station_id"])

    if total_saved == 0:
        print("❌ LỖI: Không cào được hoặc không lưu được bất kỳ bản ghi nào vào Supabase!")
        raise Exception("Không lưu được bản ghi nào vào Supabase!")

    print(f"🎉 Hoàn tất quá trình! Đã lưu tổng cộng {total_saved} bản ghi vào Supabase.")
