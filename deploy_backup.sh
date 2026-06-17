#!/bin/bash
# ==============================================================================
# DeepKoma Rolling Backup & Double Encryption Script
# ==============================================================================
# Chế độ dừng script ngay lập tức nếu gặp lỗi
set -e

# Các tham số cấu hình mặc định (Có thể tùy chỉnh)
PROJECT_DIR="/home/deepkoma/deepkoma"
LOCAL_RAW_IMAGES_DIR="${PROJECT_DIR}/manga-backend/storage/raw_images"
# Lưu ý: Nếu muốn backup toàn bộ ảnh gốc tải lên của từng project, có thể cấu hình:
# LOCAL_RAW_IMAGES_DIR="${PROJECT_DIR}/manga-backend/workspace"

DB_CONTAINER="manga-postgres"
DB_USER="deepkoma"
DB_NAME="manga_studio"
BACKUP_TEMP_DIR="${PROJECT_DIR}/backup_temp"

# Thiết lập log file mặc định
LOG_FILE="/var/log/deepkoma_backup.log"

# Hàm in log
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1" >&2
}

# Đảm bảo thư mục temp tồn tại
mkdir -p "${BACKUP_TEMP_DIR}"

# Kiểm tra tham số truyền vào
if [ -z "$1" ]; then
    log_error "Vui lòng chỉ định chế độ backup: './deploy_backup.sh media' hoặc './deploy_backup.sh database'"
    exit 1
fi

MODE="$1"

# ------------------------------------------------------------------------------
# Chế độ 1: Đồng bộ Media tăng cường & Dọn dẹp cục bộ
# ------------------------------------------------------------------------------
if [ "$MODE" = "media" ]; then
    log_info "=== Bắt đầu tiến trình đồng bộ Media (Rclone gcrypt) ==="
    
    # Kiểm tra xem thư mục ảnh có tồn tại hay không
    if [ ! -d "$LOCAL_RAW_IMAGES_DIR" ]; then
        log_info "Thư mục ảnh gốc ${LOCAL_RAW_IMAGES_DIR} không tồn tại hoặc trống. Bỏ qua đồng bộ."
        exit 0
    fi

    # Tiến hành đồng bộ sang remote gcrypt
    log_info "Đang đồng bộ ảnh mới từ ${LOCAL_RAW_IMAGES_DIR} lên gcrypt..."
    # rclone copy sẽ chỉ copy những file mới hoặc thay đổi, không xóa file ở đích
    rclone copy "${LOCAL_RAW_IMAGES_DIR}" gcrypt: --verbose

    log_info "Đồng bộ thành công. Tiến hành dọn dẹp các tệp tin cũ cục bộ..."
    # Dọn dẹp ảnh cũ hơn 6 giờ (360 phút) để giải phóng bộ nhớ VPS
    # Sử dụng find tìm các tệp tin trong LOCAL_RAW_IMAGES_DIR, lọc file cũ hơn 6h và xóa
    find "${LOCAL_RAW_IMAGES_DIR}" -type f -mmin +360 -delete
    
    # Xóa các thư mục rỗng phát sinh nếu có (ngoại trừ thư mục cha)
    find "${LOCAL_RAW_IMAGES_DIR}" -mindepth 1 -type d -empty -delete || true

    log_info "=== Hoàn thành đồng bộ Media và dọn dẹp bộ nhớ VPS ==="

# ------------------------------------------------------------------------------
# Chế độ 2: Sao lưu Database & Cấu hình (AES-256 Encrypted)
# ------------------------------------------------------------------------------
elif [ "$MODE" = "database" ]; then
    log_info "=== Bắt đầu tiến trình sao lưu Database & Cấu hình ==="

    # Kiểm tra biến mật khẩu mã hóa
    if [ -z "$BACKUP_PASSWORD" ]; then
        log_error "Biến môi trường BACKUP_PASSWORD chưa được cấu hình. Tiến trình bị hủy."
        exit 1
    fi

    DATE_SUFFIX=$(date '+%Y%m%d')
    SQL_DUMP_FILE="${BACKUP_TEMP_DIR}/db_dump_${DATE_SUFFIX}.sql"
    TAR_ARCHIVE="${BACKUP_TEMP_DIR}/deepkoma_backup_${DATE_SUFFIX}.tar.gz"
    ENCRYPTED_FILE="${BACKUP_TEMP_DIR}/deepkoma_db_${DATE_SUFFIX}.enc"

    # 1. Trích xuất cơ sở dữ liệu từ container Docker
    log_info "Đang trích xuất dữ liệu từ container ${DB_CONTAINER} (DB: ${DB_NAME})..."
    if ! docker exec -t "${DB_CONTAINER}" pg_dump -U "${DB_USER}" "${DB_NAME}" > "${SQL_DUMP_FILE}"; then
        log_error "Không thể export database. Vui lòng kiểm tra Docker container hoặc thông tin DB."
        exit 1
    fi

    # 2. Kiểm tra tệp tin .env của backend có tồn tại hay không
    ENV_FILE="${PROJECT_DIR}/manga-backend/.env"
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Không tìm thấy file cấu hình .env tại: ${ENV_FILE}"
        # Dọn dẹp sql dump trước khi thoát
        rm -f "${SQL_DUMP_FILE}"
        exit 1
    fi

    # 3. Nén SQL Dump và tệp tin .env thành file .tar.gz
    log_info "Đang đóng gói file SQL dump và cấu hình .env..."
    tar -czf "${TAR_ARCHIVE}" -C "${BACKUP_TEMP_DIR}" "db_dump_${DATE_SUFFIX}.sql" -C "${PROJECT_DIR}/manga-backend" ".env"

    # 4. Mã hóa kép bằng OpenSSL với thuật toán AES-256-CBC, sử dụng pbkdf2
    log_info "Đang tiến hành mã hóa tệp tin nén (AES-256-CBC)..."
    export BACKUP_PASSWORD
    openssl enc -aes-256-cbc -pbkdf2 -salt -in "${TAR_ARCHIVE}" -out "${ENCRYPTED_FILE}" -pass env:BACKUP_PASSWORD

    # 5. Tải file mã hóa lên Google Drive (Remote gdrive thường, không mã hóa vì file đã được mã hóa thủ công)
    log_info "Đang upload tệp tin đã mã hóa lên gdrive:/DeepKoma_DB_Backup..."
    rclone copy "${ENCRYPTED_FILE}" gdrive:/DeepKoma_DB_Backup --verbose

    # 6. Dọn dẹp các bản sao lưu cũ trên Google Drive (quá 30 ngày)
    log_info "Đang quét và dọn dẹp các bản sao lưu cũ hơn 30 ngày trên Google Drive..."
    rclone delete gdrive:/DeepKoma_DB_Backup --min-age 30d
    rclone rmdirs gdrive:/DeepKoma_DB_Backup --min-age 30d || true

    # 7. Dọn dẹp các tệp tin trung gian cục bộ để tránh đầy ổ đĩa VPS
    log_info "Đang xóa các tệp tin sao lưu tạm thời cục bộ..."
    rm -f "${SQL_DUMP_FILE}" "${TAR_ARCHIVE}" "${ENCRYPTED_FILE}"

    log_info "=== Hoàn thành tiến trình sao lưu Database & Cấu hình thành công ==="

else
    log_error "Tham số không hợp lệ: '$MODE'. Chỉ hỗ trợ 'media' hoặc 'database'"
    exit 1
fi
