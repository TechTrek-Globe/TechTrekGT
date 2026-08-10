import urllib.request
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

target_dir = r"E:\TechTrekGT\wayfinder\public\Poland-2026\images\wroclaw\hotels"
os.makedirs(target_dir, exist_ok=True)

photos = {
    # The Bridge Wroclaw MGallery (Modern hotel at Plac Katedralny / Ostrow Tumski)
    "the-bridge-wroclaw.jpg": "https://upload.wikimedia.org/wikipedia/commons/3/36/Katedralny_Square_2022_P06_The_Bridge_Hotel.jpg",
    "the-bridge.jpg": "https://upload.wikimedia.org/wikipedia/commons/3/36/Katedralny_Square_2022_P06_The_Bridge_Hotel.jpg",

    # Hotel Monopol Wroclaw (Historic 19th-century Neo-Baroque landmark)
    "hotel-monopol-wroclaw.jpg": "https://upload.wikimedia.org/wikipedia/commons/9/97/Wroc%C5%82aw_-_Hotel_Monopol_noc%C4%85.jpg",
    "monopol.jpg": "https://upload.wikimedia.org/wikipedia/commons/9/97/Wroc%C5%82aw_-_Hotel_Monopol_noc%C4%85.jpg",

    # Radisson Blu Hotel Wroclaw (Modern parkside city hotel at Purkyniego 10)
    "radisson-blu-wroclaw.jpg": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=1600&auto=format&fit=crop",
    "radisson-blu.jpg": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=1600&auto=format&fit=crop"
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

for filename, url in photos.items():
    dest_path = os.path.join(target_dir, filename)
    print(f"Downloading {filename} from {url[:80]}...")
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as resp, open(dest_path, 'wb') as f:
            f.write(resp.read())
        size = os.path.getsize(dest_path)
        print(f"  SUCCESS! Saved {filename} ({size} bytes)")
    except Exception as e:
        print(f"  FAILED {filename}: {e}")
