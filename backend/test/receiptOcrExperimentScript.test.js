import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, '../scripts/receipt-ocr-experiment.js');

test('receipt OCR experiment compares original and normalize with PSM 6 only', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');

    assert.match(source, /const ALT_PSM = 6;/);
    assert.match(source, /const ALT_PSM_PROFILES = \['original', 'normalize'\];/);
    assert.match(source, /profile,\s*\n\s*psm: ALT_PSM/);
    assert.doesNotMatch(source, /ALT_PSM_PROFILES = \[[^\]]*grayscale|ALT_PSM_PROFILES = \[[^\]]*threshold|ALT_PSM_PROFILES = \[[^\]]*upscale/);
});
