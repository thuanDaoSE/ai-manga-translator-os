with open("d:/Workspaces/VSCode-workspace/AI_Manga_Translator/manga-backend/main.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "runpod_translation_task" in line:
        print(f"Line {i+1}: {line.strip()}")
