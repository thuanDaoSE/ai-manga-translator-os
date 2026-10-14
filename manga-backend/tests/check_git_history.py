import subprocess

out = subprocess.check_output(['git', 'show', 'ac5c8e7:manga-backend/main.py'], text=True, encoding='utf-8')
idx = out.find('@app.post("/api/pages/{page_id}/translate")')
print(out[idx:idx+2500])
