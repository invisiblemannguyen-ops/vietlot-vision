import os
import re
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

# ==================== 2. MẢNG ÁNH CHIẾU ĐÀI ====================
STATION_MAP = {
    # Miền Nam
    'TP. HCM': 'TPHCM', 'TP.HCM': 'TPHCM', 'TPHCM': 'TPHCM', 'HỒ CHÍ MINH': 'TPHCM',
    'ĐỒNG THÁP': 'DONGTHAP', 'CÀ MAU': 'CAMAU', 'BẾN TRE': 'BENTRE', 'VŨNG TÀU': 'VUNGTAU', 'BẠC LIÊU': 'BACLIEU',
    'ĐỒNG NAI': 'DONGNAI', 'CẦN THƠ': 'CANTHO', 'SÓC TRĂNG': 'SOCTRANG', 'TÂY NINH': 'TAYNINH', 'AN GIANG': 'ANGIANG',
    'BÌNH THUẬN': 'BINHTHUAN', 'VĨNH LONG': 'VINHLONG', 'BÌNH DƯƠNG': 'BINHDUONG', 'TRÀ VINH': 'TRAVINH',
    'LONG AN': 'LONGAN', 'BÌNH PHƯỚC': 'BINHPHUOC', 'HẬU GIANG': 'HAUGIANG', 'TIỀN GIANG': 'TIENGIANG',
    'KIÊN GIANG': 'KIENGIANG', 'ĐÀ LẠT': 'DALAT', 'LÂM ĐỒNG': 'DALAT',
    # Miền Trung
    'THỪA THIÊN HUẾ': 'TTHUE', 'T.T.HUẾ': 'TTHUE', 'HUẾ': 'TTHUE', 'PHÚ YÊN': 'PHUYEN', 'ĐẮK LẮK': 'DAKLAK', 'ĐẮC LẮC': 'DAKLAK',
    'QUẢNG NAM': 'QUANGNAM', 'ĐÀ NẴNG': 'DANANG', 'KHÁNH HÒA': 'KHANHHOA', 'BÌNH ĐỊNH': 'BINHDINH', 'QUẢNG TRỊ': 'QUANGTRI',
    'QUẢNG BÌNH': 'QUANGBINH', 'GIA LAI': 'GIALAI', 'NINH THUẬN': 'NINHTHUAN', 'QUẢNG NGÃI': 'QUANGNGAI',
    'ĐẮK NÔNG': 'DAKNONG', 'KON TUM': 'KONTUM',
    # Miền Bắc
    'MIỀN BẮC': 'MB', 'MB': 'MB'
}

def get_station_id(cell_text):
    if not cell_text:
        return None
    clean = re.sub(r'\s+', ' ', str(cell_text).strip()).upper()
    if len(clean) > 30 or any(kw in clean for kw in ['KẾT QUẢ', 'MIỀN NAM', 'MIỀN TRUNG', 'THỨ', 'NGÀY', 'LỊCH SỬ', 'BẢNG']):
        return None
    clean_core = re.sub(r'^(XS|XỔ SỐ|XO SO|KQXS)\s+', '', clean).strip()
    return STATION_MAP.get(clean_core) or STATION_MAP.get(clean)

def fetch_kqxs_html(path_url):
    domain = "kqxs.vn"
    full_url = f"https://{domain}{path_url}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9'
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

def format_prize_number(raw_str):
    clean = re.sub(r'\D', '', str(raw_str))
    if len(clean) >= 3:
        return clean[-3:]
    elif len(clean) == 2:
        return clean[-2:]
    return clean

# ==================== 3. LƯU SUPABASE GỌN GÀNG ====================
def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ LỖI: Thiếu cấu hình môi trường SUPABASE!")
        return False

    raw_prizes = data.get("raw_prizes", [])
    lo_numbers = [p[-2:] for p in raw_prizes if len(p) >= 2]
    
    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": data["special_prize"],
        "all_prizes": {
            "special_prize": data["special_prize"],
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": raw_prizes, # Mảng 18 giải (MN/MT) hoặc 27 giải (MB)
            "lo_numbers": lo_numbers   # Mảng 18 hoặc 27 lô 2D
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date"
    try:
        resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=15)
        if resp.status_code in (200, 201, 204, 409):
            print(f"  ✅ [LUU THANH CONG] Bai: {payload['station_id']} | Ngay: {payload['draw_date']} | BB (3D): '{data['special_prize']}' | Du {len(raw_prizes)} giai")
            return True
        else:
            print(f"  ❌ [LỖI LƯU SUPABASE] Đài {payload['station_id']}: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ [EXCEPT LƯU] Đài {payload['station_id']}: {e}")
        return False

