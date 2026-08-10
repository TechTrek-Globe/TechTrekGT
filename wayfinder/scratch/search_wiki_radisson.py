import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Search Wikipedia API for pages about Radisson Blu Hotel Wroclaw or Wroclaw hotels
url = "https://pl.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=Radisson%20Wroclaw&gsrlimit=10&prop=images&format=json"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error: {e}")
