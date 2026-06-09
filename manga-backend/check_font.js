const fs = require('fs');
const { createCanvas } = require('canvas');
// Bắt buộc phải có dòng này để ag-psd không bị crash khi đọc file
require('ag-psd/initialize-canvas');
const { readPsd } = require('ag-psd');

// Đọc file template sếp vừa lưu bằng Photoshop
const templateBuffer = fs.readFileSync('template.psd');
const psdTemplate = readPsd(templateBuffer);

// Tìm layer TemplateText
const sampleLayer = psdTemplate.children.find(l => l.name === 'TemplateText' && l.text);

if (sampleLayer && sampleLayer.text && sampleLayer.text.style) {
    console.log("======================================================");
    console.log("🚀 TÊN FONT CHUẨN CẦN ĐIỀN VÀO CODE LÀ:");
    console.log(`"${sampleLayer.text.style.font.name}"`);
    console.log("======================================================");
} else {
    console.log("Không tìm thấy layer hoặc cấu trúc text!");
}