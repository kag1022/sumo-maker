const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '../public/images/rikishi');

async function processImages() {
    const files = fs.readdirSync(TARGET_DIR).filter(f => f.endsWith('.png'));

    for (const file of files) {
        const filePath = path.join(TARGET_DIR, file);
        try {
            const image = await Jimp.read(filePath);
            const bgHex = image.getPixelColor(0, 0); // top left pixel
            const bgRgb = Jimp.intToRGBA(bgHex);

            const tolerance = 90; // 少し強めに緑を抜く

            image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
                const r = this.bitmap.data[idx + 0];
                const g = this.bitmap.data[idx + 1];
                const b = this.bitmap.data[idx + 2];

                if (Math.abs(r - bgRgb.r) < tolerance &&
                    Math.abs(g - bgRgb.g) < tolerance &&
                    Math.abs(b - bgRgb.b) < tolerance) {
                    this.bitmap.data[idx + 3] = 0; // alpha to 0
                }
            });
            await image.writeAsync(filePath);
            console.log(`Processed: ${file}`);
        } catch (e) {
            console.error(e);
        }
    }
}
processImages();
