import os

with open("main.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "/upload" in line.lower() or "def upload_" in line.lower():
        print(f"Line {i+1}: {line.strip()}")
