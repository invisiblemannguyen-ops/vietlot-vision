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

# ==================== 1. CÀO MIỀN BẮC ====================
def scrape_kqxs_mb(date_str):
    url = f"kqxs.vn{date_str}"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code != 200:
            return None

        soup = BeautifulSoup(res.text, 'html.parser')
        box_table = soup.find('table', class_=re.compile(r'table-kqxs|bkqtmb|box-kqxs', re.I))
        if not box_table:
            return None

        prizes_raw = []
        special_prize = ""
        
        # Bóc tách số giải
        for tr in box_table.find_all('tr'):
            tds = tr.find_all(['td', 'th'])
            if len(tds) >= 2:
                label = tds[0].text.strip()
                nums = [re.sub(r'\D', '', n) for n in tds[1].text.split('-') if n.strip().isdigit()]
                if re.search(r'ĐB|Đặc biệt', label, re.I) and nums:
                    special_prize = nums[0]
                prizes_raw.extend(nums)

        if not prizes_raw:
            return None

        db_date = datetime.datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")
        lo_numbers = extract_2d_lo(prizes_raw)

        return {
            "station_id": "MB",
            "draw_date": db_date,
            "special_prize": special_prize,
            "lo_numbers": lo_numbers
        }
    except Exception as e:
        print(f"❌ Lỗi cào MB ngày {date_str}: {e}")
        return None

# ==================== 2. LƯU & DỌN DẸP SUPABASE ====================
def save_to_supabase(data):
    if not data or not SUPABASE_URL:
        return
    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results"
    resp = requests.post(endpoint, json=data, headers=HEADERS_SUPABASE)
    if resp.status_code in (200, 201):
        print(f"✅ Đã lưu thành công đài {data['station_id']} ngày {data['draw_date']}")
    else:
        print(f"❌ Lỗi lưu Supabase [{data['station_id']}]: {resp.status_code} - {resp.text}")

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

# ==================== 3. THỰC THI ====================
if __name__ == '__main__':
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    today_str = today.strftime("%d-%m-%Y")
    
    print(f"🚀 Bắt đầu cào dữ liệu xổ số ngày {today_str}...")
    mb_data = scrape_kqxs_mb(today_str)
    if mb_data:
        save_to_supabase(mb_data)
        clean_rolling_50(mb_data['station_id'])
