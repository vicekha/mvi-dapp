import json
import sys

def extract(filepath, outfile):
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        with open(outfile, 'w', encoding='utf-8') as out:
            transactions = data.get('transactions', [])
            for tx in transactions:
                if tx.get('transactionType') == 'CREATE':
                    name = tx.get('contractName', 'Unknown')
                    addr = tx.get('contractAddress', 'Unknown')
                    out.write(f"{name}: {addr}\n")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 2:
        extract(sys.argv[1], sys.argv[2])
    else:
        print("Usage: python extract_addresses_utf8.py <infile> <outfile>")
