import os
import sys
import json
import time
import urllib.request
import urllib.parse

sys.stdout.reconfigure(encoding='utf-8')

target_dir = r"E:\TechTrekGT\wayfinder\public\Poland-2026\images\wroclaw\hotels"
headers = {
    'User-Agent': 'TechTrekWayfinder/1.0 (https://github.com/techtrek; contact@techtrek.org) Python/3.12'
}

remaining = [
    {
        "file": "doubletree.jpg",
        "name": "DoubleTree by Hilton Wrocław",
        "search": "OVO Wrocław",
        "fallback_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/OVO_Wroclaw.jpg/1280px-OVO_Wroclaw.jpg"
    },
    {
        "file": "the-bridge.jpg",
        "name": "The Bridge Wrocław MGallery",
        "search": "Plac Katedralny 8 Wrocław",
        "fallback_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/The_Bridge_Wroclaw_MGallery.jpg/1280px-The_Bridge_Wroclaw_MGallery.jpg"
    },
    {
        "file": "radisson-blu.jpg",
        "name": "Radisson Blu Hotel Wrocław",
        "search": "Radisson Blu Hotel Wrocław",
        "fallback_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Radisson_Blu_Hotel_in_Wroclaw.jpg/1280px-Radisson_Blu_Hotel_in_Wroclaw.jpg"
    },
    {
        "file": "bb-hotel.jpg",
        "name": "B&B Hotel Wrocław Centrum",
        "search": "B&B Hotel Wrocław",
        "fallback_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/B%26B_Hotel_Wroclaw.jpg/1280px-B%26B_Hotel_Wroclaw.jpg"
    },
    {
        "file": "hostel-mleczarnia.jpg",
        "name": "Hostel Mleczarnia",
        "search": "Pawła Włodkowica Wrocław",
        "fallback_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/W%C5%82odkowica_6_Wroclaw.jpg/1280px-W%C5%82odkowica_6_Wroclaw.jpg"
    },
    {
        "file": "korona-hotel.jpg",
        "name": "Hotel Korona Wrocław",
        "search": "Hotel Korona Wrocław",
        "fallback_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Hotel_Korona_Wroclaw.jpg/1280px-Hotel_Korona_Wroclaw.jpg"
    }
]

def search_wikimedia(query):
    encoded = urllib.parse.quote(query)
    api_url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={encoded}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=1280&format=json"
    try:
        req = urllib.request.Request(api_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if "query" in data and "pages" in data["query"]:
                pages = list(data["query"]["pages"].values())
                for page in pages:
                    if "imageinfo" in page and len(page["imageinfo"]) > 0:
                        info = page["imageinfo"][0]
                        url = info.get("thumburl") or info.get("url")
                        if url and any(url.lower().endswith(ext) or ext in url.lower() for ext in ['.jpg', '.jpeg', '.png']):
                            return url
    except Exception as e:
        print(f"    API Error for '{query}': {e}")
    return None

def download_img(url, dest):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        if resp.status == 200:
            content = resp.read()
            with open(dest, 'wb') as f:
                f.write(content)
            return len(content)
    return 0

print("Fetching remaining 6 authentic Wrocław hotel building photos...\n")

for item in remaining:
    dest = os.path.join(target_dir, item["file"])
    print(f"[*] Processing {item['name']} -> {item['file']}")
    img_url = search_wikimedia(item["search"])
    if not img_url:
        print(f"    Searching fallback API...")
        img_url = item["fallback_url"]
    
    print(f"    Target URL: {img_url}")
    try:
        size = download_img(img_url, dest)
        print(f"    [SUCCESS] Saved {item['file']} ({size} bytes)\n")
    except Exception as e:
        print(f"    [FAIL] Could not download from {img_url}: {e}\n")
    time.sleep(1.5)

print("Finished processing remaining hotels.")
