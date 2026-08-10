import urllib.request
import urllib.parse
import json
import time
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Search for Radisson Blu Wrocław or Purkyniego street buildings
search_terms = [
    "Radisson Blu Wrocław",
    "Radisson Blu Wroclaw",
    "Hotel Radisson Wrocław",
    "Hotel Radisson Blu Wrocław",
    "Purkyniego Wrocław building",
    "Purkyniego 10 Wrocław"
]

for term in search_terms:
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(term)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|mime&format=json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (contact@techtrekgt.org)'})
    try:
        time.sleep(1)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            pages = data.get('query', {}).get('pages', {})
            print(f"=== Term: {term} (Found {len(pages)}) ===")
            for p_id, p in pages.items():
                title = p.get('title')
                info = p.get('imageinfo', [{}])[0]
                url_img = info.get('url')
                print(f"Title: {title}\nURL: {url_img}\n")
    except Exception as e:
        print(f"Error {term}: {e}")
