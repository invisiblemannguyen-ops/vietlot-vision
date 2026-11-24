import re
import scrape_minhngoc as s

for region, d in (("mb", "23-11-2026"), ("mn", "23-11-2026")):
    url = f"{s.KQSX}/ket-qua-ngay/xs{region}-{d}"
    print("=== MIEN", region.upper())
    html = s.fetch(url, "kqsx")
    if not html:
        print("KHONG TAI DUOC")
        continue
    lines = s.kqsx_lines(html)
    pat = re.compile(rf"Xổ số miền {s.REGION_WORD[region]}\s+{d}", re.I)
    starts = [i for i, l in enumerate(lines) if pat.search(l)]
    labels = [i for i, l in enumerate(lines) if l in s.LABELS]
    print("Vi tri dong tieu de:", starts)
    print("Vi tri cac nhan:", labels[:12])
    if labels:
        a = max(0, labels[0] - 10)
        for i in range(a, labels[0] + 30):
            print(i, "|", lines[i])
