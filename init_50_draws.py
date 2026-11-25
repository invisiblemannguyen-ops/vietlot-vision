import os
import re
import time
import datetime
import requests
from bs4 import BeautifulSoup

# ==================== 1. CẤU HÌNH KẾT NỐI SUPABASE ====================
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY or '',
    'Authorization': f'Bearer {SUPABASE_KEY or ""}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}

# ==================== 2. MẢNG ÁNH CHIẾU TÊN ĐÀI KQXS.VN ====================
STATION_MAP = {
    # Miền Nam
    "TP. HCM": "TPHCM", "TP.HCM": "TPHCM", "TPHCM": "TPHCM", "HỒ CHÍ MINH": "TPHCM", "HO CHI MINH": "TPHCM",
    "ĐỒNG THÁP": "DONGTHAP", "DONG THAP": "DONGTHAP", "CÀ MAU": "CAMAU", "CA MAU": "CAMAU",
    "BẾN TRE": "BENTRE", "BEN TRE": "BENTRE", "VŨNG TÀU": "VUNGTAU", "VUNG TAU": "VUNGTAU", "BẠC LIÊU": "BACLIEU", "BAC LIEU": "BACLIEU",
    "ĐỒNG NAI": "DONGNAI", "DONG NAI": "DONGNAI", "CẦN THƠ": "CANTHO", "CAN THO": "CANTHO", "SÓC TRĂNG": "SOCTRANG", "SOC TRANG": "SOCTRANG",
    "TÂY NINH": "TAYNINH", "TAY NINH": "TAYNINH", "AN GIANG": "ANGIANG", "BÌNH THUẬN": "BINHTHUAN", "BINH THUAN": "BINHTHUAN",
    "VĨNH LONG": "VINHLONG", "VINH LONG": "VINHLONG", "BÌNH DƯƠNG": "BINHDUONG", "BINH DUONG": "BINHDUONG", "TRÀ VINH": "TRAVINH", "TRA VINH": "TRAVINH",
    "LONG AN": "LONGAN", "LONG AN": "LONGAN", "BÌNH PHƯỚC": "BINHPHUOC", "BINH PHUOC": "BINHPHUOC", "HẬU GIANG": "HAUGIANG", "HAU GIANG": "HAUGIANG",
    "TIỀN GIANG": "TIENGIANG", "TIEN GIANG": "TIENGIANG", "KIÊN GIANG": "KIENGIANG", "KIEN GIANG": "KIENGIANG", "ĐÀ LẠT": "DALAT", "DA LAT": "DALAT", "LÂM ĐỒNG": "DALAT",
    # Miền Trung
    "THỪA THIÊN HUẾ": "TTHUE", "T.T.HUẾ": "TTHUE", "T.T. HUẾ": "TTHUE", "THUA THIEN HUE": "TTHUE", "HUẾ": "TTHUE", "TTHUẾ": "TTHUE",
    "PHÚ YÊN": "PHUYEN", "PHU YEN": "PHUYEN", "ĐẮK LẮK": "DAKLAK", "ĐẮC LẮC": "DAKLAK", "DAK LAK": "DAKLAK", "QUẢNG NAM": "QUANGNAM", "QUANG NAM": "QUANGNAM",
    "ĐÀ NẴNG": "DANANG", "DA NANG": "DANANG", "KHÁNH HÒA": "KHANHHOA", "KHANH HOA": "KHANHHOA", "BÌNH ĐỊNH": "BINHDINH", "BINH DINH": "BINHDINH",
    "QUẢNG TRỊ": "QUANGTRI", "QUANG TRI": "QUANGTRI", "QUẢNG BÌNH": "QUANGBINH", "QUANG BINH": "QUANGBINH", "GIA LAI": "GIALAI", "NINH THUẬN": "NINHTHUAN", "NINH THUAN": "NINHTHUAN",
    "QUẢNG NGÃI": "QUANGNGAI", "QUANG NGAI": "QUANGNGAI", "ĐẮK NÔNG": "DAKNONG", "ĐẮC NÔNG": "DAKNONG", "DAK NONG": "DAKNONG", "KON TUM": "KONTUM",
    # Miền Bắc
    "MIỀN BẮC": "MB", "MB": "MB"
}

