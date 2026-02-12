import json
import sys

def parse_log(filename):
    try:
        with open(filename, 'r') as f:
            content = f.read()
        
        # Find the start of the JSON object
        start_idx = content.find('{')
        if start_idx == -1:
            return "ERROR: No JSON found"
            
        json_str = content[start_idx:]
        data = json.loads(json_str)
        return data.get('deployedTo', 'ERROR: deployedTo not found')
    except Exception as e:
        return f"ERROR: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_deploy.py <logfile>")
        sys.exit(1)
        
    print(parse_log(sys.argv[1]))
