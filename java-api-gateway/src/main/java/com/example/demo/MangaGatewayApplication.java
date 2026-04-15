package com.example.demo;

import com.example.demo.entity.TranslationRecord;
import com.example.demo.repository.TranslationRecordRepository;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

@SpringBootApplication
public class MangaGatewayApplication implements CommandLineRunner {

    // Tiêm (Inject) công cụ giao tiếp với Database vào đây
    @Autowired
    private TranslationRecordRepository repository;

    public static void main(String[] args) {
        SpringApplication.run(MangaGatewayApplication.class, args);
    }

    @Override
    public void run(String... args) throws Exception {
        System.out.println("=========================================");
        System.out.println("🚀 Nhạc trưởng Java đang gọi Công nhân Python...");

        // 1. Khởi tạo công cụ gọi HTTP
        RestTemplate restTemplate = new RestTemplate();
        String pythonApiUrl = "http://127.0.0.1:8000/api/ocr";

        // 2. Trỏ đường dẫn đến file ảnh crop
        String imagePath = "D:\\Workspaces\\VSCode-workspace\\AI_Manga_Translator\\python-ai-worker\\crop.jpg";
        FileSystemResource file = new FileSystemResource(imagePath);

        // 3. Đóng gói file thành dạng Multipart Form-Data
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", file);

        HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

        // 4. Bắn Request sang Python và nhận kết quả
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(pythonApiUrl, requestEntity, String.class);
            String jsonResponse = response.getBody();

            System.out.println("✅ Kết quả JSON từ Python trả về:");
            System.out.println(jsonResponse);

            // --- ĐÂY LÀ PHẦN MỚI CỦA BƯỚC 3 ---
            // 5. Bóc tách JSON và Lưu vào PostgreSQL
            JSONObject obj = new JSONObject(jsonResponse);
            String extractedText = obj.getString("text");
            String fileName = obj.getString("filename");

            TranslationRecord record = new TranslationRecord();
            record.setOriginalFileName(fileName);
            record.setJapaneseText(extractedText);
            record.setTranslatedText("Đang chờ dịch..."); // Tạm để đây chờ LLM

            // Lệnh này tương đương với câu SQL: INSERT INTO translation_records...
            repository.save(record);

            System.out.println("✅ Đã lưu kết quả vào Database PostgreSQL thành công!");
            System.out.println("📌 Mã bản ghi vừa lưu (ID): " + record.getId());

        } catch (Exception e) {
            System.err.println("❌ Lỗi kết nối hoặc lỗi Database!");
            System.err.println("Chi tiết lỗi: " + e.getMessage());
        }
        System.out.println("=========================================");
    }
}