def get_station_id(cell_text):
    if not cell_text:
        return None
    clean = re.sub(r'\s+', ' ', str(cell_text).strip()).upper()
    if any(w in clean for w in ['MIỀN NAM', 'MIỀN TRUNG', 'KẾT QUẢ', 'LỊCH SỬ']):
        return None

    clean_core = re.sub(r'^(XS|XỔ SỐ|XO SO|KQXS)\s+', '', clean)
    clean_core_no_dot = clean_core.replace('.', '').strip()

    if clean_core in STATION_MAP:
        return STATION_MAP[clean_core]
    for k, v in STATION_MAP.items():
        if k.upper() == clean_core or k.replace('.', '').upper() == clean_core_no_dot:
            return v

    for k, v in sorted(STATION_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        if k.upper() in clean_core:
            return v

    return None

# ==================== 3. CHỐNG BOT KQXS.VN ====================
def fetch_kqxs_html(path_url):
    proto = "https"
    domain = "kqxs.vn"
    full_url = f"{proto}://{domain}{path_url}"
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

# ==================== 4. LƯU SUPABASE (LƯU ĐẦY ĐỦ CÁC GIẢI) ====================
def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ LỖI: Thiếu biến môi trường SUPABASE!")
        return False

    sp_raw = data.get("special_prize", "")
    sp_str = str(sp_raw).strip()[-3:] if str(sp_raw).strip() else ""

    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": sp_str,
        "all_prizes": {
            "special_prize": sp_str,
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "prizes_by_tier": data.get("prizes_tier", {}),
            "raw_prizes": data.get("raw_prizes", []),
            "lo_numbers": data.get("lo_numbers", [])
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date"
    try:
        resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=15)
        if resp.status_code in (200, 201, 204, 409):
            print(f"  ✅ [LƯU THÀNH CÔNG] Đài: {payload['station_id']} | Ngày: {payload['draw_date']} | ĐB (3D): '{sp_str}' | Đủ {len(data.get('raw_prizes', []))} giải 3D | Đủ {len(data.get('lo_numbers', []))} lô 2D")
            return True
        else:
            print(f"  ❌ [LỖI LƯU SUPABASE] Đài {payload['station_id']}: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ [EXCEPT LƯU] Đài {payload['station_id']}: {e}")
        return False

# ==================== 5. PARSER MIỀN BẮC (CHUẨN 27 GIẢI) ====================
def parse_mb(html, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if not tables:
        return None

    box_table = None
    for t in tables:
        if t.find(string=re.compile(r'Đặc biệt|GĐB|Giải 1|G1', re.I)):
            box_table = t
            break
    if not box_table:
        box_table = tables[0]

    prizes_3d = []
    lo_2d = []
    special_prize_3d = ""
    g7_list = []
    prizes_tier = {}

    for tr in box_table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) >= 2:
            label = tds[0].get_text(separator=' ').strip()
            label_upper = label.upper()
            
            # Bỏ qua dòng Mã đặc biệt / Ký hiệu
            if any(k in label_upper for k in ['KÝ HIỆU', 'MÃ ĐB', 'MÃ ĐẶC BIỆT', 'MÃ']):
                continue

            nums_raw = []
            for td in tds[1:]:
                nums_raw.extend(re.findall(r'\d+', td.get_text(separator=' ')))
            if not nums_raw:
                continue

            nums_valid = [n for n in nums_raw if len(n) >= 2]
            nums_3d = [n[-3:] for n in nums_valid]
            nums_2d = [n[-2:] for n in nums_valid]

            prizes_tier[label] = nums_3d

            if re.search(r'ĐB|Đặc biệt|GĐB', label, re.I):
                special_prize_3d = nums_3d[0] if nums_3d else ""
            elif re.search(r'G7|Giải 7|Giải Bảy', label, re.I):
                g7_list.extend(nums_3d)

            prizes_3d.extend(nums_3d)
            lo_2d.extend(nums_2d)

    if not prizes_3d:
        return None

    return {
        "station_id": "MB",
        "draw_date": db_date,
        "special_prize": special_prize_3d,
        "seventh_or_eighth": g7_list,
        "lo_numbers": lo_2d,
        "raw_prizes": prizes_3d,
        "prizes_tier": prizes_tier
    }

# ==================== 6. PARSER MIỀN NAM & TRUNG (BỎ CHỌN NHẦM BẢNG, CHUẨN 18 GIẢI/ĐÀI) ====================
def parse_mn_mt(html, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if not tables:
        return []

    target_table = None
    col_stations = {}

    # Quét tất cả các bảng để tìm bảng có số cột đài nhiều nhất
    for t in tables:
        rows = t.find_all('tr')
        best_row_stations = {}
        for r in rows:
            cells = r.find_all(['td', 'th'])
            if len(cells) <= 1:
                continue
            row_map = {}
            for idx, cell in enumerate(cells):
                txt = cell.get_text(separator=' ').strip()
                st_id = get_station_id(txt)
                if st_id:
                    row_map[idx] = st_id
            if len(row_map) > len(best_row_stations):
                best_row_stations = row_map
        if len(best_row_stations) > len(col_stations):
            col_stations = best_row_stations
            target_table = t

    if not target_table or not col_stations:
        return []

    rows = target_table.find_all('tr')
    st_data = {
        st_id: {
            "special_prize": "",
            "g8_3d": [],
            "prizes_tier": {},
            "prizes_3d": [],
            "lo_2d": []
        } for st_id in col_stations.values()
    }

    for row in rows:
        tds = row.find_all(['td', 'th'])
        if len(tds) <= 1:
            continue

        prize_label = tds[0].get_text(separator=' ').strip()
        label_upper = prize_label.upper()

        if not any(k in label_upper for k in ['G.8', 'G.7', 'G.6', 'G.5', 'G.4', 'G.3', 'G.2', 'G.1', 'G8', 'G7', 'G6', 'G5', 'G4', 'G3', 'G2', 'G1', 'ĐB', 'GIẢI', 'ĐẶC BIỆT']):
            continue
        if any(ignore in label_upper for ignore in ['ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'MÃ', 'KÝ HIỆU']):
            continue

        for idx in range(1, len(tds)):
            if idx in col_stations:
                st_id = col_stations[idx]
                td = tds[idx]
                nums_raw = re.findall(r'\d+', td.get_text(separator=' '))
                if not nums_raw:
                    continue

                nums_3d = [n[-3:] for n in nums_raw if len(n) >= 2]
                nums_2d = [n[-2:] for n in nums_raw if len(n) >= 2]

                st_data[st_id]["prizes_tier"][prize_label] = nums_3d

                if any(k in label_upper for k in ['G8', 'G.8', 'GIẢI 8', 'GIẢI TÁM']):
                    st_data[st_id]["g8_3d"].extend(nums_3d)
                elif any(k in label_upper for k in ['ĐB', 'ĐẶC BIỆT']):
                    st_data[st_id]["special_prize"] = nums_3d[0] if nums_3d else ""

                st_data[st_id]["prizes_3d"].extend(nums_3d)
                st_data[st_id]["lo_2d"].extend(nums_2d)

    records = []
    for st_id, data in st_data.items():
        if data["prizes_3d"]:
            records.append({
                "station_id": st_id,
                "draw_date": db_date,
                "special_prize": data["special_prize"],
                "seventh_or_eighth": data["g8_3d"],
                "lo_numbers": data["lo_2d"],
                "raw_prizes": data["prizes_3d"],
                "prizes_tier": data["prizes_tier"]
            })
    return records

# ==================== MAIN CÀO KẾT QUẢ HÔM NAY ====================
if __name__ == '__main__':
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    d_str = today.strftime("%d-%m-%Y")
    db_date = today.strftime("%Y-%m-%d")

    print(f"🚀 [CÀO HÔM NAY] Bắt đầu cào kết quả ngày HÔM NAY ({d_str}) cho tất cả các đài...")
    total_saved = 0
    saved_stations = []

    # 1. Miền Bắc
    html_mb = fetch_kqxs_html(f"/mien-bac?date={d_str}")
    if html_mb:
        rec_mb = parse_mb(html_mb, db_date)
        if rec_mb and save_to_supabase(rec_mb):
            total_saved += 1
            saved_stations.append("MB")

    # 2. Miền Nam
    html_mn = fetch_kqxs_html(f"/mien-nam?date={d_str}")
    if html_mn:
        recs_mn = parse_mn_mt(html_mn, db_date)
        for rec in recs_mn:
            if save_to_supabase(rec):
                total_saved += 1
                saved_stations.append(rec["station_id"])

    # 3. Miền Trung
    html_mt = fetch_kqxs_html(f"/mien-trung?date={d_str}")
    if html_mt:
        recs_mt = parse_mn_mt(html_mt, db_date)
        for rec in recs_mt:
            if save_to_supabase(rec):
                total_saved += 1
                saved_stations.append(rec["station_id"])

    print(f"\n🎉 [HOÀN TẤT CÀO HÔM NAY] Đã lưu thành công {total_saved} đài: {', '.join(saved_stations)}")
    if total_saved == 0:
        raise RuntimeError("❌ LỖI: Không cào được đài nào hôm nay!")
