import datetime
import os
import re
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
  return {'raw': p, 'hundreds': last_3[0], 'tens': last_3[1], 'ones': last_3[2]}


def scrape_minhngoc_mb(date_str):
  url = f'[suspicious link removed]{date_str}.html'
  headers = {
      'User-Agent': (
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      )
  }
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


def clean_rolling_50(station_id):
  """Duy trì đúng 50 kỳ gần nhất, xóa kỳ cũ hơn"""
  url = f'{SUPABASE_URL}/rest/v1/draw_results?station_id=eq.{station_id}&select=id&order=draw_date.desc&offset=50'
  res = requests.get(url, headers=HEADERS_SUPABASE).json()
  if res and isinstance(res, list) and len(res) > 0:
    old_ids = [row['id'] for row in res]
    delete_url = (
        f"{SUPABASE_URL}/rest/v1/draw_results?id=in.({','.join(old_ids)})"
    )
    requests.delete(delete_url, headers=HEADERS_SUPABASE)


def save_to_supabase(data):
  if not data:
    return
  endpoint = f'{SUPABASE_URL}/rest/v1/draw_results'
  resp = requests.post(endpoint, json=data, headers=HEADERS_SUPABASE)
  if resp.status_code in [200, 201]:
    print(f"✅ Đã lưu thành công đài {data['station_id']} ngày {data['draw_date']}")
    clean_rolling_50(data['station_id'])


if __name__ == '__main__':
  today_str = datetime.datetime.now(
      datetime.timezone(datetime.timedelta(hours=7))
  ).strftime('%d-%m-%Y')
  print(f'🚀 Bắt đầu cào XSMB ngày {today_str}...')
  data = scrape_minhngoc_mb(today_str)
  if data:
    save_to_supabase(data)
