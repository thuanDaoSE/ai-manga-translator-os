#!/usr/bin/env python3
import sys
from system_quota import global_quota

def main():
    if len(sys.argv) > 1 and sys.argv[1] in ["--status", "-s", "status"]:
        status = global_quota.get_status()
        print("========================================")
        print("📊 DEEPKOMA SYSTEM QUOTA STATUS")
        print("========================================")
        print(f"Tổng giới hạn:   {status['total_limit']} trang")
        print(f"Đã sử dụng:      {status['used_pages']} trang")
        print(f"Còn lại:         {status['remaining_pages']} trang")
        print(f"Hết hạn mức:     {'CÓ (DỪNG PHỤC VỤ)' if status['is_exhausted'] else 'KHÔNG (HOẠT ĐỘNG)'}")
        print(f"Lần reset cuối:  {status['last_reset_at']}")
        print("========================================")
        return

    new_limit = 300
    if len(sys.argv) > 1:
        try:
            new_limit = int(sys.argv[1])
        except ValueError:
            pass

    status = global_quota.reset_quota(new_limit)
    print("========================================")
    print("🔄 DEEPKOMA SYSTEM QUOTA RESET SUCCESS")
    print("========================================")
    print(f"Đã đặt lại hạn mức: {status['remaining_pages']}/{status['total_limit']} trang miễn phí!")
    print(f"Thời gian reset:    {status['last_reset_at']}")
    print("Hệ thống đã sẵn sàng phục vụ!")
    print("========================================")

if __name__ == "__main__":
    main()
