const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
require('ag-psd/initialize-canvas');
const { readPsd, writePsdBuffer } = require('ag-psd');

// Bảng map tên Font (Cho chuẩn quy tắc Photoshop)
const FONT_POSTSCRIPT_MAP = {
    "Comic Neue": "ComicNeue-Regular", "Playpen Sans": "PlaypenSans-Regular", "Itim": "Itim-Regular",
    "Be Vietnam Pro": "BeVietnamPro-Regular", "Patrick Hand": "PatrickHand-Regular", "Balsamiq Sans": "BalsamiqSans-Regular",
    "Playwrite VN": "PlaywriteVN-Regular", "Caveat": "Caveat-Regular", "Bangers": "Bangers-Regular",
    "Bungee": "Bungee-Regular", "Sedgwick Ave Display": "SedgwickAveDisplay-Regular", "Fredoka": "Fredoka-Regular",
    "Caveat Brush": "CaveatBrush-Regular", "Rubik Wet Paint": "RubikWetPaint-Regular", "Rubik Glitch": "RubikGlitch-Regular",
    "Wild Words": "WildWords-Regular"
};

function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return { r: parseInt(hex.substring(0, 2), 16), g: parseInt(hex.substring(2, 4), 16), b: parseInt(hex.substring(4, 6), 16) };
}

async function createPsd() {
    const payloadPath = process.argv[2];
    const data = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

    // 🚀 1. ĐỌC FILE TEMPLATE GỐC (Chứa mã nhị phân xịn của Adobe)
    const templatePath = path.join(__dirname, 'template.psd');
    if (!fs.existsSync(templatePath)) {
        console.error("LỖI: Sếp chưa quăng file template.psd vào thư mục này!");
        process.exit(1);
    }
    const templateBuffer = fs.readFileSync(templatePath);
    const psdTemplate = readPsd(templateBuffer);

    // 🚀 2. TÌM LAYER MẪU "TemplateText"
    const sampleLayer = psdTemplate.children.find(l => l.name === 'TemplateText' && l.text);
    if (!sampleLayer) {
        console.error("LỖI: Trong template.psd sếp phải tạo 1 layer chữ đặt tên chuẩn là 'TemplateText'");
        process.exit(1);
    }

    const textLayers = [];

    data.bubbles.forEach((bubble, idx) => {
        if (!bubble.text || bubble.text.trim() === '') return;

        // 🚀 3. NHÂN BẢN LAYER MẪU (Copy Deep)
        let newLayer = JSON.parse(JSON.stringify(sampleLayer));
        newLayer.name = `Thoai ${String(idx + 1).padStart(2, '0')} [${bubble.text.substring(0, 5)}...]`;

        let x = Number(bubble.x) || 0;
        let y = Number(bubble.y) || 0;
        let w = Number(bubble.w) || 100;
        let h = Number(bubble.h) || 100;
        let outlineW = Number(bubble.outlineWidth) || 0;

        // Can thiệp Sửa Tọa Độ (Dời khung Box Text)
        newLayer.left = x;
        newLayer.top = y;
        newLayer.right = x + w;
        newLayer.bottom = y + h;

        newLayer.text.bounds = { left: x, top: y, right: x + w, bottom: y + h };
        if (newLayer.text.transform) newLayer.text.transform = [1, 0, 0, 1, 0, 0];

        // Can thiệp Sửa Chữ và Font
        newLayer.text.text = bubble.text;
        newLayer.text.style.font = { name: FONT_POSTSCRIPT_MAP[bubble.fontFamily] || bubble.fontFamily || 'ArialMT' };
        newLayer.text.style.fontSize = Number(bubble.fontSize) || 24;
        newLayer.text.style.fillColor = hexToRgb(bubble.fontColor || '#000000');
        newLayer.text.paragraphStyle.justification = bubble.textAlign || 'center';

        // Can thiệp Cập nhật độ dày Stroke (nếu người dùng thay đổi trên web)
        if (outlineW > 0) {
            if (!newLayer.effects) newLayer.effects = {};
            newLayer.effects.disabled = false;
            newLayer.effects.stroke = [{
                enabled: true,
                position: 'outside',
                fillType: 'solid',
                blendMode: 'normal',
                opacity: 1.0,
                size: outlineW,
                color: hexToRgb(bubble.outlineColor || '#FFFFFF')
            }];
        } else {
            if (newLayer.effects) newLayer.effects.stroke = undefined;
        }

        // 🚀 4. QUAN TRỌNG NHẤT: Xóa bộ nhớ đệm ảnh cũ để lừa Photoshop
        newLayer.canvas = undefined;

        textLayers.push(newLayer);
    });

    // 🚀 5. GỘP CÁC LỚP ẢNH LẠI
    const rawImg = await loadImage(data.raw_img_path);
    const cleanImg = await loadImage(data.clean_img_path);
    const rawCanvas = createCanvas(rawImg.width, rawImg.height);
    rawCanvas.getContext('2d').drawImage(rawImg, 0, 0);
    const cleanCanvas = createCanvas(cleanImg.width, cleanImg.height);
    cleanCanvas.getContext('2d').drawImage(cleanImg, 0, 0);

    const finalPsd = {
        width: rawImg.width, height: rawImg.height, channels: 3, bitsPerChannel: 8, colorMode: 3,
        children: [
            { name: "[3] Text (Tu Dong)", opened: true, children: textLayers },
            { name: "[2] Clean (Da Xoa Chu)", canvas: cleanCanvas },
            { name: "[1] Raw (Ban Goc)", canvas: rawCanvas }
        ]
    };

    // 🚀 6. ĐÓNG GÓI VỚI CỜ "INVALIDATE" BẮT PHOTOSHOP TỰ VẼ LẠI
    const buffer = writePsdBuffer(finalPsd, { invalidateTextLayers: true });
    fs.writeFileSync(data.output_psd_path, Buffer.from(buffer));
}

createPsd().catch(err => { console.error("LỖI NODEJS:", err); process.exit(1); });