import json

import sys
f = open('/Users/robert/obsidian/.obsidian/plugins/obsidian-feishu/data.json', 'r')
mappings = d.get('mappings', {})
files = mappings.get('files', {})
print(len(files))
EOF
print(f"已同步文档数: {len(files)}')
