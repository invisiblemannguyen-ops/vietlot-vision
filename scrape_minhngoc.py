import os
import re
import sys
import time
import datetime
import random
import unicodedata
import requests

try:
    from curl_cffi import requests as cffi_requests  # Giả lập TLS / Chrome 120 thực tế
    HAS_CURL_CFFI = True
except ImportError:
    HAS_CURL_CFFI = False

from bs4 import BeautifulSoup

# ===========================================================================
# CẤU HÌNH: Đọc từ biến môi trường (GitHub Secrets / Environment)
# ===========================================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY", "")
BACKFILL = os.environ.get("BACKFILL", "").lower() == "true"

HEADERS_SUPABASE = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

KQSX = "https://kqsx.vn"
MINHNGOC = "https://www.minhngoc.net.vn"

STATION_MAP = {
    # Miền Nam
    "TP. HCM": "TPHCM", "TP.HCM": "TPHCM", "TPHCM": "TPHCM", "TP Hồ Chí Minh": "TPHCM",
    "Đồng Tháp": "DONGTHAP", "Cà Mau": "CAMAU",
    "Bến Tre": "BENTRE", "Vũng Tàu": "VUNGTAU", "Bạc Liêu": "BACLIEU",
    "Đồng Nai": "DONGNAI", "Cần Thơ": "CANTHO", "Sóc Trăng": "SOCTRANG",
    "Tây Ninh": "TAYNINH", "An Giang": "ANGIANG", "Bình Thuận": "BINHTHUAN",
    "Vĩnh Long": "VINHLONG", "Bình Dương": "BINHDUONG", "Trà Vinh": "TRAVINH",
    "Long An": "LONGAN", "Bình Phước": "BINHPHUOC", "Hậu Giang": "HAUGIANG",
    "Tiền Giang": "TIENGIANG", "Kiên Giang": "KIENGIANG", "Đà Lạt": "DALAT",
    # Miền Trung
    "Thừa Thiên Huế": "TTHUE", "T.T.Huế": "TTHUE", "Phú Yên": "PHUYEN", "Đắc Lắc": "DAKLAK",
    "Đắk Lắk": "DAKLAK", "Quảng Nam": "QUANGNAM", "Đà Nẵng": "DANANG", "Khánh Hòa": "KHANHHOA",
    "Bình Định": "BINHDINH", "Quảng Trị": "QUANGTRI", "Quảng Bình": "QUANGBINH",
    "Gia Lai": "GIALAI", "Ninh Thuận": "NINHTHUAN", "Quảng Ngãi": "QUANGNGAI",
    "Đắc Nông": "DAKNONG", "Đắk Nông": "DAKNONG", "Kon Tum": "KONTUM",
}


# ==================== TIỆN ÍCH ====================
def extract_2d_lo(prizes_raw):
    """Lấy 2 số cuối của tất cả các giải."""
    out = []
    for p in prizes_raw:
        clean_p = re.sub(r"\D", "", str(p))
        if len(clean_p) >= 2:
            out.append(clean_p[-2:])
    return out


def split_numbers(text):
    return [re.sub(r"\D", "", n) for n in text.split("-") if re.sub(r"\D", "", n)]


HEADERS_WEB = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.5",
}
SESSION = requests.Session()
SESSION.headers.update(HEADERS_WEB)

# ---- CƠ CHẾ CHỐNG CHẶN ----
MAX_RETRIES = 2                                  # Thử lại mỗi trang
JITTER = (0.8, 1.6) if BACKFILL else (2.0, 4.0)  # Nghỉ ngẫu nhiên giữa các request (giây)
MAX_FAIL = 6                                     # 6 trang liên tiếp lỗi => coi là bị chặn

fail_streak = {}
dead_sources = set()


def jitter():
    time.sleep(round(random.uniform(*JITTER), 2))


def http_get(url):
    """Ưu tiên curl_cffi (giả lập Chrome 120), không có thì dùng requests thường."""
    if HAS_CURL_CFFI:
        return cffi_requests.get(url, headers=HEADERS_WEB, impersonate="chrome120", timeout=15)
    return SESSION.get(url, timeout=15)


