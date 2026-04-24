
import sys
import re

def check_tags(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    # Find all <div, <main, </div, </main
    # Handle self-closing tags like <div />? No, search for </
    # This regex finds <div, <main, </div, </main
    tags = re.finditer(r'<(div|main)|</(div|main)>', content)
    
    for match in tags:
        tag_text = match.group(0)
        line_no = content.count('\n', 0, match.start()) + 1
        
        if tag_text.startswith('</'):
            tag_name = match.group(2)
            if not stack:
                print(f"ERROR: Orphaned </{tag_name}> at line {line_no}")
                return
            opening_name, opening_line = stack.pop()
            if opening_name != tag_name:
                print(f"ERROR: Mismatched </{tag_name}> at line {line_no}. Expected match for <{opening_name}> from line {opening_line}")
                return
        else:
            # Check if it's self-closing <div ... />
            # Find the end of this tag
            end_pos = content.find('>', match.start())
            if end_pos != -1:
                tag_body = content[match.start():end_pos+1]
                if tag_body.rstrip().endswith('/>'):
                    # Self closing, ignore
                    continue
            
            tag_name = match.group(1)
            stack.append((tag_name, line_no))
            
    if stack:
        print(f"ERROR: Unclosed tags at end of file: {stack}")
    else:
        print("SUCCESS: All tags balanced.")

if __name__ == "__main__":
    check_tags(sys.argv[1])
