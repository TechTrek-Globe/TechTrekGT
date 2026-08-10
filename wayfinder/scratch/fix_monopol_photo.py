import urllib.request
import os
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

target_dir = r"E:\TechTrekGT\wayfinder\public\Poland-2026\images\wroclaw\hotels"

monopol_url = "https://upload.wikimedia.org/wikipedia/commons/9/97/Wroc%C5%82aw_-_Hotel_Monopol_noc%C4%85.jpg"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

for fname in ["hotel-monopol-wroclaw.jpg", "monopol.jpg"]:
    dest_path = os.path.join(target_dir, fname)
    print(f"Downloading {fname}...")
    try:
        time.sleep(2.5)
        req = urllib.request.Request(monopol_url, headers=headers)
        with urllib.request.urlopen(req) as resp, open(dest_path, 'wb') as f:
            f.write(resp.read())
        size = os.path.getsize(dest_path)
        print(f"  SUCCESS! Saved {fname} ({size} bytes)")
    except Exception as e:
        print(f"  FAILED {fname}: {e}")
