#!/usr/bin/env python3
"""
Simple YAML parser helper for claude-habitat
Falls back to basic parsing if PyYAML is not available
"""

import sys
import json

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

def parse_simple_yaml(content):
    """Basic YAML parser for simple structures"""
    result = {}
    current_section = None
    current_list = None

    for line in content.split('\n'):
        line = line.rstrip()
        if not line or line.startswith('#'):
            continue

        # Count indentation
        indent = len(line) - len(line.lstrip())
        line = line.strip()

        if not line:
            continue

        # Handle list items
        if line.startswith('- '):
            if current_list is not None:
                current_list.append(line[2:])
            continue

        # Handle key: value
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()

            if indent == 0:
                current_section = key
                if not value:
                    result[key] = {}
                else:
                    result[key] = value
                current_list = None
            elif current_section and not value:
                # Starting a list
                current_list = []
                result[current_section][key] = current_list

    return result

def navigate_path(data, path):
    """Navigate through the data structure using dot notation"""
    if not path or path == '.':
        return data

    parts = path.split('.')
    current = data

    for part in parts:
        if not part:
            continue

        # Handle array index
        if '[' in part and ']' in part:
            key = part[:part.index('[')]
            index = int(part[part.index('[')+1:part.index(']')])
            if key:  # If there's a key before the bracket
                if isinstance(current, dict) and key in current:
                    current = current[key]
                else:
                    return None
            # Now handle the array access
            if isinstance(current, list) and index < len(current):
                current = current[index]
            else:
                return None
        else:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None

    return current

def format_output(value):
    """Format the output value"""
    if value is None:
        return ""
    elif isinstance(value, list):
        output = []
        for item in value:
            if isinstance(item, dict):
                output.append("---")
                for k, v in item.items():
                    output.append(f"{k}: {v}")
            else:
                output.append(f"- {item}")
        return '\n'.join(output)
    elif isinstance(value, dict):
        return json.dumps(value, indent=2)
    else:
        return str(value)

def main():
    if len(sys.argv) != 3:
        print("Usage: yaml_parser.py <yaml_file> <query_path>", file=sys.stderr)
        sys.exit(1)

    yaml_file = sys.argv[1]
    query_path = sys.argv[2]

    try:
        with open(yaml_file, 'r') as f:
            content = f.read()

        if HAS_YAML:
            data = yaml.safe_load(content)
        else:
            data = parse_simple_yaml(content)

        result = navigate_path(data, query_path)
        print(format_output(result))

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
