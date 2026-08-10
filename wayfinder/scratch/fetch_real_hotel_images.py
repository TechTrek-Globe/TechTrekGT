import os
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

target_dir = r"E:\TechTrekGT\wayfinder\public\Poland-2026\images\wroclaw\hotels"
os.makedirs(target_dir, exist_ok=True)

# Exact real photos of actual Wroclaw hotel buildings
hotels = [
    {
        "file": "the-bridge.jpg",
        "name": "The Bridge Wrocław MGallery",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/The_Bridge_Wroclaw_MGallery.jpg/1280px-The_Bridge_Wroclaw_MGallery.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Plac_Katedralny_8_Wroclaw.jpg/1280px-Plac_Katedralny_8_Wroclaw.jpg"
    },
    {
        "file": "monopol.jpg",
        "name": "Hotel Monopol Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Wroc%C5%82aw_2011_028.jpg/1280px-Wroc%C5%82aw_2011_028.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Hotel_Monopol_Wroclaw.jpg/1280px-Hotel_Monopol_Wroclaw.jpg"
    },
    {
        "file": "radisson-blu.jpg",
        "name": "Radisson Blu Hotel Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Radisson_Blu_Hotel%2C_Wroc%C5%82aw.jpg/1280px-Radisson_Blu_Hotel%2C_Wroc%C5%82aw.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Radisson_Blu_Hotel_in_Wroclaw.jpg/1280px-Radisson_Blu_Hotel_in_Wroclaw.jpg"
    },
    {
        "file": "ac-hotel.jpg",
        "name": "AC Hotel by Marriott Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/0/00/Plac_Wolno%C5%9Bci_10_budynek_banku_do_sprzedazy_foto_BMaliszewska.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Plac_Wolno%C5%9Bci_10_Wroclaw.jpg/1280px-Plac_Wolno%C5%9Bci_10_Wroclaw.jpg"
    },
    {
        "file": "art-hotel.jpg",
        "name": "Art Hotel Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Wroc%C5%82aw_Kie%C5%82ba%C5%9Bnicza_20_sm.jpg/1280px-Wroc%C5%82aw_Kie%C5%82ba%C5%9Bnicza_20_sm.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Kie%C5%82ba%C5%9Bnicza_20_Wroclaw.jpg/1280px-Kie%C5%82ba%C5%9Bnicza_20_Wroclaw.jpg"
    },
    {
        "file": "puro-wroclaw.jpg",
        "name": "PURO Wrocław Stare Miasto",
        "url": "https://upload.wikimedia.org/wikipedia/commons/1/14/Wroc%C5%82aw%2C_Puro_Hotel_-_fotopolska.eu_%28192699%29.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/PURO_Hotel_Wroclaw.jpg/1280px-PURO_Hotel_Wroclaw.jpg"
    },
    {
        "file": "bb-hotel.jpg",
        "name": "B&B Hotel Wrocław Centrum",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/B%26B_Hotel_Wroclaw.jpg/1280px-B%26B_Hotel_Wroclaw.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/B%26B_Hotel_Wroclaw_Centrum.jpg/1280px-B%26B_Hotel_Wroclaw_Centrum.jpg"
    },
    {
        "file": "mercure.jpg",
        "name": "Mercure Wrocław Centrum",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Hotel_Mercure_and_Adalbert_of_Prague_church_in_Wroc%C5%82aw.jpg/1280px-Hotel_Mercure_and_Adalbert_of_Prague_church_in_Wroc%C5%82aw.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Hotel_Mercure_Wroclaw.jpg/1280px-Hotel_Mercure_Wroclaw.jpg"
    },
    {
        "file": "doubletree.jpg",
        "name": "DoubleTree by Hilton Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/OVO_Wroclaw.jpg/1280px-OVO_Wroclaw.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/OVO_Wroc%C5%82aw_2016.jpg/1280px-OVO_Wroc%C5%82aw_2016.jpg"
    },
    {
        "file": "ibis-styles.jpg",
        "name": "ibis Styles Wrocław Centrum",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Wroc%C5%82aw%2C_Silver_Tower_Center_2022-08-06_11.jpg/1280px-Wroc%C5%82aw%2C_Silver_Tower_Center_2022-08-06_11.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Ibis_Styles_Wroclaw.jpg/1280px-Ibis_Styles_Wroclaw.jpg"
    },
    {
        "file": "hostel-mleczarnia.jpg",
        "name": "Hostel Mleczarnia",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Kamienica_przy_ul._Pawe%C5%82a_W%C5%82odkowica_6_we_Wroc%C5%82awiu.jpg/1280px-Kamienica_przy_ul._Pawe%C5%82a_W%C5%82odkowica_6_we_Wroc%C5%82awiu.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/W%C5%82odkowica_6_Wroclaw.jpg/1280px-W%C5%82odkowica_6_Wroclaw.jpg"
    },
    {
        "file": "water-tower.jpg",
        "name": "The Water Tower Apartment (Wieża Ciśnień)",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Wie%C5%BCa_ci%C5%9Bnie%C5%84_al_Wi%C5%9Bniowa_Wroc%C5%82aw.jpg/1280px-Wie%C5%BCa_ci%C5%9Bnie%C5%84_al_Wi%C5%9Bniowa_Wroc%C5%82aw.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Wie%C5%BCa_ci%C5%9Bnie%C5%84_przy_al._Wi%C5%9Bniowej_we_Wroc%C5%82awiu.jpg/1280px-Wie%C5%BCa_ci%C5%9Bnie%C5%84_przy_al._Wi%C5%9Bniowej_we_Wroc%C5%82awiu.jpg"
    },
    {
        "file": "monastery-guesthouse.jpg",
        "name": "Hotel im. Jana Pawła II",
        "url": "https://upload.wikimedia.org/wikipedia/commons/4/4d/Dom_Jana_Paw%C5%82a_II_we_Wroc%C5%82awiu_%28wej%C5%9Bcie%29_PL.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Hotel_im._Jana_Paw%C5%82a_II_we_Wroc%C5%82awiu.jpg/1280px-Hotel_im._Jana_Paw%C5%82a_II_we_Wroc%C5%82awiu.jpg"
    },
    {
        "file": "korona-hotel.jpg",
        "name": "Hotel Korona Wrocław",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Hotel_Korona_Wroclaw.jpg/1280px-Hotel_Korona_Wroclaw.jpg",
        "alt_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Przystanek_kochanowskiego_wroc%C5%82aw.jpg/1280px-Przystanek_kochanowskiego_wroc%C5%82aw.jpg"
    }
]

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 TechTrekWayfinder/1.0'
}

print(f"Downloading {len(hotels)} authentic Wroclaw hotel building photos...\n")

success_count = 0
for h in hotels:
    dest = os.path.join(target_dir, h["file"])
    print(f"[*] Downloading for {h['name']} -> {h['file']}")
    
    downloaded = False
    for url in [h["url"], h["alt_url"]]:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    data = resp.read()
                    with open(dest, 'wb') as f:
                        f.write(data)
                    size = os.path.getsize(dest)
                    if size > 5000:
                        print(f"    [SUCCESS] Saved from {url[:60]}... ({size} bytes)")
                        downloaded = True
                        success_count += 1
                        break
        except Exception as e:
            print(f"    [WARN] Failed {url[:60]}... -> {e}")
        time.sleep(1)
    
    if not downloaded:
        print(f"    [FAIL] Could not download {h['file']}")

print(f"\nCompleted: {success_count}/{len(hotels)} authentic hotel building photos saved.")
