const fs = require('fs');

const apiKey = "sk_p3OorBWr0XdE0VR70dcXAM552F-g7-PzQg4YBeRbqWU"; // <-- Dán key vào đây
const imagePath = "D:/Workspaces/VSCode-workspace/AI_Manga_Translator/testData/testHappyPath/test11.png";
const outputPath = "D:/Workspaces/VSCode-workspace/AI_Manga_Translator/testData/testHappyPath/test11_result.png";

async function testRemoveText() {
    try {
        console.log("1. Đang đọc ảnh và mã hóa Base64...");
        const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });

        console.log("2. Đang gửi lên Novita API (Remove Text)... Vui lòng đợi.");
        const response = await fetch('https://api.novita.ai/v3/remove-text', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_file: imageBase64
            })
        });

        const data = await response.json();

        if (response.ok && data.image_file) {
            console.log("3. Nhận kết quả thành công! Đang lưu ảnh...");
            // Giải mã Base64 trả về thành file ảnh
            fs.writeFileSync(outputPath, data.image_file, 'base64');
            console.log("🎉 XONG! Sếp mở ảnh tại:", outputPath);
        } else {
            console.error("❌ Lỗi từ API:", data);
        }
    } catch (error) {
        console.error("❌ Lỗi hệ thống:", error);
    }
}

testRemoveText();