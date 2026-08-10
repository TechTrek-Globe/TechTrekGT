import urllib.request
import urllib.parse
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

cats = [
    "Category:The Bridge Hotel, Wrocław",
    "Category:Monopol Hotel, Wrocław"
]

for c in cats:
    cat_enc = urllib.parse.quote(c)
    url = f"https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle={cat_enc}&cmlimit=500&prop=ids|title&format=json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            members = data.get('query', {}).get('categorymembers', [])
            print(f"=== {c} ({len(members)} files) ===")
            for m in members:
                title = m.get('title')
                # get image url
                info_url = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(title)}&prop=imageinfo&iiprop=url&format=json"
                req2 = urllib.request.Request(info_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req2) as resp2:
                    data2 = json.loads(resp2.read().decode('utf-8'))
                    pages = data2.get('query', {}).get('pages', {})
                    for p_id, p in pages.items():
                        url_img = p.get('imageinfo', [{}])[0].get('url')
                        print(f"Title: {title}\nURL: {url_img}\n")
    except Exception as e:
        print(f"Error: {e}")
