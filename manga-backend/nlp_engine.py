import ahocorasick
import hashlib
import json

class TranslationEngine:
    def __init__(self, redis_client):
        self.redis = redis_client

    # ==========================================
    # 1. BỘ NHỚ ĐỆM CHÍNH XÁC (EXACT MATCH CACHE)
    # ==========================================
    async def get_exact_match(self, project_id: str, japanese_text: str):
        """Kiểm tra xem câu này đã từng dịch trong project này chưa"""
        # Băm câu tiếng Nhật thành mã SHA-256 để làm Key
        text_hash = hashlib.sha256(japanese_text.encode('utf-8')).hexdigest()
        cache_key = f"tm:exact:{project_id}:{text_hash}"
        
        # Tìm trong Redis
        cached_translation = await self.redis.get(cache_key)
        return cached_translation, cache_key

    async def save_exact_match(self, cache_key: str, vietnamese_text: str):
        """Lưu kết quả dịch vào Redis (Sống trong 30 ngày)"""
        await self.redis.set(cache_key, vietnamese_text, ex=2592000)

    # ==========================================
    # 2. THUẬT TOÁN AHO-CORASICK (QUÉT TỪ ĐIỂN SIÊU TỐC)
    # ==========================================
    def build_glossary_automaton(self, term_dict: dict):
        """
        Nhận vào 1 dictionary: {'螺旋丸': 'Rasengan', 'ナルト': 'Naruto'}
        Trả về 1 cỗ máy Automaton đã được biên dịch.
        """
        A = ahocorasick.Automaton()
        if not term_dict:
            return None
            
        for jap, vie in term_dict.items():
            A.add_word(jap, (jap, vie))
            
        A.make_automaton() # Biên dịch sang cỗ máy trạng thái hữu hạn
        return A

    def extract_relevant_terms(self, automaton, ocr_text: str):
        """
        Quét câu tiếng Nhật dài ngoằng, nhặt ra đúng các từ có trong từ điển
        chỉ bằng 1 vòng lặp duy nhất (O(N)).
        """
        if not automaton or not ocr_text:
            return {}
            
        found_terms = {}
        # Quét văn bản
        for end_index, (jap, vie) in automaton.iter(ocr_text):
            found_terms[jap] = vie
            
        return found_terms