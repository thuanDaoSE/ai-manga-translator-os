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

        // 2. Trỏ đường dẫn đến file ảnh crop
        String imagePath = "D:\\Workspaces\\VSCode-workspace\\AI_Manga_Translator\\python-ai-worker\\test.jpg";
        FileSystemResource file = new FileSystemResource(imagePath);

        // 3. Đóng gói file thành dạng Multipart Form-Data
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", file);

        HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

        // 4. Bắn Request sang Python và nhận kết quả
        // 4. Bắn Request sang Python và nhận kết quả
        try {
            // Lưu ý: Đổi URL API thành đường link mới của Python
            String pythonApiUrl = "http://127.0.0.1:8000/api/translate-page";

            ResponseEntity<String> response = restTemplate.postForEntity(pythonApiUrl, requestEntity, String.class);
            String jsonResponse = response.getBody();

            System.out.println("✅ Kết quả JSON từ Python trả về thành công!");

            // 5. Bóc tách JSON Mảng và Lưu vào PostgreSQL
            org.json.JSONObject obj = new org.json.JSONObject(jsonResponse);
            org.json.JSONArray dataArray = obj.getJSONArray("data");
            String fileName = obj.getString("file_name");

            System.out.println("📌 Bắt đầu lưu " + dataArray.length() + " khung thoại vào Database...");

            // Dùng vòng lặp để duyệt qua 13 khung thoại
            for (int i = 0; i < dataArray.length(); i++) {
                org.json.JSONObject bubble = dataArray.getJSONObject(i);

                String originalText = bubble.getString("japanese");
                String translatedText = bubble.getString("vietnamese");

                // Lấy tọa độ (Bạn có thể thêm cột tọa độ vào Database sau này nếu thích)
                // org.json.JSONObject coords = bubble.getJSONObject("box_coordinates");

                TranslationRecord record = new TranslationRecord();
                record.setOriginalFileName(fileName);
                record.setJapaneseText(originalText);
                record.setTranslatedText(translatedText);

                repository.save(record);
            }

            System.out.println("✅ Đã lưu toàn bộ trang truyện vào Database PostgreSQL thành công!");

        } catch (Exception e) {
            System.err.println("❌ Lỗi kết nối hoặc lỗi Database!");
            System.err.println("Chi tiết lỗi: " + e.getMessage());
            e.printStackTrace();
        }
        System.out.println("=========================================");
    }
}