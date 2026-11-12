import datetime
import os
import re
import time
from bs4 import BeautifulSoup
import requests

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

HEADERS_SUPABASE = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}


def parse_digit_positions(prize_str):
  """Bóc tách chữ số thành 3 vị trí: Trăm, Chục, Đơn vị"""
  p = re.sub(r'\D', '', str(prize_str))
  if len(p) < 2:
    return None
  if len(p) == 2:
    return {'raw': p, 'hundreds': None, 'tens': p, 'ones': p}
  last_3 = p[-3:]
  return {'raw': p, 'hundreds': last_3, 'tens': last_3, 'ones': last_3}


def scrape_minhngoc_mb(date_str):
base_url = "https:" + "//www.minhngoc.net.vn/ket-qua-xo-so/ket-qua-xoso-mien-bac/"
    url = f"{base_url}{date_str}.html"
  headers = {
      'User-Agent': (
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      )
  }
  try:
    res = requests.get(url, headers=headers, timeout=15)
    if res.status_code != 200:
      return None

    soup = BeautifulSoup(res.text, 'html.parser')
    box_table = soup.find('table', class_='bkqtmb')
    if not box_table:
      return None

    prizes_raw = []
    gdb_cell = box_table.find('td', class_='gdb')
    if gdb_cell:
      prizes_raw.append(gdb_cell.text.strip())

    for td in box_table.find_all('td'):
      classes = td.get('class', [])
      if any(c in classes for c in ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']):
        nums = [n.strip() for n in td.text.split('-') if n.strip().isdigit()]
        prizes_raw.extend(nums)

    if not prizes_raw:
      return None

    parsed_prizes = [
        parse_digit_positions(p)
        for p in prizes_raw
        if parse_digit_positions(p)
    ]
    db_date = datetime.datetime.strptime(date_str, '%d-%m-%Y').strftime(
        '%Y-%m-%d'
    )

    return {
        'station_id': 'MB',
        'draw_date': db_date,
        'special_prize': prizes_raw[0] if prizes_raw else '',
        'all_prizes': parsed_prizes,
    }
  except Exception as e:
    print(f'❌ Lỗi khi cào ngày {date_str}: {e}')
    return None


def get_existing_count(station_id='MB'):
  """Đếm số kỳ hiện có trong Supabase"""
  url = f'{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id'
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
  endpoint = f'{SUPABASE_URL}/rest/v1/draw_results'
  resp = requests.post(endpoint, json=data, headers=HEADERS_SUPABASE)
  if resp.status_code in (200, 201):
    print(
        f"✅ Đã lưu thành công đài {data['station_id']} ngày {data['draw_date']}"
    )


def clean_rolling_50(station_id='MB'):
  """Duy trì đúng 50 kỳ gần nhất, xóa các kỳ cũ hơn"""
  url = f'{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id&order=draw_date.desc&offset=50'
  try:
    res = requests.get(url, headers=HEADERS_SUPABASE).json()
    if res and isinstance(res, list) and len(res) > 0:
      old_ids = [str(row['id']) for row in res]
      delete_url = (
          f"{SUPABASE_URL}/rest/v1/draw_results?id=in.({','.join(old_ids)})"
      )
      requests.delete(delete_url, headers=HEADERS_SUPABASE)
      print(f'🧹 Đã dọn dẹp {len(old_ids)} kỳ cũ.')
  except Exception as e:
    print(f'Lỗi dọn dẹp: {e}')


if __name__ == '__main__':
  count = get_existing_count('MB')
  print(f'📊 Số kỳ hiện có trong Supabase: {count}/50')

  # Nếu chưa đủ 50 kỳ -> Tự động cào 50 ngày quá khứ
  if count < 50:
    print(
        f'🚀 Chưa đủ 50 kỳ (hiện có {count}). Bắt đầu tự động cào 50 kỳ gần'
        ' nhất từ Minh Ngọc...'
    )
    today = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=7))
    )
    for i in range(50):
      target_date = today - datetime.timedelta(days=i)
      date_str = target_date.strftime('%d-%m-%Y')
      print(f'[{i+1}/50] Đang cào ngày {date_str}...')
      data = scrape_minhngoc_mb(date_str)
      if data:
        save_to_supabase(data)
      time.sleep(0.3)
    clean_rolling_50('MB')
    print('🎉 Đã nạp xong 50 kỳ vào Supabase!')
  else:
    # Đã đủ 50 kỳ -> Chỉ cào ngày hôm nay
    today_str = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=7))
    ).strftime('%d-%m-%Y')
    print(f'🚀 Đã có đủ 50 kỳ. Đang cào bổ sung ngày {today_str}...')
    data = scrape_minhngoc_mb(today_str)
    if data:
      save_to_supabase(data)
      clean_rolling_50('MB')
