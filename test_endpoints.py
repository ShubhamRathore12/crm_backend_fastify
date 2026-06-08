import urllib.request
import json

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJlbWFpbCI6ImFkbWluQGNybS5jb20iLCJuYW1lIjoiQWRtaW4gVXNlciIsInJvbGUiOiJhZG1pbiIsInRlYW1faWQiOm51bGwsImlhdCI6MTc4MDgzMDE0NCwiZXhwIjoxNzgxNDM0OTQ0fQ.Rffhj0xsQWILAilXTyQRJ1ZcLlUKBm-6Wd1rdME7S-Q"

endpoints = [
    'http://127.0.0.1:4200/api/v1/contacts',
    'http://127.0.0.1:4200/api/v1/leads',
    'http://127.0.0.1:4200/api/v1/opportunities',
    'http://127.0.0.1:4200/api/v1/overview',
]

for url in endpoints:
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    })
    try:
        resp = urllib.request.urlopen(req)
        body = resp.read().decode()
        print(f"\n✓ {url}")
        print(f"  Status: {resp.status}")
        print(f"  Body: {body[:200]}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"\n✗ {url}")
        print(f"  Status: {e.code}")
        print(f"  Error: {body[:300]}")
