import re
import json

log_file = 'deploy_lasna_rsc.log'
out_file = 'lasna_rsc_addr.json'

addrs = {}
try:
    with open(log_file, 'r', encoding='utf-16') as f:
        content = f.read()
except:
    with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

patterns = {
    'LASNA_SWAP_MATCHER_RSC': r'LASNA_SWAP_MATCHER_RSC=\s*(0x[a-fA-F0-9]{40})'
}

for key, pat in patterns.items():
    match = re.search(pat, content)
    if match:
        addrs[key] = match.group(1)

with open(out_file, 'w') as f:
    json.dump(addrs, f, indent=2)

print("Extraction complete.")
