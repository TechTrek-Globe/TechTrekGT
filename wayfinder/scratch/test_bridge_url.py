import urllib.request
import urllib.parse
import os

url = "https://upload.wikimedia.org/wikipedia/commons/7/77/Plac_Katedralny_8_Wroc%C5%82aw.jpg"
headers = {'User-Agent': 'Mozilla/5.0'}
try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        content = resp.read()
        print(f"Direct URL length: {len(content)}")
except Exception as e:
    print(f"Direct URL failed: {e}")

# Try Wikimedia API to get actual image URL for "File:Plac Katedralny 8 Wrocław.jpg"
api_url = "https://commons.wikimedia.org/w/api.php?action=query&titles=File:Plac%20Katedralny%208%20Wroc%C5%82aw.jpg&prop=imageinfo&iiprop=url&format=json"
try:
    req = urllib.request.Request(api_url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        import json
        data = json.loads(resp.read().decode('utf-8'))
        print("API Result:", json.dumps(data, indent=2))
except Exception as e:
    print(f"API failed: {e}")
