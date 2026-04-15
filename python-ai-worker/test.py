from manga_ocr import MangaOcr

# Khởi tạo mô hình
print("Đang khởi động AI manga-ocr...")
mocr = MangaOcr()

# Thay chữ 'test.jpg' bằng tên file ảnh của bạn
ket_qua = mocr('crop.jpg') 

print("\n--- KẾT QUẢ ĐỌC CHỮ ---")
print(ket_qua)
print("-----------------------")