import urllib.request
import urllib.parse
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

target_dir = r"E:\TechTrekGT\wayfinder\public\Poland-2026\images\wroclaw\hotels"
os.makedirs(target_dir, exist_ok=True)

downloads = [
    {
        "name": "The Bridge Wrocław MGallery",
        "filename": "the-bridge-wroclaw.jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/b/bf/Katedralny_Square_2022_P05_The_Bridge_Hotel.jpg"
    },
    {
        "name": "Hotel Monopol Wrocław",
        "filename": "hotel-monopol-wroclaw.jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/9/97/Wroc%C5%82aw_-_Hotel_Monopol_noc%C4%85.jpg"
    },
    {
        "name": "Radisson Blu Hotel Wrocław",
        "filename": "radisson-blu-wroclaw.jpg",
        "url": "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1600&auto=format&fit=crop"
    }
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

for item in downloads:
    dest_path = os.path.join(target_dir, item["filename"])
    print(f"Downloading {item['name']} -> {item['filename']}...")
    try:
        req = urllib.request.Request(item["url"], headers=headers)
        with urllib.request.urlopen(req) as resp, open(dest_path, 'wb') as f:
            f.write(resp.read())
        size = os.path.getsize(dest_path)
        print(f"  SUCCESS! Downloaded {size} bytes")
    except Exception as e:
        print(f"  FAILED: {e}")
