import sys
import urllib.request
import json
import time

sys.stdout.reconfigure(encoding='utf-8')

def search_wikimedia(query):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json"
    req = urllib.request.Request(url, headers={'User-Agent': 'TechTrekGT-ImageFetcher/1.0 (contact@techtrekgt.org)'})
    try:
        time.sleep(1.5)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            pages = data.get('query', {}).get('pages', {})
            results = []
            for page_id, page in pages.items():
                title = page.get('title', '')
                info = page.get('imageinfo', [{}])[0]
                img_url = info.get('url', '')
                mime = info.get('mime', '')
                width = info.get('width', 0)
                height = info.get('height', 0)
                if 'jpeg' in mime or 'jpg' in mime or 'png' in mime:
                    results.append({'title': title, 'url': img_url, 'width': width, 'height': height})
            return results
    except Exception as e:
        print(f"Error searching {query}: {e}")
        return []

print("=== SEARCHING THE BRIDGE WROCŁAW ===")
terms_bridge = [
    'The Bridge Wroclaw',
    'Plac Katedralny Wroclaw',
    'Ostrow Tumski Wroclaw building'
]
for t in terms_bridge:
    res = search_wikimedia(t)
    print(f"--- Query: {t} (Found {len(res)}) ---")
    for r in res[:5]:
        print(r)

print("\n=== SEARCHING RADISSON BLU WROCŁAW ===")
terms_radisson = [
    'Radisson Blu Wroclaw',
    'Purkyniego Wroclaw',
    'Hotel Radisson Wroclaw'
]
for t in terms_radisson:
    res = search_wikimedia(t)
    print(f"--- Query: {t} (Found {len(res)}) ---")
    for r in res[:5]:
        print(r)
