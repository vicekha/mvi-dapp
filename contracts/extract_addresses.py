import json
import sys

def extract(filepath):
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        transactions = data.get('transactions', [])
        for tx in transactions:
            if tx.get('transactionType') == 'CREATE':
                name = tx.get('contractName', 'Unknown')
                addr = tx.get('contractAddress', 'Unknown')
                print(f"{name}: {addr}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        extract(sys.argv[1])
    else:
        print("Usage: python extract_addresses.py <file>")
