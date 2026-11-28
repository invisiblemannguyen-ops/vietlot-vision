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
    """Số >= 3 chữ số lấy 3D. Giải 7 (2 chữ số) giữ nguyên 2D."""
    clean = re.sub(r'\D', '', str(raw_str))
    if len(clean) >= 3:
        return clean[-3:]
    elif len(clean) == 2:
        return clean[-2:]
    return clean

def delete_old_mb_record(db_date):
    """Xóa dữ liệu MB cũ ngày chỉ định trên Supabase trước khi cào mới."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.MB&draw_date=eq.{db_date}"
    try:
        res = requests.delete(endpoint, headers=HEADERS_SUPABASE, timeout=12)
        if res.status_code in (200, 204):
            print(f"  🧹 Đã xóa bản ghi MB cũ ngày {db_date} trên Supabase.")
    except Exception as e:
        print(f"  ⚠️ Lỗi khi xóa bản ghi MB ngày {db_date}: {e}")

def fetch_kqxs_html(path_url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9'
    }
    for domain in ["www.kqxs.vn", "kqxs.vn"]:
        full_url = f"https://{domain}{path_url}"
        if cffi_requests:
            try:
                res = cffi_requests.get(full_url, headers=headers, impersonate="chrome120", timeout=12)
                if res.status_code == 200 and res.text:
                    return res.text
            except Exception:
                pass
        try:
            res = requests.get(full_url, headers=headers, timeout=12)
            if res.status_code == 200 and res.text:
                return res.text
        except Exception:
            pass
    return None

def parse_mb(html, db_date):
    if not html:
        return None
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    box_table = None

    for t in tables:
        txt = t.get_text().upper()
        if any(k in txt for k in ['ĐẶC BIỆT', 'GĐB', 'GIẢI ĐẶC BIỆT']) and any(k in txt for k in ['GIẢI NHẤT', 'G1', 'GIẢI 1', 'GIẢI 7', 'G7', 'G.7', 'GIẢI BẢY']):
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
            if any(k in label for k in ['KÝ HIỆU', 'MÃ ĐB', 'MÃ DB', 'MÃ ĐẶC BIỆT', 'MÃ', 'ĐẦU', 'ĐUÔI', 'LÔ', 'LOTO', 'THỐNG KÊ']):
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
            elif re.search(r'G7|GIẢI 7|G\.7|GIẢI BẢY|BẢY', label):
                g7_list.extend(formatted_nums)

            raw_prizes.extend(formatted_nums)

    if len(raw_prizes) < 27:
        all_nums = re.findall(r'\d+', box_table.get_text(separator=' '))
        valid_nums = [format_prize_number(n) for n in all_nums if 2 <= len(n) <= 6]
        if len(valid_nums) >= 27:
            raw_prizes = valid_nums[:27]
            special_prize = raw_prizes[0]
            g7_list = raw_prizes[-4:]

    if not raw_prizes or len(raw_prizes) < 27:
        return None

    return {
        "station_id": "MB",
        "draw_date": db_date,
        "special_prize": special_prize,
        "seventh_or_eighth": g7_list,
        "raw_prizes": raw_prizes[:27]
    }

def process_date(d_str, db_date):
    print(f"\n📌 [CÀO BÙ] Miền Bắc ngày {d_str} ({db_date})...")
    
    # 1. Xóa bản ghi cũ bị lỗi
    delete_old_mb_record(db_date)

    # 2. Thử các đường dẫn chứa kết quả ngày (Bao gồm link https://www.kqxs.vn/ngay-27-11-2026)
    candidate_paths = [
        f"/mien-bac/ngay-{d_str}",
        f"/ngay-{d_str}",
        f"/xo-so-mien-bac/ngay-{d_str}",
        f"/mien-bac?date={d_str}",
        f"/mien-bac"
    ]

    html = None
    used_path = ""
    for path_url in candidate_paths:
        html = fetch_kqxs_html(path_url)
        if html:
            used_path = path_url
            break

    if not html:
        print(f"❌ Không tải được HTML cho ngày {d_str}")
        return False

    # 3. Phân tích kết quả
    data = parse_mb(html, db_date)
    if not data:
        print(f"❌ Parser lỗi: Không quét đủ 27 giải Miền Bắc ngày {d_str}!")
        return False

    # 4. Đóng gói payload ĐÚNG CHUẨN Supabase (lo_numbers nằm GỌN TRONG all_prizes)
    raw_prizes = data.get("raw_prizes", [])
    payload = {
        "station_id": data["station_id"],
        "draw_date": data["draw_date"],
        "special_prize": str(data["special_prize"]).strip(),
        "all_prizes": {
            "special_prize": str(data["special_prize"]).strip(),
            "seventh_or_eighth": data.get("seventh_or_eighth", []),
            "raw_prizes": raw_prizes,
            "lo_numbers": [p[-2:] for p in raw_prizes if len(p) >= 2]
        }
    }

    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date"
    try:
        resp = requests.post(endpoint, json=payload, headers=HEADERS_SUPABASE, timeout=12)
        if resp.status_code in (200, 201, 204):
            print(f"  ✅ [THÀNH CÔNG] Đã lưu MB ngày {db_date}! URL: {used_path} | ĐB: '{data['special_prize']}' | Đủ 27 giải.")
            return True
        else:
            print(f"  ❌ [LỖI SUPABASE] {resp.status_code}: {resp.text}")
            return False
    except Exception as e:
        print(f"  ❌ [LỖI KẾT NỐI] {e}")
        return False

def main():
    print("🚀 [BẮT ĐẦU CÀO BÙ MIỀN BẮC] Cho 2 ngày 26/11/2026 & 27/11/2026")
    dates_to_backfill = [
        ("26-11-2026", "2026-11-26"),
        ("27-11-2026", "2026-11-27"),
    ]
    
    success_count = 0
    for d_str, db_date in dates_to_backfill:
        if process_date(d_str, db_date):
            success_count += 1

    print(f"\n🎉 [HOÀN TẤT CÀO BÙ] Đã xử lý xong {success_count}/{len(dates_to_backfill)} ngày Miền Bắc!")

if __name__ == '__main__':
    main()
