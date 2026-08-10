import urllib.request
import urllib.parse
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

cat = urllib.parse.quote("Category:Hotels in Wrocław by district")
url = f"https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle={cat}&cmlimit=500&format=json"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        members = data.get('query', {}).get('categorymembers', [])
        print(f"Found {len(members)} subcategories:")
        for m in members:
            print(f"- {m.get('title')}")
            # get subcategory members
            subcat = urllib.parse.quote(m.get('title'))
            sub_url = f"https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle={subcat}&cmlimit=500&format=json"
            req2 = urllib.request.Request(sub_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req2) as resp2:
                data2 = json.loads(resp2.read().decode('utf-8'))
                m2 = data2.get('query', {}).get('categorymembers', [])
                for item in m2:
                    print(f"   * {item.get('title')}")
except Exception as e:
    print(f"Error: {e}")
