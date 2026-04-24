
import sys
import re

def trace_tags(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    tags = re.finditer(r'<(div|main)|</(div|main)>', content)
    
    for match in tags:
        tag_text = match.group(0)
        line_no = content.count('\n', 0, match.start()) + 1
        
        if tag_text.startswith('</'):
            tag_name = match.group(2)
            if not stack:
                print(f"[{line_no}] ERROR: Orphaned </{tag_name}>")
                return
            opening_name, opening_line = stack.pop()
            print(f"[{line_no}] CLOSED {tag_name} (from {opening_line}). Stack depth: {len(stack)}")
        else:
            end_pos = content.find('>', match.start())
            if end_pos != -1:
                tag_body = content[match.start():end_pos+1]
                if tag_body.rstrip().endswith('/>'):
                    continue
            
            tag_name = match.group(1)
            stack.append((tag_name, line_no))
            print(f"[{line_no}] OPENED {tag_name}. Stack depth: {len(stack)}")
            
    if stack:
        print(f"Unclosed tags: {stack}")

if __name__ == "__main__":
    trace_tags(sys.argv[1])
