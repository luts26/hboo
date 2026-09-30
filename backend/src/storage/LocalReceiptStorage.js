import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_RECEIPT_DIR = '/data/receipts';

const EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

class LocalReceiptStorage {
    constructor({baseDir = process.env.RECEIPT_STORAGE_DIR || DEFAULT_RECEIPT_DIR} = {}) {
        this.baseDir = path.resolve(baseDir);
    }

    async save({buffer, mimeType}) {
        await fs.mkdir(this.baseDir, {recursive: true, mode: 0o700});
        const extension = EXTENSIONS[mimeType] || '.bin';
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const storageKey = `${crypto.randomUUID()}${extension}`;
            const filePath = this.resolve(storageKey);
            try {
                await fs.writeFile(filePath, buffer, {flag: 'wx', mode: 0o600});
                return {storageKey, sizeBytes: buffer.length};
            } catch (error) {
                if (error?.code !== 'EEXIST') throw error;
            }
        }
        throw new Error('Could not allocate receipt storage key');
    }

    async read(storageKey) {
        return fs.readFile(this.resolve(storageKey));
    }

    async delete(storageKey) {
        if (!storageKey) return false;
        try {
            await fs.unlink(this.resolve(storageKey));
            return true;
        } catch (error) {
            if (error?.code === 'ENOENT') return false;
            throw error;
        }
    }

    async exists(storageKey) {
        try {
            await fs.access(this.resolve(storageKey));
            return true;
        } catch {
            return false;
        }
    }

    resolve(storageKey) {
        const key = String(storageKey || '');
        if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(key)) {
            throw new Error('Invalid receipt storage key');
        }
        const filePath = path.resolve(this.baseDir, key);
        if (!filePath.startsWith(`${this.baseDir}${path.sep}`)) {
            throw new Error('Invalid receipt storage path');
        }
        return filePath;
    }
}

export default new LocalReceiptStorage();
export {LocalReceiptStorage};
