import os
import re

api_dir = 'api'
files = [f for f in os.listdir(api_dir) if f.endswith('.ts') and f != 'index.ts']

# Rename files
for f in files:
    if not f.startswith('_'):
        os.rename(os.path.join(api_dir, f), os.path.join(api_dir, '_' + f))

# Update imports in all files in api directory
all_files = [f for f in os.listdir(api_dir) if f.endswith('.ts')]
for f in all_files:
    filepath = os.path.join(api_dir, f)
    with open(filepath, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Replace from "./foo.js" to from "./_foo.js"
    # Also handle from './foo.js'
    content = re.sub(r'from ([\'"])\./([a-zA-Z0-9]+)\.js([\'"])', r'from \1./_\2.js\3', content)
    
    # Also handle type imports if any without .js
    content = re.sub(r'from ([\'"])\./([a-zA-Z0-9]+)([\'"])', r'from \1./_\2\3', content)
    
    with open(filepath, 'w', encoding='utf-8') as file:
        file.write(content)

print('Done fixing Vercel exports!')
