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
    "TÂY NINH": "TAYNINH", "TAY NINH": "TAYNINH", "AN GIANG": "ANGIANG", "AN GIANG": "ANGIANG", "BÌNH THUẬN": "BINHTHUAN", "BINH THUAN": "BINHTHUAN",
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

def get_station_id(name):
    if not name:
        return None
    clean = re.sub(r'\s+', ' ', str(name).strip()).upper()
    if clean in STATION_MAP:
        return STATION_MAP[clean]
    clean_no_dot = clean.replace('.', '').strip()
    for k, v in STATION_MAP.items():
        if k.upper() == clean or k.replace('.', '').upper() == clean_no_dot:
            return v
    for k, v in sorted(STATION_MAP.items(), key=lambda x: len(x[0]), reverse=True):
        k_clean = k.upper()
        if k_clean in clean or k_clean.replace('.', '') in clean_no_dot:
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

# ==================== 4. LƯU SUPABASE (HỖ TRỢ UPSERT CẬP NHẬT GHI ĐÈ) ====================
def save_to_supabase(data):
    if not data or not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ LỖI: Thiếu biến môi trường SUPABASE!")
        return False

    sp = data.get("special_prize", "")
    if isinstance(sp, list):
        sp_str = str(sp[0]).strip() if len(sp) > 0 else ""
    else:
        sp_str = str(sp).strip()

    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": sp_str,
        "all_prizes": {
            "special_prize": sp_str,
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "lo_numbers": data.get("lo_numbers", []),
            "raw_prizes": data.get("raw_prizes", [])
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date"
    try:
        resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=15)
        if resp.status_code in (200, 201, 204, 409):
            print(f"  ✅ [LƯU/CẬP NHẬT THÀNH CÔNG] Đài: {payload['station_id']} | Ngày: {payload['draw_date']} | ĐB: '{sp_str}' | Tổng số giải: {len(data.get('raw_prizes', []))} | Lô: {len(data.get('lo_numbers', []))} số")
            return True
        else:
            print(f"  ❌ [LỖI LƯU SUPABASE] Đài {payload['station_id']}: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ [EXCEPT LƯU] Đài {payload['station_id']}: {e}")
        return False

# ==================== 5. PARSER MIỀN BẮC (27 GIẢI) ====================
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
    special_prize = ""
    g7_list = []

    for tr in box_table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) >= 2:
            label = tds[0].get_text(separator=' ').strip()
            nums_raw = []
            for td in tds[1:]:
                nums_raw.extend(re.findall(r'\d+', td.get_text(separator=' ')))
            if not nums_raw:
                continue

            nums_3d = [n[-3:] for n in nums_raw if len(n) >= 2]
            nums_2d = [n[-2:] for n in nums_raw if len(n) >= 2]

            if re.search(r'ĐB|Đặc biệt|GĐB', label, re.I):
                special_prize = nums_raw[0] if nums_raw else ""
            elif re.search(r'G7|Giải 7|Giải Bảy', label, re.I):
                g7_list.extend(nums_3d)

            prizes_3d.extend(nums_3d)
            lo_2d.extend(nums_2d)

    if not prizes_3d:
        return None

    return {
        "station_id": "MB",
        "draw_date": db_date,
        "special_prize": special_prize,
        "seventh_or_eighth": g7_list,
        "lo_numbers": lo_2d,
        "raw_prizes": prizes_3d
    }

# ==================== 6. PARSER MIỀN NAM & TRUNG (18 GIẢI/ĐÀI) ====================
def parse_mn_mt(html, db_date):
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    if not tables:
        return []

    target_table = None
    col_stations = {}

    for t in tables:
        rows = t.find_all('tr')
        for r in rows[:4]:
            cells = r.find_all(['td', 'th'])
            for idx, cell in enumerate(cells):
                cell_txt = cell.get_text(separator=' ').strip()
                st_id = get_station_id(cell_txt)
                if st_id:
                    col_stations[idx] = st_id
            if col_stations:
                target_table = t
                break
        if target_table:
            break

    if not target_table or not col_stations:
        return []

    rows = target_table.find_all('tr')
    st_data = {st_id: {"special_prize": "", "g8_3d": [], "prizes_3d": [], "lo_2d": []} for st_id in col_stations.values()}

    for row in rows:
        tds = row.find_all(['td', 'th'])
        if len(tds) <= 1:
            continue

        prize_label = tds[0].get_text(separator=' ').strip()

        for idx in range(1, len(tds)):
            if idx in col_stations:
                st_id = col_stations[idx]
                td = tds[idx]
                nums_raw = re.findall(r'\d+', td.get_text(separator=' '))
                if not nums_raw:
                    continue

                nums_3d = [n[-3:] for n in nums_raw if len(n) >= 2]
                nums_2d = [n[-2:] for n in nums_raw if len(n) >= 2]

                if re.search(r'G8|Giải 8|Giải Tám', prize_label, re.I):
                    st_data[st_id]["g8_3d"].extend(nums_3d)
                elif re.search(r'ĐB|Giải ĐB|Giải Đặc Biệt', prize_label, re.I):
                    st_data[st_id]["special_prize"] = nums_raw[0] if nums_raw else ""

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
                "raw_prizes": data["prizes_3d"]
            })
    return records

# ==================== MAIN CÀO KẾT QUẢ HÔM NAY ====================
if __name__ == '__main__':
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    d_str = today.strftime("%d-%m-%Y")
    db_date = today.strftime("%Y-%m-%d")

    print(f"🚀 [CÀO HÔM NAY] Bắt đầu cào kết quả ngày HÔM NAY ({d_str}) cho toàn bộ các đài từ kqxs.vn...")
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

    print(f"\n🎉 [HOÀN TẤT CÀO HÔM NAY] Đã lưu/cập nhật thành công {total_saved} đài: {', '.join(saved_stations)}")
    if total_saved == 0:
        raise RuntimeError("❌ LỖI: Không cào được đài nào hôm nay từ kqxs.vn!")
