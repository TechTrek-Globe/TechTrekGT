import sys
import urllib.request
import json
import time

sys.stdout.reconfigure(encoding='utf-8')

# Search Unsplash source/API or Wikimedia category pages
queries = [
    ("hotel-monopol-wroclaw.jpg", [
        "https://upload.wikimedia.org/wikipedia/commons/9/97/Wroc%C5%82aw_-_Hotel_Monopol_noc%C4%85.jpg", # Night view of Hotel Monopol Wroclaw (6016x4712)
        "https://upload.wikimedia.org/wikipedia/commons/2/21/Wroc%C5%82aw%2C_Hotel_Monopol_we_Wroc%C5%82awiu.jpg" # Full neo-baroque exterior facade
    ]),
    ("the-bridge-wroclaw.jpg", [
        "https://upload.wikimedia.org/wikipedia/commons/7/77/Plac_Katedralny_8_Wroc%C5%82aw.jpg", # Plac Katedralny 8 (The Bridge Wroclaw address)
        "https://images.unsplash.com/photo-1541971875076-8f970d573be6?q=80&w=1600&auto=format&fit=crop" # Modern architectural European riverside building
    ]),
    ("radisson-blu-wroclaw.jpg", [
        "https://upload.wikimedia.org/wikipedia/commons/7/7f/Wroc%C5%82aw%2C_ul._Purkyniego_2021-03-03_foto_nr_01.jpg", # Ul. Purkyniego facing Radisson Blu/Panorama park
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1600&auto=format&fit=crop" # Modern luxury city hotel exterior/lobby
    ])
]

for name, urls in queries:
    print(f"Checking {name} candidates:")
    for url in urls:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(req) as resp:
                print(f"  [{resp.status}] {url[:80]}... Type: {resp.headers.get('Content-Type')}, Size: {resp.headers.get('Content-Length')}")
        except Exception as e:
            print(f"  [ERROR] {url[:80]}...: {e}")
