import sharp from 'sharp';

const PROFILE_NAMES = ['original', 'grayscale', 'normalize', 'threshold', 'upscale'];
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_PROCESSED_LONG_EDGE = 3600;
const MAX_PROCESSED_PIXELS = 12_000_000;
const UPSCALE_FACTOR = 1.5;
const THRESHOLD_LEVEL = 170;

const MIME_TYPES = {
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
};

class OcrImagePreprocessor {
    constructor({
        maxInputPixels = MAX_INPUT_PIXELS,
        maxProcessedLongEdge = MAX_PROCESSED_LONG_EDGE,
        maxProcessedPixels = MAX_PROCESSED_PIXELS,
        upscaleFactor = UPSCALE_FACTOR,
        thresholdLevel = THRESHOLD_LEVEL
    } = {}) {
        this.maxInputPixels = maxInputPixels;
        this.maxProcessedLongEdge = maxProcessedLongEdge;
        this.maxProcessedPixels = maxProcessedPixels;
        this.upscaleFactor = upscaleFactor;
        this.thresholdLevel = thresholdLevel;
    }

    listProfiles() {
        return [...PROFILE_NAMES];
    }

    async preprocess({buffer, mimeType, profile}) {
        if (!PROFILE_NAMES.includes(profile)) {
            const error = new Error(`Unknown OCR preprocessing profile: ${profile}`);
            error.statusCode = 400;
            throw error;
        }
        const startedAt = Date.now();
        const metadata = await this.metadata(buffer);
        const inputDimensions = this.dimensions(metadata);

        if (profile === 'original') {
            return {
                profile,
                buffer,
                mimeType: mimeType || MIME_TYPES[metadata.format] || 'application/octet-stream',
                inputDimensions,
                processedDimensions: inputDimensions,
                preprocessingDurationMs: 0
            };
        }

        const pipeline = this.createPipeline(buffer);
        this.applyProfile(pipeline, profile, inputDimensions);
        const {data, info} = await pipeline
            .png({compressionLevel: 6})
            .toBuffer({resolveWithObject: true});

        return {
            profile,
            buffer: data,
            mimeType: 'image/png',
            inputDimensions,
            processedDimensions: {
                width: info.width,
                height: info.height
            },
            preprocessingDurationMs: Date.now() - startedAt
        };
    }

    async metadata(buffer) {
        const metadata = await this.createPipeline(buffer).metadata();
        if (!metadata.width || !metadata.height) {
            throw new Error('Could not read image dimensions');
        }
        return metadata;
    }

    createPipeline(buffer) {
        return sharp(buffer, {
            limitInputPixels: this.maxInputPixels,
            failOn: 'error'
        }).rotate();
    }

    applyProfile(pipeline, profile, inputDimensions) {
        if (profile === 'grayscale') {
            pipeline.grayscale();
            return;
        }
        if (profile === 'normalize') {
            pipeline.grayscale().normalize();
            return;
        }
        if (profile === 'threshold') {
            pipeline.grayscale().threshold(this.thresholdLevel);
            return;
        }
        if (profile === 'upscale') {
            const size = this.upscaledDimensions(inputDimensions);
            pipeline
                .grayscale()
                .normalize()
                .resize({
                    width: size.width,
                    height: size.height,
                    fit: 'fill',
                    kernel: 'lanczos3',
                    withoutEnlargement: false
                });
        }
    }

    upscaledDimensions({width, height}) {
        const inputLongEdge = Math.max(width, height);
        const longEdge = Math.min(
            Math.round(inputLongEdge * this.upscaleFactor),
            this.maxProcessedLongEdge
        );
        const longEdgeScale = longEdge / inputLongEdge;
        const pixelScale = Math.sqrt(this.maxProcessedPixels / (width * height));
        const scale = Math.max(1, Math.min(longEdgeScale, pixelScale));
        return {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale))
        };
    }

    dimensions(metadata) {
        return {
            width: Number(metadata.width),
            height: Number(metadata.height)
        };
    }
}

export default new OcrImagePreprocessor();
export {
    OcrImagePreprocessor,
    PROFILE_NAMES,
    MAX_INPUT_PIXELS,
    MAX_PROCESSED_LONG_EDGE,
    MAX_PROCESSED_PIXELS,
    UPSCALE_FACTOR,
    THRESHOLD_LEVEL
};
