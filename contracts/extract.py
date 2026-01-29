import re
import os

def get_addr(fn):
    if not os.path.exists(fn):
        return 'File Not Found'
    try:
        # Try UTF-16 (powershell default for some redirections)
        with open(fn, 'r', encoding='utf-16') as f:
            content = f.read()
    except Exception:
        # Fallback to UTF-8
        with open(fn, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
    m = re.search(r'"deployedTo":\s*"(0x[a-fA-F0-9]{40})"', content)
    return m.group(1) if m else 'Address Not Found'

print('POOL: ' + get_addr('deploy_pool.json'))
print('VERIFIER: ' + get_addr('deploy_verifier.json'))
