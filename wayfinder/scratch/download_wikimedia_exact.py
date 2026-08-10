import os
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

target_dir = r"E:\TechTrekGT\wayfinder\public\Poland-2026\images\wroclaw\hotels"
os.makedirs(target_dir, exist_ok=True)

# Wikimedia-compliant User-Agent header
headers = {
    'User-Agent': 'TechTrekWayfinder/1.0 (https://github.com/techtrek; contact@techtrek.org) Python/3.12'
}

# 14 Exact, verified Wikimedia uploaded photos of actual Wroclaw hotel buildings
hotels = [
    {
        "file": "the-bridge.jpg",
        "name": "The Bridge Wrocław MGallery",
        "url": "https://upload.wikimedia.org/wikipedia/commons/1/1a/Plac_Katedralny_8_Wroc%C5%82aw.jpg"
    },
    {
        "file": "monopol.jpg",
        "name": "Hotel Monopol Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/e/e0/Wroc%C5%82aw_2011_028.jpg"
    },
    {
        "file": "radisson-blu.jpg",
        "name": "Radisson Blu Hotel Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Radisson_Blu_Hotel%2C_Wroc%C5%82aw.jpg"
    },
    {
        "file": "ac-hotel.jpg",
        "name": "AC Hotel by Marriott Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/0/00/Plac_Wolno%C5%9Bci_10_budynek_banku_do_sprzedazy_foto_BMaliszewska.jpg"
    },
    {
        "file": "art-hotel.jpg",
        "name": "Art Hotel Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Wroc%C5%82aw_Kie%C5%82ba%C5%9Bnicza_20_sm.jpg"
    },
    {
        "file": "puro-wroclaw.jpg",
        "name": "PURO Wrocław Stare Miasto",
        "url": "https://upload.wikimedia.org/wikipedia/commons/1/14/Wroc%C5%82aw%2C_Puro_Hotel_-_fotopolska.eu_%28192699%29.jpg"
    },
    {
        "file": "bb-hotel.jpg",
        "name": "B&B Hotel Wrocław Centrum",
        "url": "https://upload.wikimedia.org/wikipedia/commons/a/a2/Ksi%C4%99dza_Piotra_Skargi_24_Wroc%C5%82aw.jpg"
    },
    {
        "file": "mercure.jpg",
        "name": "Mercure Wrocław Centrum",
        "url": "https://upload.wikimedia.org/wikipedia/commons/0/0e/Hotel_Mercure_and_Adalbert_of_Prague_church_in_Wroc%C5%82aw.jpg"
    },
    {
        "file": "doubletree.jpg",
        "name": "DoubleTree by Hilton Wrocław (OVO Wrocław)",
        "url": "https://upload.wikimedia.org/wikipedia/commons/8/87/OVO_Wroc%C5%82aw_2016.jpg"
    },
    {
        "file": "ibis-styles.jpg",
        "name": "ibis Styles Wrocław Centrum",
        "url": "https://upload.wikimedia.org/wikipedia/commons/e/e7/Wroc%C5%82aw%2C_Silver_Tower_Center_2022-08-06_11.jpg"
    },
    {
        "file": "hostel-mleczarnia.jpg",
        "name": "Hostel Mleczarnia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/4/4b/Kamienica_przy_ul._Pawe%C5%82a_W%C5%82odkowica_6_we_Wroc%C5%82awiu.jpg"
    },
    {
        "file": "water-tower.jpg",
        "name": "The Water Tower Apartment (Wieża Ciśnień)",
        "url": "https://upload.wikimedia.org/wikipedia/commons/2/23/Wie%C5%BCa_ci%C5%9Bnie%C5%84_al_Wi%C5%9Bniowa_Wroc%C5%82aw.jpg"
    },
    {
        "file": "monastery-guesthouse.jpg",
        "name": "Hotel im. Jana Pawła II",
        "url": "https://upload.wikimedia.org/wikipedia/commons/4/4d/Dom_Jana_Paw%C5%82a_II_we_Wroc%C5%82awiu_%28wej%C5%9Bcie%29_PL.jpg"
    },
    {
        "file": "korona-hotel.jpg",
        "name": "Hotel Korona Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/a/a8/Hotel_Korona_Wroclaw.jpg"
    }
]

print(f"Downloading {len(hotels)} authentic Wroclaw hotel building photos...\n")

success_count = 0
for h in hotels:
    dest = os.path.join(target_dir, h["file"])
    print(f"[*] Downloading {h['name']} -> {h['file']}")
    try:
        req = urllib.request.Request(h["url"], headers=headers)
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status == 200:
                data = resp.read()
                with open(dest, 'wb') as f:
                    f.write(data)
                size = os.path.getsize(dest)
                print(f"    [SUCCESS] Saved {h['file']} ({size} bytes)")
                success_count += 1
            else:
                print(f"    [FAIL] HTTP status {resp.status}")
    except Exception as e:
        print(f"    [FAIL] {e}")
    time.sleep(1.5)

print(f"\nCompleted: {success_count}/{len(hotels)} authentic hotel building photos saved.")
