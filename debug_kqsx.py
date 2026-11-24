import scrape_minhngoc as s

for region, d in (("mb", "23-11-2026"), ("mn", "23-11-2026"), ("mt", "23-11-2026")):
    url = f"{s.KQSX}/ket-qua-ngay/xs{region}-{d}"
    print("=== ", url)
    html = s.fetch(url, "kqsx")
    if not html:
        print("KHONG TAI DUOC (xem dong canh bao phia tren)")
        continue
    print("Tai duoc, so ky tu:", len(html))
    lines = s.kqsx_lines(html)
    print("So dong van ban:", len(lines))
    print("Dong co 'Xổ số miền':", [l for l in lines if "Xổ số miền" in l][:5])
    print("Co nhan G8/G7/DB:", [x for x in ("G8", "G7", "ĐB", "DB") if x in lines])
    print("15 dong dau:", lines[:15])
    recs = s.parse_kqsx(html, region, d)
    print("DOC DUOC", len(recs), "ban ghi")
