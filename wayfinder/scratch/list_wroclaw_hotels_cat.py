import urllib.request
import urllib.parse
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

cat = urllib.parse.quote("Category:Hotels in Wrocław")
url = f"https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle={cat}&cmlimit=500&format=json"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        members = data.get('query', {}).get('categorymembers', [])
        print(f"Found {len(members)} category members:")
        for m in members:
            print(f"- {m.get('title')}")
except Exception as e:
    print(f"Error: {e}")
