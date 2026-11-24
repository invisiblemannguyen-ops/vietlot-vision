import os
import re
import time
import datetime
import requests
from bs4 import BeautifulSoup

# 1. Cấu hình kết nối Supabase
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY or '',
    'Authorization': f'Bearer {SUPABASE_KEY or ""}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}

# 2. Ánh chiếu tên đài sang station_id chuẩn trong Supabase
STATION_MAP = {
    # Miền Nam
    "TP. HCM": "TPHCM", "TP.HCM": "TPHCM", "TPHCM": "TPHCM", "Đồng Tháp": "DONGTHAP", "Cà Mau": "CAMAU",
    "Bến Tre": "BENTRE", "Vũng Tàu": "VUNGTAU", "Bạc Liêu": "BACLIEU",
    "Đồng Nai": "DONGNAI", "Cần Thơ": "CANTHO", "Sóc Trăng": "SOCTRANG",
    "Tây Ninh": "TAYNINH", "An Giang": "ANGIANG", "Bình Thuận": "BINHTHUAN",
    "Vĩnh Long": "VINHLONG", "Bình Dương": "BINHDUONG", "Trà Vinh": "TRAVINH",
    "Long An": "LONGAN", "Bình Phước": "BINHPHUOC", "Hậu Giang": "HAUGIANG",
    "Tiền Giang": "TIENGIANG", "Kiên Giang": "KIENGIANG", "Đà Lạt": "DALAT", "Lâm Đồng": "DALAT",
    # Miền Trung
    "Thừa Thiên Huế": "TTHUE", "T.T.Huế": "TTHUE", "TTHuế": "TTHUE", "Huế": "TTHUE",
    "Phú Yên": "PHUYEN", "Đắc Lắc": "DAKLAK", "Đắk Lắk": "DAKLAK", "Quảng Nam": "QUANGNAM",
    "Đà Nẵng": "DANANG", "Khánh Hòa": "KHANHHOA", "Bình Định": "BINHDINH", "Quảng Trị": "QUANGTRI",
    "Quảng Bình": "QUANGBINH", "Gia Lai": "GIALAI", "Ninh Thuận": "NINHTHUAN",
    "Quảng Ngãi": "QUANGNGAI", "Đắc Nông": "DAKNONG", "Đắk Nông": "DAKNONG", "Kon Tum": "KONTUM",
    # Miền Bắc
    "Miền Bắc": "MB", "MB": "MB"
}

def get_station_id(name):
    """Hàm tra cứu linh hoạt mã đài, bỏ qua dấu chấm và viết hoa/thường"""
    if not name:
        return None
    clean = re.sub(r'\s+', ' ', name.strip())
    if clean in STATION_MAP:
        return STATION_MAP[clean]
    clean_no_dot = clean.replace('.', '').lower()
    for k, v in STATION_MAP.items():
        if k.lower() == clean.lower() or k.replace('.', '').lower() == clean_no_dot:
            return v
    return None

def fetch_kqxs_html(path_url):
    """Giả lập Chrome chống BOT qua curl_cffi & requests"""
    proto = "https"
    domain = "kqxs.vn"
    full_url = f"{proto}://{domain}{path_url}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
    }

    try:
        from curl_cffi import requests as cffi_requests
        res = cffi_requests.get(full_url, headers=headers, impersonate="chrome120", timeout=15)
        if res.status_code == 200 and res.text:
            return res.text
    except Exception:
        pass

    try:
        res = requests.get(full_url, headers=headers, timeout=15)
        if res.status_code == 200 and res.text:
            return res.text
    except Exception:
        pass

    return None

def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ LỖI: Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY!")
        return False

    sp = data.get("special_prize", "")
    if isinstance(sp, list):
        sp = sp if len(sp) > 0 else ""
    else:
        sp = str(sp)

    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": sp,
        "all_prizes": {
            "special_prize": sp,
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "lo_numbers": data.get("lo_numbers", []),
            "raw_prizes": data.get("raw_prizes", [])
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results"
    resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=15)
    if resp.status_code in (200, 201):
        print(f"  ✅ [NẠP THÀNH CÔNG] Đài {payload['station_id']} | Ngày {payload['draw_date']}")
        return True
    else:
        print(f"  ❌ [LỖI LƯU] Đài {payload['station_id']}: {resp.status_code} - {resp.text}")
        return False

# ==================== PARSER MIỀN BẮC ====================
def parse_mb(html, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    box_table = soup.find('table', class_=re.compile(r'table|kqxs|box-kqxs', re.I))
    if not box_table:
        return None

    prizes_3d = []
    lo_2d = []
    special_3d = ""
    g7_list = []

    for tr in box_table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) >= 2:
            label = tds[0].text.strip()
            nums_raw = []
            for td in tds[1:]:
                nums_raw.extend(re.findall(r'\d+', td.text))
            
            if not nums_raw:
                continue

            nums_3d = [n[-3:] for n in nums_raw if len(n) >= 2]
            nums_2d = [n[-2:] for n in nums_raw if len(n) >= 2]

            if re.search(r'ĐB|Đặc biệt|GĐB', label, re.I):
                special_3d = nums_3d if nums_3d else ""
            elif re.search(r'G7|Giải 7|Giải Bảy', label, re.I):
                g7_list.extend(nums_3d)

            prizes_3d.extend(nums_3d)
            lo_2d.extend(nums_2d)

    if not prizes_3d:
        return None

    return {
        "station_id": "MB",
        "draw_date": db_date,
        "special_prize": special_3d,
        "seventh_or_eighth": g7_list,
        "lo_numbers": lo_2d,
        "raw_prizes": prizes_3d
    }

