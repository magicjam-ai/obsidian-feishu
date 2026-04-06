#!/usr/bin/env python3
import json, requests, sys, os

DATA_FILE = os.path.expanduser("~/obsidian/.obsidian/plugins/obsidian-feishu/data.json")
with open(DATA_FILE) as f:
    config = json.load(f)

s = config["settings"]
app_id = s["appId"]
app_secret = s["appSecret"]
sync_folders = [f.strip() for f in s["syncFolders"].split(",") if f.strip()]

print(f"App ID: {app_id}")
print(f"Sync folders: {sync_folders}")

# Get token
r = requests.post(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    json={"app_id": app_id, "app_secret": app_secret},
    timeout=10
)
result = r.json()
code = result.get("code", -1)
if code == 0:
    token = result["tenant_access_token"]
    print(f"Token OK: {token[:20]}...")
else:
    print(f"Token error: {result}")
    sys.exit(1)

# Collect files
vault_root = os.path.expanduser("~/obsidian")
all_files = []
for folder in sync_folders:
    folder_path = os.path.join(vault_root, folder)
    if not os.path.exists(folder_path):
        print(f"Warning: folder not found: {folder_path}")
        continue
    for root, dirs, filenames in os.walk(folder_path):
        for fname in filenames:
            if fname.endswith(".md"):
                full_path = os.path.join(root, fname)
                rel_path = os.path.relpath(full_path, vault_root)
                all_files.append((full_path, rel_path))

print(f"Total files found: {len(all_files)}")

# Check existing mappings
files_map = config.get("mappings", {}).get("files", {})
already_synced = [f for f in all_files if f[1] in files_map]
need_sync = [f for f in all_files if f[1] not in files_map]
print(f"Already synced: {len(already_synced)}")
print(f"Need sync: {len(need_sync)}")

if not need_sync:
    print("All files already synced!")
    sys.exit(0)

# List first 5 files that need syncing
for fp, rp in need_sync[:5]:
    print(f"  - {rp}")

# Now sync
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
target_folder = s["targetFolderToken"]
success = 0
failed = 0

for i, (full_path, rel_path) in enumerate(need_sync):
    basename = os.path.splitext(os.path.basename(full_path))[0]
    
    # Read content
    with open(full_path, "r", encoding="utf-8") as f:
        md = f.read()
    
    # Create doc
    try:
        r = requests.post(
            "https://open.feishu.cn/open-apis/docx/v1/documents",
            headers=headers,
            json={"title": basename, "folder_token": target_folder},
            timeout=15
        )
        result = r.json()
        if result.get("code") != 0:
            print(f"[{i+1}/{len(need_sync)}] CREATE FAIL {basename}: {result.get('msg', 'unknown')}")
            failed += 1
            continue
        
        doc_id = result["data"]["document"]["document_id"]
        
        # Write content as single text block
        text_content = md[:30000]  # Limit content
        block = {
            "block_type": 2,
            "text": {
                "elements": [{"text_run": {"content": text_content}}],
                "style": {}
            }
        }
        
        r = requests.post(
            f"https://open.feishu.cn/open-apis/docx/v1/documents/{doc_id}/blocks/{doc_id}/children",
            headers=headers,
            json={"children": [block]},
            timeout=15
        )
        write_result = r.json()
        
        # Update mapping
        files_map[rel_path] = doc_id
        success += 1
        print(f"[{i+1}/{len(need_sync)}] OK {basename} -> {doc_id}")
        
        # Save every 10 files
        if success % 10 == 0:
            config["mappings"]["files"] = files_map
            with open(DATA_FILE, "w") as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            print(f"  [Saved: {len(files_map)} total mappings]")
        
        # Rate limit
        import time
        time.sleep(0.15)
        
    except Exception as e:
        print(f"[{i+1}/{len(need_sync)}] ERROR {basename}: {e}")
        failed += 1

# Final save
config["mappings"]["files"] = files_map
with open(DATA_FILE, "w") as f:
    json.dump(config, f, indent=2, ensure_ascii=False)

print(f"\nDone! Success: {success}, Failed: {failed}, Total mapped: {len(files_map)}")
