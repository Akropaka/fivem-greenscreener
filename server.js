/// <reference types="@citizenfx/server" />

const PNG = require('pngjs').PNG;
const fs = require('fs');

const resName = GetCurrentResourceName();
const mainSavePath = `resources/${resName}/images`;
const config = JSON.parse(LoadResourceFile(GetCurrentResourceName(), "config.json"));

try {
	if (!fs.existsSync(mainSavePath)) {
		fs.mkdirSync(mainSavePath);
	}

	onNet('takeScreenshot', async (filename, type) => {
		const savePath = `${mainSavePath}/${type}`;
		if (!fs.existsSync(savePath)) {
			fs.mkdirSync(savePath);
		}

		const fullFilePath = savePath + "/" + filename + ".png";

		// Check if file exists and overwrite is disabled
		if (!config.overwriteExistingImages && fs.existsSync(fullFilePath)) {
			if (config.debug) {
				console.log(
					`DEBUG: Skipping existing file: ${filename}.png (overwriteExistingImages = false)`
				);
			}
			return;
		}

		if (config.debug) {
			console.log(`DEBUG: Processing screenshot: ${filename}.png`);
		}

		exports.screencapture.serverCapture(
			source,
			{
				encoding: 'png',
			},
			(imageDataBase64) => {
				try {
					// screencapture returns data URI format, extract base64 part
					let base64String = imageDataBase64;
					if (imageDataBase64.startsWith('data:')) {
						// Extract base64 part after comma
						base64String = imageDataBase64.split(',')[1];
						if (config.debug) {
							console.log(`DEBUG: Extracted base64 from data URI`);
						}
					}

					// Decode base64 to buffer
					const buffer = Buffer.from(base64String, 'base64');

					if (config.debug) {
						console.log(`DEBUG: Received buffer of size: ${buffer.length} bytes`);
					}

					// Parse PNG directly from buffer
					const png = new PNG();
					png.parse(buffer, (err, data) => {
						if (err) {
							console.error(`Error parsing PNG: ${err.message}`);
							return;
						}

						const width = data.width;
						const height = data.height;

						if (config.debug) {
							console.log(`DEBUG: Parsed PNG - Width: ${width}, Height: ${height}`);
						}

						// Apply greenscreen removal (make green pixels transparent)
						for (let i = 0; i < data.data.length; i += 4) {
							const r = data.data[i];
							const g = data.data[i + 1];
							const b = data.data[i + 2];

							if (g > r + b) {
								data.data[i] = 255;     // R
								data.data[i + 1] = 255; // G
								data.data[i + 2] = 255; // B
								data.data[i + 3] = 0;   // A = transparent
							}
						}

						// Find bounding box (crop area)
						let minX = width;
						let maxX = -1;
						let minY = height;
						let maxY = -1;

						for (let y = 0; y < height; y++) {
							for (let x = 0; x < width; x++) {
								const idx = (y * width + x) * 4;
								const alpha = data.data[idx + 3];

								if (alpha > 0) {
									minX = Math.min(minX, x);
									maxX = Math.max(maxX, x);
									minY = Math.min(minY, y);
									maxY = Math.max(maxY, y);
								}
							}
						}

						// Crop and save
						let pngToSave = data;
						if (maxX >= minX && maxY >= minY) {
							const cropWidth = maxX - minX + 1;
							const cropHeight = maxY - minY + 1;
							pngToSave = new PNG({ width: cropWidth, height: cropHeight });

							for (let y = 0; y < cropHeight; y++) {
								for (let x = 0; x < cropWidth; x++) {
									const srcIdx = ((minY + y) * width + (minX + x)) * 4;
									const dstIdx = (y * cropWidth + x) * 4;
									pngToSave.data[dstIdx] = data.data[srcIdx];
									pngToSave.data[dstIdx + 1] = data.data[srcIdx + 1];
									pngToSave.data[dstIdx + 2] = data.data[srcIdx + 2];
									pngToSave.data[dstIdx + 3] = data.data[srcIdx + 3];
								}
							}
						}

						pngToSave.pack().pipe(fs.createWriteStream(fullFilePath)).on('finish', () => {
							if (config.debug) {
								console.log(`DEBUG: Screenshot saved and processed: ${fullFilePath}`);
							}
						}).on('error', (err) => {
							console.error(`Error saving screenshot: ${err.message}`);
						});
					});
				} catch (err) {
					console.error(`Error processing screenshot: ${err.message}`);
				}
			}
		);
	});
} catch (error) {
	console.error(error.message);
}
