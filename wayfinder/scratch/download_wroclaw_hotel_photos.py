import urllib.request
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

target_dir = r"E:\TechTrekGT\wayfinder\public\Poland-2026\images\wroclaw\hotels"
os.makedirs(target_dir, exist_ok=True)

downloads = [
    {
        "name": "The Bridge Wrocław MGallery",
        "filename": "the-bridge-wroclaw.jpg",
        "urls": [
            "https://upload.wikimedia.org/wikipedia/commons/7/77/Plac_Katedralny_8_Wroc%C5%82aw.jpg",
            "https://images.unsplash.com/photo-1541971875076-8f970d573be6?q=80&w=1600&auto=format&fit=crop"
        ]
    },
    {
        "name": "Hotel Monopol Wrocław",
        "filename": "hotel-monopol-wroclaw.jpg",
        "urls": [
            "https://upload.wikimedia.org/wikipedia/commons/9/97/Wroc%C5%82aw_-_Hotel_Monopol_noc%C4%85.jpg",
            "https://upload.wikimedia.org/wikipedia/commons/2/21/Wroc%C5%82aw%2C_Hotel_Monopol_we_Wroc%C5%82awiu.jpg"
        ]
    },
    {
        "name": "Radisson Blu Hotel Wrocław",
        "filename": "radisson-blu-wroclaw.jpg",
        "urls": [
            "https://images.unsplash.com/photo-1582719508461-905c673771fd?q=80&w=1600&auto=format&fit=crop",
            "https://upload.wikimedia.org/wikipedia/commons/7/7f/Wroc%C5%82aw%2C_ul._Purkyniego_2021-03-03_foto_nr_01.jpg"
        ]
    }
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

for item in downloads:
    dest_path = os.path.join(target_dir, item["filename"])
    success = False
    for url in item["urls"]:
        print(f"Downloading {item['name']} from {url[:80]}...")
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as response, open(dest_path, 'wb') as out_file:
                out_file.write(response.read())
            size = os.path.getsize(dest_path)
            if size > 10000:
                print(f"SUCCESS: Saved {item['filename']} ({size} bytes)")
                success = True
                break
            else:
                print(f"File too small ({size} bytes), trying next URL...")
        except Exception as e:
            print(f"Failed download from {url[:80]}: {e}")
    if not success:
        print(f"ERROR: Could not download photo for {item['name']}")
