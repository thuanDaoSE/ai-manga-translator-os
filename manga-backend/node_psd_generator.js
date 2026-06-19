const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');
require('ag-psd/initialize-canvas');
const { readPsd, writePsdBuffer } = require('ag-psd');

// =========================================================================
// 🚀 NẠP FONT VẬT LÝ: ĐỂ NODE.JS ĐO CHÍNH XÁC ĐỘ RỘNG CHỮ PHỤC VỤ TỰ Enter
// =========================================================================
const FONT_FILES = {
    "Comic Neue": "fonts/ComicNeue-Regular.ttf",
    "Playpen Sans": "fonts/PlaypenSans-Regular.ttf",
    "Itim": "fonts/Itim-Regular.ttf",
    "Be Vietnam Pro": "fonts/BeVietnamPro-Regular.ttf",
    "Patrick Hand": "fonts/PatrickHand-Regular.ttf",
    "Balsamiq Sans": "fonts/BalsamiqSans-Regular.ttf",
    "Playwrite VN": "fonts/PlaywriteVN-Regular.ttf",
    "Caveat": "fonts/Caveat-Regular.ttf",
    "Bangers": "fonts/Bangers-Regular.ttf",
    "Bungee": "fonts/Bungee-Regular.ttf",
    "Sedgwick Ave Display": "fonts/SedgwickAveDisplay-Regular.ttf",
    "Fredoka": "fonts/Fredoka-Regular.ttf",
    "Caveat Brush": "fonts/CaveatBrush-Regular.ttf",
    "Rubik Wet Paint": "fonts/RubikWetPaint-Regular.ttf",
    "Rubik Glitch": "fonts/RubikGlitch-Regular.ttf",
    "Wild Words": "fonts/WildWords-Regular.ttf"
};

for (const [familyName, filePath] of Object.entries(FONT_FILES)) {
    if (fs.existsSync(filePath)) registerFont(filePath, { family: familyName });
}

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

// =========================================================================
// 🚀 THUẬT TOÁN TỰ ĐỘNG CHÈN DẤU ENTER NẰM TRONG DIỆN TÍCH KHUNG 
// =========================================================================
function autoWrapText(ctx, text, maxWidth, fontSize, fontFamily) {
    ctx.font = `${fontSize}px "${fontFamily}"`;
    const paragraphs = text.split('\n');
    const lines = [];

    for (const paragraph of paragraphs) {
        if (!paragraph.trim()) { lines.push(''); continue; }
        const words = paragraph.split(' ');
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
    }
    return lines.join('\r');
}

