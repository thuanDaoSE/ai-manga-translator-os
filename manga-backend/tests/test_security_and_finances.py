"""
# Purpose: Kiểm thử tự động toàn diện các bản vá bảo mật và tài chính (Security & Financial Integrity)
# Status / Result: PASSED (STABLE REUSABLE SCRIPT)
# Execution Details:
# - Chống Path Traversal trên /workspace/ và SPA router
# - Xác thực JWT nghiêm ngặt & Chặn truy cập unauthenticated
# - Chặn nạp tiền bằng số âm (Negative balance deduction exploit)
# - Kiểm tra số dư tối thiểu (Pre-flight balance check)
# - Chống SSRF trong fetch_image_from_url
"""

import os
import sys
import unittest
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

# Đảm bảo cờ DEV MOCK tắt để test bảo mật thật
os.environ["ALLOW_DEV_MOCK_AUTH"] = "false"
os.environ["SUPABASE_JWT_SECRET"] = os.getenv("SUPABASE_JWT_SECRET", "mock_dummy_supabase_jwt_secret_for_unit_tests_only_32bytes")

from s3_utils import is_safe_url

class TestSecurityAndFinances(unittest.TestCase):
    def test_ssrf_protection(self):
        """Kiểm tra hàm chống SSRF"""
        self.assertFalse(is_safe_url("http://127.0.0.1:8080"))
        self.assertFalse(is_safe_url("http://localhost:3000"))
        self.assertFalse(is_safe_url("http://169.254.169.254/latest/meta-data/"))
        self.assertFalse(is_safe_url("http://10.0.0.1/admin"))
        self.assertFalse(is_safe_url("http://192.168.1.1/secret"))
        self.assertFalse(is_safe_url("ftp://example.com/file"))
        self.assertTrue(is_safe_url("https://pub-r2.deepkoma.pro/image.png"))

    def test_negative_deduction_blocked(self):
        """Kiểm tra hàm deduct_balance không cộng tiền khi truyền số âm"""
        async def run_test():
            from main import deduct_balance
            from db_models import User
            
            mock_db = AsyncMock()
            mock_user = User(id="test_user", balance_seconds=100.0)
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_user
            mock_db.execute.return_value = mock_result
            
            # Thử truyền số âm (-500)
            user = await deduct_balance(mock_db, "test_user", -500.0, "Test Exploit")
            # Số dư phải giữ nguyên 100.0, tuyệt đối không được tăng thành 600.0!
            self.assertEqual(user.balance_seconds, 100.0)
        asyncio.run(run_test())

    def test_check_balance_preflight(self):
        """Kiểm tra hàm check_balance_before_task chặn khi không đủ số dư tối thiểu"""
        async def run_test():
            from main import check_balance_before_task
            from db_models import User
            from fastapi import HTTPException
            
            mock_db = AsyncMock()
            mock_user = User(id="test_user", balance_seconds=2.0, is_pro=False)
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_user
            mock_db.execute.return_value = mock_result
            
            # Đòi hỏi tối thiểu 15s, số dư chỉ có 2.0s -> phải bắn HTTPException(402)
            with self.assertRaises(HTTPException) as ctx:
                await check_balance_before_task(mock_db, "test_user", min_balance=15.0)
            self.assertEqual(ctx.exception.status_code, 402)
        asyncio.run(run_test())

    def test_path_traversal_workspace_blocked(self):
        """Kiểm tra endpoint /workspace/{file_path:path} chặn Path Traversal"""
        async def run_test():
            import httpx
            from main import app
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # Thử đọc trộm .env qua Path Traversal
                resp = await client.get("/workspace/../.env")
                self.assertIn(resp.status_code, (404, 403))
                self.assertNotIn("SUPABASE_JWT_SECRET", resp.text)
        asyncio.run(run_test())

    def test_jwt_verification_rejects_unauthenticated(self):
        """Kiểm tra request không có JWT bị từ chối 401 khi không bật dev mock"""
        async def run_test():
            import httpx
            from main import app
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # Gọi các API được bảo vệ mà không có token
                resp_projects = await client.get("/api/projects")
                self.assertEqual(resp_projects.status_code, 401)
                
                resp_copilot = await client.post("/api/copilot/chat", json={"japanese": "こんにちは", "text": "Chào", "action": "natural"})
                self.assertEqual(resp_copilot.status_code, 401)
        asyncio.run(run_test())

if __name__ == "__main__":
    unittest.main()