def source_alive(source):
    return source not in dead_sources


def fetch(url, source):
    """Tải trang có retry + jitter. Trả về HTML hoặc None. Tự bỏ nguồn nếu liên tục bị chặn."""
    reason, is_404 = "?", False
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = http_get(url)
            if r.status_code == 200:
                fail_streak[source] = 0
                jitter()
                return r.text
            reason = f"HTTP {r.status_code}"
            if r.status_code == 404:
                is_404 = True  # Trang không tồn tại (không phải bị chặn), khỏi thử lại
                break
        except Exception as e:
            reason = type(e).__name__
        if attempt < MAX_RETRIES:
            jitter()
    if not is_404:
        fail_streak[source] = fail_streak.get(source, 0) + 1
        if fail_streak[source] <= 3:
            print(f"⚠️ [{source}] {reason}: {url}")
        if fail_streak[source] >= MAX_FAIL and source not in dead_sources:
            dead_sources.add(source)
            print(f"🚫 Bỏ nguồn {source}: {MAX_FAIL} trang liên tiếp không tải được (có thể bị chặn IP).")
    jitter()
    return None


# ==================== NGUỒN 1: KQSX.VN ====================
LABELS = {"G8", "G7", "G6", "G5", "G4", "G3", "G2", "G1", "ĐB", "DB"}
MN_MT_EXPECTED = {"G8": 1, "G7": 1, "G6": 3, "G5": 1, "G4": 7, "G3": 2, "G2": 1, "G1": 1, "ĐB": 1}
MB_ORDER = ["ĐB", "G1", "G2", "G3", "G4", "G5", "G6", "G7"]
MB_COUNTS = [1, 1, 2, 6, 4, 6, 3, 4]
REGION_WORD = {"mb": "Bắc", "mt": "Trung", "mn": "Nam"}


def kqsx_lines(html):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style"]):
        t.decompose()
    text = soup.get_text("\n", strip=True)
    return [unicodedata.normalize("NFC", l.strip()) for l in text.split("\n") if l.strip()]


def parse_kqsx(html, region, date_str):
    """Đọc trang https://kqsx.vn/ket-qua-ngay/xs{mb|mt|mn}-DD-MM-YYYY.
    Chỉ nhận khi đủ số lượng giải (MB 27 giải, MN/MT 18 giải/đài)."""
    lines = kqsx_lines(html)
    date_pattern = date_str.replace('-', r'[-/]')
    pat = re.compile(rf"Xổ số\s+miền\s+{REGION_WORD[region]}.*?{date_pattern}", re.I)
    start = next((i for i, l in enumerate(lines) if pat.search(l)), None)
    if start is None:
        pat_fallback = re.compile(rf"miền\s+{REGION_WORD[region]}.*?{date_pattern}", re.I)
        start = next((i for i, l in enumerate(lines) if pat_fallback.search(l)), None)

    if start is None:
        return []

    data, names, cur = {}, [], None
    for l in lines[start + 1:]:
        if l.startswith("Đầy đủ"):
            break
        if l in LABELS:
            cur = "ĐB" if l in ("ĐB", "DB") else l
            data.setdefault(cur, [])
            continue
        if cur is None:
            if l in STATION_MAP:
                names.append(l)
            continue
        if re.fullmatch(r"[\d\s,\-–]+", l):
            data[cur].extend(re.findall(r"\d+", l))

    db_date = datetime.datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")

    if region == "mb":
        for k, c in zip(MB_ORDER, MB_COUNTS):
            if len(data.get(k, [])) != c:
                return []
        allp = [n for k in MB_ORDER for n in data[k]]
        return [{
            "station_id": "MB",
            "draw_date": db_date,
            "special_prize": data["ĐB"][0],
            "seventh_or_eighth": data["G7"],
            "lo_numbers": extract_2d_lo(allp),
        }]

    n = len(names)
    if n == 0:
        return []
    for k, c in MN_MT_EXPECTED.items():
        if len(data.get(k, [])) != c * n:
            return []  # Chưa quay xong hoặc cấu trúc trang khác
    records = []
    for si, name in enumerate(names):
        st_id = STATION_MAP.get(name)
        if not st_id:
            print(f"⚠️ Chưa có trong STATION_MAP: '{name}'")
            continue
        per = {k: data[k][si::n] for k in MN_MT_EXPECTED}  # Bảng xếp theo hàng
        allp = [x for k in MN_MT_EXPECTED for x in per[k]]
        records.append({
            "station_id": st_id,
            "draw_date": db_date,
            "special_prize": per["ĐB"][0],
            "seventh_or_eighth": per["G8"],
            "lo_numbers": extract_2d_lo(allp),
        })
    return records