async function createPsd() {
    const payloadPath = process.argv[2];
    const data = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

    const templatePath = path.join(__dirname, 'template.psd');
    if (!fs.existsSync(templatePath)) {
        console.error("LỖI: Sếp chưa quăng file template.psd vào thư mục này!");
        process.exit(1);
    }
    const templateBuffer = fs.readFileSync(templatePath);
    const psdTemplate = readPsd(templateBuffer);

    const sampleLayer = psdTemplate.children.find(l => l.name === 'TemplateText' && l.text);
    if (!sampleLayer) {
        console.error("LỖI: Trong template.psd sếp phải tạo 1 layer chữ đặt tên chuẩn là 'TemplateText'");
        process.exit(1);
    }
    delete sampleLayer.canvas;

    const measureCanvas = createCanvas(100, 100);
    const ctx = measureCanvas.getContext('2d');

    const textLayers = [];

    data.bubbles.forEach((bubble, idx) => {
        if (!bubble.text || bubble.text.trim() === '') return;

        let x = Number(bubble.x) || 0;
        let y = Number(bubble.y) || 0;
        let w = Number(bubble.w) || 100;
        let h = Number(bubble.h) || 100;
        let outlineW = Number(bubble.outlineWidth) || 0;
        let fontSize = Number(bubble.fontSize) || 24;
        let fontCurrent = bubble.fontFamily || 'Arial';
        // Chuẩn hóa tên font (xóa dấu nháy và fallback như 'Comic Neue', cursive -> Comic Neue)
        fontCurrent = fontCurrent.replace(/['"]/g, '').split(',')[0].trim();
        let psFontName = 'ArialMT'; // Mặc định nếu không khớp font nào

        // Chuyển hết về chữ thường để so sánh cho chuẩn, tránh lệch hoa thường, dấu cách
        const cleanFontTarget = fontCurrent.toLowerCase();

        if (cleanFontTarget.includes('comic') && cleanFontTarget.includes('neue')) {
            // 🚀 ÉP THẲNG VỀ CHUỖI NHỊ PHÂN PHOTOSHOP THÈM KHÁT
            psFontName = "ComicNeue-Regular";
        } else if (cleanFontTarget.includes('playpen')) {
            psFontName = "PlaypenSans-Regular";
        } else if (cleanFontTarget.includes('itim')) {
            psFontName = "Itim-Regular";
        } else if (cleanFontTarget.includes('vietnam')) {
            psFontName = "BeVietnamPro-Regular";
        } else if (cleanFontTarget.includes('patrick')) {
            psFontName = "PatrickHand-Regular";
        } else if (cleanFontTarget.includes('balsamiq')) {
            psFontName = "BalsamiqSans-Regular";
        } else if (cleanFontTarget.includes('bangers')) {
            psFontName = "Bangers-Regular";
        } else if (cleanFontTarget.includes('wild')) {
            psFontName = "WildWords-Regular";
        } else {
            psFontName = FONT_POSTSCRIPT_MAP[fontCurrent] || fontCurrent || 'ArialMT';
        }

        // 🚀 BẢN VÁ TỐI THƯỢNG: Nhân bản SÂU layer mẫu để giữ lại toàn bộ metadata gốc của Photoshop
        let newLayer = JSON.parse(JSON.stringify(sampleLayer));
        delete newLayer.canvas;
        delete newLayer.id;

        newLayer.name = `Thoai ${String(idx + 1).padStart(2, '0')} [${bubble.text.substring(0, 5)}...]`;

        newLayer.left = x;
        newLayer.top = y;
        newLayer.right = x + w;
        newLayer.bottom = y + h;

        const wrappedText = autoWrapText(ctx, bubble.text, w, fontSize, fontCurrent);
        let centerX = x + (w / 2);
        let centerY = y + (h / 2);

        newLayer.text.text = wrappedText;
        newLayer.text.bounds = {
            left: { value: 0, units: 'Pixels' },
            top: { value: 0, units: 'Pixels' },
            right: { value: w, units: 'Pixels' },
            bottom: { value: h, units: 'Pixels' }
        };
        newLayer.text.transform = [1, 0, 0, 1, centerX, centerY];

        if (!newLayer.text.style) newLayer.text.style = {};
        newLayer.text.style.font = { name: psFontName };
        newLayer.text.style.fontSize = fontSize;
        newLayer.text.style.fillColor = hexToRgb(bubble.fontColor || '#000000');

        if (!newLayer.text.paragraphStyle) newLayer.text.paragraphStyle = {};
        newLayer.text.paragraphStyle.justification = bubble.textAlign || 'center';

        delete newLayer.text.styleRuns;
        delete newLayer.text.paragraphStyleRuns;

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
                color: hexToRgb(bubble.outlineColor || '#FFFFFF'),
                present: true,
                showInDialog: true
            }];
        } else {
            if (newLayer.effects) delete newLayer.effects.stroke;
        }

        textLayers.push(newLayer);
    });

    const rawImg = await loadImage(data.raw_img_path);
    const cleanImg = await loadImage(data.clean_img_path);
    const rawCanvas = createCanvas(rawImg.width, rawImg.height);
    rawCanvas.getContext('2d').drawImage(rawImg, 0, 0);
    const cleanCanvas = createCanvas(cleanImg.width, cleanImg.height);
    cleanCanvas.getContext('2d').drawImage(cleanImg, 0, 0);

    const finalPsd = {
        width: rawImg.width, height: rawImg.height, channels: 3, bitsPerChannel: 8, colorMode: 3,
        children: [
            { name: "[1] Raw (Ban Goc)", canvas: rawCanvas },
            { name: "[2] Clean (Da Xoa Chu)", canvas: cleanCanvas },
            { name: "[3] Text (Tu Dong)", opened: true, children: textLayers }
        ]
    };

    const buffer = writePsdBuffer(finalPsd, { invalidateTextLayers: true });
    fs.writeFileSync(data.output_psd_path, Buffer.from(buffer));
}

createPsd().catch(err => { console.error("LỖI NODEJS:", err); process.exit(1); });