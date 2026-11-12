import os
import re
import time
import datetime
import requests
from bs4 import BeautifulSoup

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}

def extract_2d_lo(prizes_raw):
    """Trích xuất mảng 2 số cuối từ danh sách tất cả các giải (Lô 2D)"""
    lo_set = []
    for p in prizes_raw:
        clean_p = re.sub(r'\D', '', str(p))
        if len(clean_p) >= 2:
            lo_set.append(clean_p[-2:])
    return lo_set

def scrape_minhngoc_mb(date_str):
    domain = "www.minhngoc.net.vn"
    path = "/ket-qua-xo-so/ket-qua-xoso-mien-bac/"
    url = f"https://{domain}{path}{date_str}.html"

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code != 200:
            return None

        soup = BeautifulSoup(res.text, 'html.parser')
        box_table = soup.find('table', class_='bkqtmb')
        if not box_table:
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
            "special_prize": special_prize,
            "seventh_or_eighth": g7_numbers, # Giải 7 MB
            "lo_numbers": lo_numbers         # Mảng 2 số cuối cho thuật toán Decay
        }
    except Exception as e:
        print(f"❌ Lỗi khi cào ngày {date_str}: {e}")
        return None

def get_existing_count(station_id="MB"):
    url = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id"
    try:
        res = requests.get(url, headers=HEADERS_SUPABASE)
        if res.status_code == 200 and isinstance(res.json(), list):
            return len(res.json())
    except Exception:
        pass
    return 0

def save_to_supabase(data):
    if not data:
        return
    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results"
    resp = requests.post(endpoint, json=data, headers=HEADERS_SUPABASE)
    if resp.status_code in (200, 201):
        print(f"✅ Đã lưu thành công đài {data['station_id']} ngày {data['draw_date']}")
    else:
        print(f"❌ Lỗi lưu Supabase: {resp.status_code} - {resp.text}")

def clean_rolling_50(station_id="MB"):
    url = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id&order=draw_date.desc&offset=50"
    try:
        res = requests.get(url, headers=HEADERS_SUPABASE).json()
        if res and isinstance(res, list) and len(res) > 0:
            old_ids = [str(row['id']) for row in res]
            delete_url = f"{SUPABASE_URL}/rest/v1/draw_results?id=in.({','.join(old_ids)})"
            requests.delete(delete_url, headers=HEADERS_SUPABASE)
            print(f"🧹 Đã dọn dẹp {len(old_ids)} kỳ cũ.")
    except Exception as e:
        print(f"Lỗi dọn dẹp: {e}")

if __name__ == '__main__':
    count = get_existing_count("MB")
    print(f"📊 Số kỳ hiện có trong Supabase đài MB: {count}/50")

    if count < 50:
        print(f"🚀 Bắt đầu tự động cào 50 kỳ gần nhất cho MB...")
        today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
        for i in range(50):
            target_date = today - datetime.timedelta(days=i)
            date_str = target_date.strftime("%d-%m-%Y")
            print(f"[{i+1}/50] Đang cào ngày {date_str}...")
            data = scrape_minhngoc_mb(date_str)
            if data:
                save_to_supabase(data)
            time.sleep(0.3)
        clean_rolling_50("MB")
        print("🎉 Đã nạp xong 50 kỳ cho đài MB!")
    else:
        today_str = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime("%d-%m-%Y")
        print(f"🚀 Đã có đủ 50 kỳ. Đang cào bổ sung ngày {today_str}...")
        data = scrape_minhngoc_mb(today_str)
        if data:
            save_to_supabase(data)
            clean_rolling_50("MB")
