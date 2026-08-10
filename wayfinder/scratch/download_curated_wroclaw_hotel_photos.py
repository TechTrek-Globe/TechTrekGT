import os
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

target_dir = r"E:\TechTrekGT\wayfinder\public\Poland-2026\images\wroclaw\hotels"
os.makedirs(target_dir, exist_ok=True)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
}

curated_hotels = [
    {
        "file": "the-bridge.jpg",
        "name": "The Bridge Wrocław MGallery",
        "url": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "monopol.jpg",
        "name": "Hotel Monopol Wrocław",
        "url": "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "radisson-blu.jpg",
        "name": "Radisson Blu Hotel Wrocław",
        "url": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "ac-hotel.jpg",
        "name": "AC Hotel by Marriott Wrocław",
        "url": "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "art-hotel.jpg",
        "name": "Art Hotel Wrocław",
        "url": "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "puro-wroclaw.jpg",
        "name": "PURO Wrocław Stare Miasto",
        "url": "https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "bb-hotel.jpg",
        "name": "B&B Hotel Wrocław Centrum",
        "url": "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "mercure.jpg",
        "name": "Mercure Wrocław Centrum",
        "url": "https://images.unsplash.com/photo-1568495248636-6432b97bd949?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "doubletree.jpg",
        "name": "DoubleTree by Hilton Wrocław",
        "url": "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "ibis-styles.jpg",
        "name": "ibis Styles Wrocław Centrum",
        "url": "https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "hostel-mleczarnia.jpg",
        "name": "Hostel Mleczarnia",
        "url": "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "water-tower.jpg",
        "name": "The Water Tower Apartment (Wieża Ciśnień)",
        "url": "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "monastery-guesthouse.jpg",
        "name": "Hotel im. Jana Pawła II",
        "url": "https://images.unsplash.com/photo-1548625149-fc4a29cf7092?auto=format&fit=crop&w=1400&q=85"
    },
    {
        "file": "korona-hotel.jpg",
        "name": "Hotel Korona Wrocław",
        "url": "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1400&q=85"
    }
]

print(f"Downloading {len(curated_hotels)} high-quality hotel replacement images into {target_dir}...\n")

count = 0
for h in curated_hotels:
    dest = os.path.join(target_dir, h["file"])
    print(f"[*] Downloading {h['name']} -> {h['file']}")
    try:
        req = urllib.request.Request(h["url"], headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                data = resp.read()
                with open(dest, 'wb') as f:
                    f.write(data)
                size = os.path.getsize(dest)
                print(f"    [SUCCESS] Saved {h['file']} ({size} bytes)")
                count += 1
            else:
                print(f"    [FAIL] HTTP status {resp.status}")
    except Exception as e:
        print(f"    [FAIL] {e}")
    time.sleep(0.5)

print(f"\nDone: {count}/{len(curated_hotels)} hotel images successfully updated.")
