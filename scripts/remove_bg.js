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

            // Get the color of the top-left pixel to use as chroma key background
            const bgColor = image.getPixelColor(1, 1);
            const bgRgb = Jimp.intToRGBA(bgColor);

            const tolerance = 60; // Slightly higher tolerance for anti-aliased green edges

            image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
                const r = this.bitmap.data[idx + 0];
                const g = this.bitmap.data[idx + 1];
                const b = this.bitmap.data[idx + 2];
                const a = this.bitmap.data[idx + 3];

                if (
                    Math.abs(r - bgRgb.r) <= tolerance &&
                    Math.abs(g - bgRgb.g) <= tolerance &&
                    Math.abs(b - bgRgb.b) <= tolerance
                ) {
                    // Set alpha to 0 (transparent)
                    this.bitmap.data[idx + 3] = 0;
                }
            });

            await image.writeAsync(filePath);
            console.log(`Processed: ${file} (Chroma: ${bgRgb.r},${bgRgb.g},${bgRgb.b})`);
        } catch (e) {
            console.error(`Error processing ${file}:`, e.message);
        }
    }
}

processImages();