def kqsx_day(region, date_str):
    html = fetch(f"{KQSX}/ket-qua-ngay/xs{region}-{date_str}", "kqsx")
    return parse_kqsx(html, region, date_str) if html else []


# ==================== NGUỒN 2 (DỰ PHÒNG): MINHNGOC ====================
def parse_minhngoc_mb(html, date_str):
    soup = BeautifulSoup(html, "html.parser")
    box = soup.find("table", class_="bkqtmb")
    if not box:
        return []
    prizes_raw, special = [], ""
    gdb = box.find("td", class_="gdb")
    if gdb:
        special = re.sub(r"\D", "", gdb.text.strip())
        if special:
            prizes_raw.append(special)
    g7 = []
    for td in box.find_all("td"):
        classes = td.get("class", [])
        if "g7" in classes:
            g7.extend(split_numbers(td.text))
        elif any(c in classes for c in ["g1", "g2", "g3", "g4", "g5", "g6"]):
            prizes_raw.extend(split_numbers(td.text))
    prizes_raw.extend(g7)
    if not special or not prizes_raw:
        return []
    db_date = datetime.datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")
    return [{
        "station_id": "MB",
        "draw_date": db_date,
        "special_prize": special,
        "seventh_or_eighth": g7,
        "lo_numbers": extract_2d_lo(prizes_raw)
    }]


def parse_minhngoc_mn_mt(html, date_str):
    soup = BeautifulSoup(html, "html.parser")
    box = soup.find("table", class_=re.compile(r"bkqtmiennam|bkqtmientrung"))
    if not box:
        return []
    header = box.find("tr", class_="header")
    if not header:
        return []
    names = [td.text.strip() for td in header.find_all("td") if td.text.strip()]
    res = {n: {"special": "", "g8": [], "raw": []} for n in names}
    for row in box.find_all("tr"):
        tds = row.find_all("td")
        if len(tds) <= 1:
            continue
        prize = tds[0].text.strip()
        for idx, td in enumerate(tds[1:]):
            if idx >= len(names):
                continue
            nums = split_numbers(td.text)
            if not nums:
                continue
            if prize in ["G.8", "Giải 8", "Giải Tám"]:
                res[names[idx]]["g8"].extend(nums)
            elif prize in ["ĐB", "Giải ĐB", "Giải Đặc Biệt"]:
                res[names[idx]]["special"] = nums[0]
            res[names[idx]]["raw"].extend(nums)
    db_date = datetime.datetime.strptime(date_str, "%d-%m-%Y").strftime("%Y-%m-%d")
    out = []
    for name, d in res.items():
        st_id = STATION_MAP.get(name)
        if st_id and d["raw"] and d["special"]:
            out.append({
                "station_id": st_id,
                "draw_date": db_date,
                "special_prize": d["special"],
                "seventh_or_eighth": d["g8"],
                "lo_numbers": extract_2d_lo(d["raw"])
            })
    return out


def minhngoc_day(region, date_str):
    if region == "mb":
        url = f"{MINHNGOC}/ket-qua-xo-so/ket-qua-xoso-mien-bac/{date_str}.html"
    else:
        url = f"{MINHNGOC}/ket-qua-xo-so/{'mien-nam' if region == 'mn' else 'mien-trung'}/{date_str}.html"
    html = fetch(url, "minhngoc")
    if not html:
        return []
    return parse_minhngoc_mb(html, date_str) if region == "mb" else parse_minhngoc_mn_mt(html, date_str)


