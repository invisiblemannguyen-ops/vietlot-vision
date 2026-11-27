import os
import re
import requests
from bs4 import BeautifulSoup

try:
    from curl_cffi import requests as cffi_requests
except Exception:
    cffi_requests = None

# ==================== 1. CẤU HÌNH SUPABASE ====================
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY or '',
    'Authorization': f'Bearer {SUPABASE_KEY or ""}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

def format_prize_number(raw_str):
    """Số >= 3 chữ số cắt lấy 3D. Giải 7 (2 chữ số) giữ 2D."""
    clean = re.sub(r'\D', '', str(raw_str))
    if len(clean) >= 3:
        return clean[-3:]
    elif len(clean) == 2:
        return clean[-2:]
    return clean

def fetch_html(url_path):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9'
    }
    for domain in ["www.kqxs.vn", "kqxs.vn"]:
        full_url = f"https://{domain}{url_path}"
        if cffi_requests:
            try:
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

def parse_mb_26(html):
    if not html:
        return None
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
            if any(k in label for k in ['KÝ HIỆU', 'MÃ ĐB', 'MÃ', 'ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO']):
                continue

            nums_raw = []
            for td in tds[1:]:
                nums_raw.extend(re.findall(r'\d+', td.get_text(separator=' ')))

            formatted_nums = [format_prize_number(n) for n in nums_raw if len(n) >= 2]
            if not formatted_nums:
                continue

            if re.search(r'ĐB|ĐẶC BIỆT', label):
                if formatted_nums:
                    special_prize = formatted_nums[0]
            elif re.search(r'G7|GIẢI 7', label):
                g7_list.extend(formatted_nums)

            raw_prizes.extend(formatted_nums)

    if len(raw_prizes) < 27:
        return None

    return {
        "station_id": "MB",
        "draw_date": "2026-11-26",
        "special_prize": special_prize,
        "seventh_or_eighth": g7_list,
        "raw_prizes": raw_prizes[:27]
    }

def run_backfill():
    print("🚀 [CÀO BÙ MB 26/11/2026] Bắt đầu cào dữ liệu...")
    url_path = "/mien-bac/ngay-26-11-2026"
    html = fetch_html(url_path)
    if not html:
        print("❌ Không tải được HTML từ kqxs.vn")
        return

    data = parse_mb_26(html)
    if not data:
        print("❌ Lỗi parser: Không tìm thấy đủ 27 giải Miền Bắc!")
        return

    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": str(data["special_prize"]).strip(),
        "all_prizes": {
            "special_prize": str(data["special_prize"]).strip(),
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": data["raw_prizes"],
            "lo_numbers": [p[-2:] for p in data["raw_prizes"] if len(p) >= 2]
        }
    }

    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date",
            json=payload,
            headers=HEADERS_SUPABASE,
            timeout=15
        )
        if resp.status_code in (200, 201, 204):
            print(f"🎉 [THÀNH CÔNG] Đã cào bù xong Miền Bắc ngày 26/11/2026! ĐB: '{data['special_prize']}' | Đủ 27 giải.")
        else:
            print(f"❌ [LỖI SUPABASE] {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"❌ [LỖI KẾT NỐI] {e}")

if __name__ == '__main__':
    run_backfill()
