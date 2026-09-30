import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import {
    OcrImagePreprocessor,
    MAX_PROCESSED_LONG_EDGE,
    MAX_PROCESSED_PIXELS,
    PROFILE_NAMES
} from '../src/ocr/OcrImagePreprocessor.js';

const syntheticReceipt = async ({width = 360, height = 720} = {}) => sharp({
    create: {
        width,
        height,
        channels: 3,
        background: '#ffffff'
    }
})
    .composite([
        {
            input: Buffer.from(`<svg width="${width}" height="${height}">
                <rect x="24" y="48" width="${Math.max(40, width - 80)}" height="18" fill="black"/>
                <rect x="24" y="120" width="${Math.max(40, width - 140)}" height="12" fill="black"/>
                <rect x="24" y="172" width="${Math.max(40, width - 110)}" height="12" fill="black"/>
                <rect x="24" y="260" width="${Math.max(40, width - 180)}" height="18" fill="black"/>
                <rect x="24" y="330" width="${Math.max(40, width - 100)}" height="6" fill="black"/>
            </svg>`)
        }
    ])
    .jpeg({quality: 90})
    .toBuffer();

const metadata = buffer => sharp(buffer).metadata();

test('original profile leaves receipt image buffer logically unchanged', async () => {
    const source = await syntheticReceipt();
    const preprocessor = new OcrImagePreprocessor();

    const result = await preprocessor.preprocess({
        buffer: source,
        mimeType: 'image/jpeg',
        profile: 'original'
    });

    assert.equal(result.buffer, source);
    assert.equal(Buffer.compare(result.buffer, source), 0);
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.preprocessingDurationMs, 0);
    assert.deepEqual(result.inputDimensions, result.processedDimensions);
});

test('grayscale normalize and threshold profiles produce valid OCR-compatible PNG images', async () => {
    const source = await syntheticReceipt();
    const preprocessor = new OcrImagePreprocessor();

    for (const profile of ['grayscale', 'normalize', 'threshold']) {
        const result = await preprocessor.preprocess({
            buffer: source,
            mimeType: 'image/jpeg',
            profile
        });
        const info = await metadata(result.buffer);

        assert.equal(result.mimeType, 'image/png');
        assert.equal(info.format, 'png');
        assert.equal(info.width, result.processedDimensions.width);
        assert.equal(info.height, result.processedDimensions.height);
        assert.equal(result.inputDimensions.width, 360);
        assert.equal(result.inputDimensions.height, 720);
    }
});

test('upscale profile respects maximum dimensions and pixel budget', async () => {
    const source = await syntheticReceipt({width: 3200, height: 3200});
    const preprocessor = new OcrImagePreprocessor();

    const result = await preprocessor.preprocess({
        buffer: source,
        mimeType: 'image/jpeg',
        profile: 'upscale'
    });
    const {width, height} = result.processedDimensions;

    assert.ok(Math.max(width, height) <= MAX_PROCESSED_LONG_EDGE);
    assert.ok(width * height <= MAX_PROCESSED_PIXELS);
    assert.ok(width >= result.inputDimensions.width);
    assert.ok(height >= result.inputDimensions.height);
});

test('preprocessing never overwrites or mutates the source receipt image', async () => {
    const source = await syntheticReceipt();
    const before = Buffer.from(source);
    const preprocessor = new OcrImagePreprocessor();

    const result = await preprocessor.preprocess({
        buffer: source,
        mimeType: 'image/jpeg',
        profile: 'normalize'
    });

    assert.equal(Buffer.compare(source, before), 0);
    assert.notEqual(result.buffer, source);
    assert.notEqual(Buffer.compare(result.buffer, source), 0);
});

test('preprocessor uses buffers and does not return temporary file paths', async () => {
    const source = await syntheticReceipt();
    const preprocessor = new OcrImagePreprocessor();

    const result = await preprocessor.preprocess({
        buffer: source,
        mimeType: 'image/jpeg',
        profile: 'threshold'
    });

    assert.ok(Buffer.isBuffer(result.buffer));
    assert.equal(Object.hasOwn(result, 'filePath'), false);
    assert.equal(Object.hasOwn(result, 'tempPath'), false);
});

test('invalid preprocessing profile is rejected', async () => {
    const source = await syntheticReceipt();
    const preprocessor = new OcrImagePreprocessor();

    await assert.rejects(() => preprocessor.preprocess({
        buffer: source,
        mimeType: 'image/jpeg',
        profile: 'deskew-everything'
    }), /Unknown OCR preprocessing profile/);
});

test('preprocessing profile list stays bounded for the experiment', () => {
    assert.deepEqual(PROFILE_NAMES, ['original', 'grayscale', 'normalize', 'threshold', 'upscale']);
});
