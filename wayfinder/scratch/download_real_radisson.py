import urllib.request
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

dest = r"E:\TechTrekGT\wayfinder\public\Poland-2026\images\wroclaw\hotels\radisson-blu-wroclaw.jpg"
urls = [
    "https://upload.wikimedia.org/wikipedia/commons/7/7b/Radisson_Blu_Hotel%2C_Wroc%C5%82aw.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Radisson_Blu_Hotel%2C_Wroc%C5%82aw.jpg/1280px-Radisson_Blu_Hotel%2C_Wroc%C5%82aw.jpg"
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

for url in urls:
    print(f"Trying download from {url}...")
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as resp, open(dest, 'wb') as f:
            f.write(resp.read())
        size = os.path.getsize(dest)
        print(f"SUCCESS! Downloaded {size} bytes to {dest}")
        break
    except Exception as e:
        print(f"Failed: {e}")
