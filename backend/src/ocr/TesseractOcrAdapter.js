import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_LANGUAGE = 'ukr+eng';
const DEFAULT_TIMEOUT_MS = 60000;

const EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

class TesseractOcrAdapter {
    constructor({
        binary = process.env.TESSERACT_BINARY || 'tesseract',
        language = process.env.OCR_LANGUAGE || DEFAULT_LANGUAGE,
        timeoutMs = Number(process.env.OCR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
    } = {}) {
        this.binary = binary;
        this.language = language;
        this.timeoutMs = timeoutMs;
        this.engine = 'tesseract';
        this.version = null;
    }

    async recognize({buffer, mimeType, psm = null}) {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hboo-ocr-'));
        const inputPath = path.join(tempDir, `receipt${EXTENSIONS[mimeType] || '.img'}`);
        try {
            await fs.writeFile(inputPath, buffer, {mode: 0o600});
            const args = [
                inputPath,
                'stdout',
                '-l',
                this.language
            ];
            if (psm !== null && psm !== undefined && psm !== '') {
                args.push('--psm', String(psm));
            }
            const {stdout} = await execFileAsync(this.binary, args, {
                timeout: this.timeoutMs,
                maxBuffer: 4 * 1024 * 1024
            });
            return {
                rawText: stdout || '',
                engine: this.engine,
                engineVersion: await this.getVersion(),
                language: this.language
            };
        } finally {
            await fs.rm(tempDir, {recursive: true, force: true}).catch(() => {});
        }
    }

    async getVersion() {
        if (this.version !== null) return this.version;
        try {
            const {stdout} = await execFileAsync(this.binary, ['--version'], {
                timeout: 5000,
                maxBuffer: 64 * 1024
            });
            this.version = String(stdout || '').split('\n')[0].trim() || null;
        } catch {
            this.version = null;
        }
        return this.version;
    }
}

export default new TesseractOcrAdapter();
export {TesseractOcrAdapter, DEFAULT_LANGUAGE};