def get_day(region, date_str):
    """Thử kqsx.vn trước, không được thì dùng minhngoc."""
    if source_alive("kqsx"):
        recs = kqsx_day(region, date_str)
        if recs:
            return recs
    if source_alive("minhngoc"):
        return minhngoc_day(region, date_str)
    return []


# ==================== LƯU & DỌN DẸP SUPABASE ====================
def save_to_supabase(data):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print(f"⚠️ Chưa cấu hình SUPABASE_URL hoặc SUPABASE_KEY. Bỏ qua lưu đài {data.get('station_id')}")
        return False
    endpoint = f"{SUPABASE_URL}/rest/v1/draw_results?on_conflict=station_id,draw_date"
    try:
        resp = requests.post(endpoint, json=data, headers=HEADERS_SUPABASE, timeout=10)
        if resp.status_code in (200, 201, 204):
            print(f"✅ Đã lưu {data['station_id']} ngày {data['draw_date']}")
            return True
        print(f"❌ Lỗi lưu [{data['station_id']}]: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"❌ Lỗi kết nối Supabase [{data['station_id']}]: {e}")
    return False


def clean_rolling_50(station_id):
    """Giữ đúng 50 kỳ mới nhất của mỗi đài."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    url = (f"{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}"
           f"&select=id&order=draw_date.desc&offset=50")
    try:
        res = requests.get(url, headers=HEADERS_SUPABASE, timeout=10).json()
        if res and isinstance(res, list) and len(res) > 0:
            old_ids = [str(r["id"]) for r in res]
            requests.delete(f"{SUPABASE_URL}/rest/v1/draw_results?id=in.({','.join(old_ids)})",
                            headers=HEADERS_SUPABASE, timeout=10)
            print(f"🧹 Dọn {len(old_ids)} kỳ cũ của đài {station_id}")
    except Exception as e:
        print(f"Lỗi dọn dẹp đài {station_id}: {e}")


# ==================== CHƯƠNG TRÌNH CHÍNH ====================
if __name__ == "__main__":
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    print(f"🚀 Bắt đầu cào {today:%d-%m-%Y} (backfill={BACKFILL}, curl_cffi={HAS_CURL_CFFI})")

    # Chạy thường: hôm nay + hôm qua. Backfill: nạp đủ lịch sử.
    mb_days = 50 if BACKFILL else 2
    mnmt_days = 350 if BACKFILL else 2  # Mỗi đài MN/MT ~1 kỳ/tuần => 50 kỳ ≈ 350 ngày

    saved, touched = 0, set()

    for i in range(mb_days):
        d = (today - datetime.timedelta(days=i)).strftime("%d-%m-%Y")
        for rec in get_day("mb", d):
            if save_to_supabase(rec):
                saved += 1
                touched.add(rec["station_id"])
        if not source_alive("kqsx") and not source_alive("minhngoc"):
            break

    for i in range(mnmt_days):
        if not source_alive("kqsx") and not source_alive("minhngoc"):
            break
        d = (today - datetime.timedelta(days=i)).strftime("%d-%m-%Y")
        for region in ("mn", "mt"):
            for rec in get_day(region, d):
                if save_to_supabase(rec):
                    saved += 1
                    touched.add(rec["station_id"])

    for sid in touched:
        clean_rolling_50(sid)

    print(f"🎉 Xong. Đã lưu {saved} bản ghi, {len(touched)} đài.")

    # Báo ĐỎ trên GitHub khi cào hỏng, thay vì báo xanh giả
    if not source_alive("kqsx") and not source_alive("minhngoc"):
        print("❌ Cả 2 nguồn đều không tải được.")
        sys.exit(1)
    if BACKFILL and saved == 0:
        print("❌ Backfill nhưng không lưu được bản ghi nào.")
        sys.exit(1)
