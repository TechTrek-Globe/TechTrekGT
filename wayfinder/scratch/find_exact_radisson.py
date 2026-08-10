import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

def search_commons(query):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url|size|mime&format=json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            pages = data.get('query', {}).get('pages', {})
            for page_id, page in pages.items():
                title = page.get('title', '')
                info = page.get('imageinfo', [{}])[0]
                print(f"Title: {title}")
                print(f"URL: {info.get('url')}")
                print("---")
    except Exception as e:
        print(f"Error {query}: {e}")

print("=== SEARCH RADISSON ===")
search_commons("Radisson Wroclaw")
search_commons("Radisson Blu Hotel Wroclaw")
search_commons("Purkyniego Wroclaw hotel")