# ==================== PARSER MIỀN NAM & MIỀN TRUNG ====================
def parse_mn_mt(html, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    box_table = soup.find('table', class_=re.compile(r'table|kqxs|box-kqxs', re.I))
    if not box_table:
        return []

    header_row = box_table.find('tr', class_=re.compile(r'header|head', re.I)) or box_table.find('tr')
    if not header_row:
        return []

    # SỬA LỖI: Bỏ qua ô tiêu đề cột 1 [1:], chỉ lấy tên các đài từ cột 2 trở đi
    header_cells = header_row.find_all(['td', 'th'])
    if len(header_cells) <= 1:
        return []

    station_names = [re.sub(r'\s+', ' ', cell.text.strip()) for cell in header_cells[1:]]
    st_data = {name: {"special_3d": "", "g8_3d": [], "prizes_3d": [], "lo_2d": []} for name in station_names if name}

    for row in box_table.find_all('tr'):
        tds = row.find_all(['td', 'th'])
        if len(tds) <= 1:
            continue

        prize_label = tds[0].text.strip()

        for idx, td in enumerate(tds[1:]):
            if idx < len(station_names):
                st_name = station_names[idx]
                if not st_name or st_name not in st_data:
                    continue

                nums_raw = re.findall(r'\d+', td.text)
                if not nums_raw:
                    continue

                nums_3d = [n[-3:] for n in nums_raw if len(n) >= 2]
                nums_2d = [n[-2:] for n in nums_raw if len(n) >= 2]

                if re.search(r'G8|Giải 8|Giải Tám', prize_label, re.I):
                    st_data[st_name]["g8_3d"].extend(nums_3d)
                elif re.search(r'ĐB|Giải ĐB|Giải Đặc Biệt', prize_label, re.I):
                    st_data[st_name]["special_3d"] = nums_3d if nums_3d else ""

                st_data[st_name]["prizes_3d"].extend(nums_3d)
                st_data[st_name]["lo_2d"].extend(nums_2d)

    records = []
    for name, data in st_data.items():
        st_id = get_station_id(name)
        if st_id and data["prizes_3d"]:
            records.append({
                "station_id": st_id,
                "draw_date": db_date,
                "special_prize": data["special_3d"],
                "seventh_or_eighth": data["g8_3d"],
                "lo_numbers": data["lo_2d"],
                "raw_prizes": data["prizes_3d"]
            })
    return records

# ==================== MAIN INIT SCRIPT ====================
if __name__ == '__main__':
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    print("🚀 Bắt đầu khởi tạo dữ liệu 50 kỳ lịch sử cho TẤT CẢ các đài...")

    station_counts = {}
    total_saved = 0

    # Lùi tối đa 370 ngày (~53 tuần) để cào đủ 50 kỳ cho đài 1 tuần/lần
    for day_offset in range(370):
        current_date = today - datetime.timedelta(days=day_offset)
        d_str = current_date.strftime("%d-%m-%Y")
        db_date = current_date.strftime("%Y-%m-%d")

        # 1. Miền Bắc
        if station_counts.get("MB", 0) < 50:
            html_mb = fetch_kqxs_html(f"/mien-bac?date={d_str}")
            if html_mb:
                rec_mb = parse_mb(html_mb, db_date)
                if rec_mb and save_to_supabase(rec_mb):
                    station_counts["MB"] = station_counts.get("MB", 0) + 1
                    total_saved += 1

        # 2. Miền Nam
        html_mn = fetch_kqxs_html(f"/mien-nam?date={d_str}")
        if html_mn:
            recs_mn = parse_mn_mt(html_mn, db_date)
            for rec in recs_mn:
                st_id = rec["station_id"]
                if station_counts.get(st_id, 0) < 50:
                    if save_to_supabase(rec):
                        station_counts[st_id] = station_counts.get(st_id, 0) + 1
                        total_saved += 1

        # 3. Miền Trung
        html_mt = fetch_kqxs_html(f"/mien-trung?date={d_str}")
        if html_mt:
            recs_mt = parse_mn_mt(html_mt, db_date)
            for rec in recs_mt:
                st_id = rec["station_id"]
                if station_counts.get(st_id, 0) < 50:
                    if save_to_supabase(rec):
                        station_counts[st_id] = station_counts.get(st_id, 0) + 1
                        total_saved += 1

        if day_offset % 10 == 0:
            print(f"📊 Đã quét {day_offset} ngày lùi lịch | Tổng bản ghi đã lưu: {total_saved}")

        time.sleep(0.1)

    print(f"\n🎉 HOÀN TẤT NẠP DỮ LIỆU LỊCH SỬ! TỔNG CỘNG ĐÃ LƯU {total_saved} BẢN GHI.")
    for st, cnt in station_counts.items():
        print(f"  - Đài {st}: {cnt}/50 kỳ")

    if total_saved == 0:
        raise RuntimeError("❌ LỖI RẤT LỚN: Không cào hoặc lưu được bất kỳ bản ghi nào vào Supabase!")
