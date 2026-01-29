import re
import os

def get_addr(fn):
    if not os.path.exists(fn):
        return 'File Not Found'
    try:
        with open(fn, 'r', encoding='utf-16') as f:
            content = f.read()
    except Exception:
        with open(fn, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
    m = re.search(r'"deployedTo":\s*"(0x[a-fA-F0-9]{40})"', content)
    return m.group(1) if m else 'Address Not Found'

print('POOL: ' + get_addr('pool_deploy_v2.json'))
print('VERIFIER: ' + get_addr('verifier_deploy_v2.json'))