# ==================== 4. PARSER MIỀN BẮC ====================
def parse_mb(html, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    box_table = None
    for t in tables:
        if t.find(string=re.compile(r'Đặc biệt|GĐB|Giải 1|G1', re.I)):
            box_table = t
            break
    if not box_table:
        return None

    raw_prizes = []
    special_prize = ""
    g7_list = []

    for tr in box_table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) >= 2:
            label = tds[0].get_text(separator=' ').strip().upper()
            if any(k in label for k in ['KÝ HIỆU', 'MÃ ĐB', 'MÃ']):
                continue

            nums_raw = []
            for td in tds[1:]:
                nums_raw.extend(re.findall(r'\d+', td.get_text(separator=' ')))

            formatted_nums = [format_prize_number(n) for n in nums_raw if len(n) >= 2]
            if not formatted_nums:
                continue

            if re.search(r'ĐB|ĐẶC BIỆT', label):
                special_prize = formatted_nums[0] if formatted_nums else ""
            elif re.search(r'G7|GIẢI 7', label):
                g7_list.extend(formatted_nums)

            raw_prizes.extend(formatted_nums)

    if not raw_prizes:
        return None

    return {
        "station_id": "MB",
        "draw_date": db_date,
        "special_prize": special_prize,
        "seventh_or_eighth": g7_list,
        "raw_prizes": raw_prizes
    }

# ==================== 5. PARSER MIỀN NAM & TRUNG (QUÉT NGANG CỘT) ====================
def parse_mn_mt(html, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if not tables:
        return []

    target_table = None
    col_stations = {}

    for t in tables:
        rows = t.find_all('tr')
        best_row_map = {}
        for r in rows:
            cells = r.find_all(['td', 'th'])
            if len(cells) <= 1:
                continue
            row_map = {}
            for idx, cell in enumerate(cells):
                # Bỏ qua ô banner tiêu đề gộp
                if int(cell.get('colspan', 1)) > 1:
                    continue
                txt = cell.get_text(separator=' ').strip()
                st_id = get_station_id(txt)
                if st_id:
                    row_map[idx] = st_id
            if len(row_map) > len(best_row_map):
                best_row_map = row_map
        if len(best_row_map) > len(col_stations):
            col_stations = best_row_map
            target_table = t

    if not target_table or not col_stations:
        return []

    rows = target_table.find_all('tr')
    st_data = {st_id: {"special_prize": "", "g8": [], "raw_prizes": []} for st_id in col_stations.values()}

    for row in rows:
        tds = row.find_all(['td', 'th'])
        if len(tds) <= 1:
            continue

        label_upper = tds[0].get_text(separator=' ').strip().upper()
        if not any(k in label_upper for k in ['G.', 'G8', 'G7', 'G6', 'G5', 'G4', 'G3', 'G2', 'G1', 'ĐB', 'GIẢI', 'ĐẶC BIỆT']):
            continue

        # Quét ngang từng ô theo cột đài đã ánh xạ
        for col_idx, st_id in col_stations.items():
            if col_idx < len(tds):
                td = tds[col_idx]
                nums_raw = re.findall(r'\d+', td.get_text(separator=' '))
                if not nums_raw:
                    continue

                formatted_nums = [format_prize_number(n) for n in nums_raw if len(n) >= 2]

                if any(k in label_upper for k in ['G8', 'G.8', 'TÁM']):
                    st_data[st_id]["g8"].extend(formatted_nums)
                elif any(k in label_upper for k in ['ĐB', 'ĐẶC BIỆT']):
                    if formatted_nums:
                        st_data[st_id]["special_prize"] = formatted_nums[0]

                st_data[st_id]["raw_prizes"].extend(formatted_nums)

    records = []
    for st_id, data in st_data.items():
        if data["raw_prizes"]:
            records.append({
                "station_id": st_id,
                "draw_date": db_date,
                "special_prize": data["special_prize"],
                "seventh_or_eighth": data["g8"],
                "raw_prizes": data["raw_prizes"]
            })
    return records

# ==================== MAIN CÀO KẾT QUẢ HÔM NAY ====================
if __name__ == '__main__':
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    d_str = today.strftime("%d-%m-%Y")
    db_date = today.strftime("%Y-%m-%d")

    print(f"🚀 [CAO HOM NAY - KQXS.VN] Bat dau cao ket qua ngay HOM NAY ({d_str})...")
    total_saved = 0

    # 1. Miền Bắc
    html_mb = fetch_kqxs_html(f"/mien-bac?date={d_str}")
    if html_mb:
        item_mb = parse_mb(html_mb, db_date)
        if item_mb and save_to_supabase(item_mb):
            total_saved += 1

    # 2. Miền Nam
    html_mn = fetch_kqxs_html(f"/mien-nam?date={d_str}")
    if html_mn:
        mn_items = parse_mn_mt(html_mn, db_date)
        for item in mn_items:
            if save_to_supabase(item):
                total_saved += 1

    # 3. Miền Trung
    html_mt = fetch_kqxs_html(f"/mien-trung?date={d_str}")
    if html_mt:
        mt_items = parse_mn_mt(html_mt, db_date)
        for item in mt_items:
            if save_to_supabase(item):
                total_saved += 1

    print(f"\n🎉 [HOAN TAT KQXS.VN] Da luu thanh cong {total_saved} dai doc lap vao Supabase!")
    if total_saved == 0:
        raise RuntimeError("❌ LỖI: Không cào được đài nào hôm nay từ kqxs.vn!")
