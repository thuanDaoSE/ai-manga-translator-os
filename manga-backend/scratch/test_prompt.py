import os
import json
from openai import OpenAI
from dotenv import load_dotenv

# Load env variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

deepseek_client = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

def test():
    # Let's take the first 3 items of the problematic page
    ocr_batch_payload = [
        {"id": "1", "japanese": "デザイナーＤｅｓｉｇｎｅｒ"},
        {"id": "2", "japanese": "し、"},
        {"id": "3", "japanese": "クリエイティブディレク。ＣｒｅａｄｉｏｅＤｉｃｔｏｒ"},
        {"id": "4", "japanese": "お前何してんの連絡しろ今すぐ"}
    ]
    
    target_language = "Tiếng Việt"
    genre = "Shounen (Hành động, nhiệt huyết)"
    tone = "Tự nhiên, đời thường, ngôn ngữ mạng"
    pronouns = "Tôi - Cậu (Bạn bè ngang hàng)"
    
    prompt = (
        f"Nhiệm vụ của bạn là dịch đoạn thoại truyện tranh sau sang {target_language}. "
        f"Thể loại: {genre}. Xưng hô: {pronouns}. Văn phong: {tone}. "
        f"Yêu cầu: Giữ nguyên văn phong truyện tranh tự nhiên. "
        f"Nếu {target_language} là tiếng Anh, hãy dùng tiếng lóng (slang) tự nhiên. "
        f"Nếu {target_language} là Tiếng Việt, giữ cấu trúc kính ngữ phù hợp. "
        f"Bạn BẮT BUỘC TRẢ VỀ FORMAT JSON chứa mảng 'translations', ví dụ: {{\\\"translations\\\": [{{\\\"id\\\": 1, \\\"translation\\\": \\\"bản dịch\\\"}}]}}. "
        f"Dữ liệu cần dịch: {json.dumps(ocr_batch_payload, ensure_ascii=False)}"
    )
    
    print("=== PROMPT ===")
    print(prompt)
    print("==============\n")
    
    try:
        response = deepseek_client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You output strict JSON containing a 'translations' array of dicts with 'id' and 'translation'."},
                {"role": "user", "content": prompt}
            ],
            response_format={'type': 'json_object'}
        )
        print("=== DEEPSEEK RESPONSE ===")
        print(response.choices[0].message.content)
        print("=========================")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test()
