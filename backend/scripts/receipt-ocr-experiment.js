#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../src/database/mysql.js';
import receiptRepository from '../src/repositories/ReceiptRepository.js';
import receiptStorage from '../src/storage/LocalReceiptStorage.js';
import ocrImagePreprocessor from '../src/ocr/OcrImagePreprocessor.js';
import tesseractOcrAdapter from '../src/ocr/TesseractOcrAdapter.js';

const DEFAULT_DEV_DB = 'hboo_dev';
const ALT_PSM = 6;
const ALT_PSM_PROFILES = ['original', 'normalize'];

const parseArgs = argv => {
    const args = {};
    for (const item of argv) {
        if (!item.startsWith('--')) continue;
        const [key, ...parts] = item.slice(2).split('=');
        args[key] = parts.length ? parts.join('=') : true;
    }
    return args;
};

const requirePositiveInt = (value, name) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
    return number;
};

const dimensionsText = dimensions => `${dimensions.width}x${dimensions.height}`;

const countMatches = (text, regex) => {
    const matches = text.match(regex);
    return matches ? matches.length : 0;
};

const diagnostics = rawText => {
    const text = String(rawText || '');
    return {
        characters: text.length,
        lines: text.split(/\r?\n/).filter(line => line.trim()).length,
        numericTokens: countMatches(text, /\b\d+(?:[.,]\d+)?\b/g),
        moneyLikeTokens: countMatches(text, /\b\d+[.,]\d{2}\b/g)
    };
};

const formatBlock = result => {
    const lines = [
        `PROFILE: ${result.profile}`,
        `PSM: ${result.psm || 'default'}`,
        `Input: ${dimensionsText(result.inputDimensions)}`,
        `Processed: ${dimensionsText(result.processedDimensions)}`,
        `Preprocessing: ${result.preprocessingDurationMs} ms`,
        `OCR: ${result.ocrDurationMs} ms`,
        `Total: ${result.totalDurationMs} ms`,
        `Diagnostics: ${result.diagnostics.characters} chars, ${result.diagnostics.lines} lines, ${result.diagnostics.numericTokens} numeric tokens, ${result.diagnostics.moneyLikeTokens} money-like tokens`,
        '',
        '--- RAW OCR ---',
        result.rawText || '',
        '--- END RAW OCR ---',
        ''
    ];
    return lines.join('\n');
};

const verifyDevDatabase = async () => {
    const [rows] = await pool.execute('SELECT DATABASE() AS databaseName, CURRENT_USER() AS currentUser');
    const row = rows[0] || {};
    if (row.databaseName !== DEFAULT_DEV_DB) {
        throw new Error(`Refusing OCR experiment outside DEV database. DATABASE()=${row.databaseName || 'NULL'}`);
    }
    return row;
};

const runProfile = async ({sourceBuffer, sourceMimeType, profile, psm = null}) => {
    const startedAt = Date.now();
    const processed = await ocrImagePreprocessor.preprocess({
        buffer: sourceBuffer,
        mimeType: sourceMimeType,
        profile
    });
    const ocrStartedAt = Date.now();
    const ocr = await tesseractOcrAdapter.recognize({
        buffer: processed.buffer,
        mimeType: processed.mimeType,
        psm
    });
    const ocrDurationMs = Date.now() - ocrStartedAt;
    const rawText = ocr.rawText || '';
    return {
        profile: psm ? `${profile}+psm${psm}` : profile,
        psm,
        inputDimensions: processed.inputDimensions,
        processedDimensions: processed.processedDimensions,
        preprocessingDurationMs: processed.preprocessingDurationMs,
        ocrDurationMs,
        totalDurationMs: Date.now() - startedAt,
        rawText,
        diagnostics: diagnostics(rawText)
    };
};

const writeReport = async ({outputDir, receiptId, report}) => {
    if (!outputDir) return null;
    const targetDir = path.resolve(outputDir);
    await fs.mkdir(targetDir, {recursive: true, mode: 0o700});
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(targetDir, `receipt-${receiptId}-${stamp}.txt`);
    await fs.writeFile(filePath, report, {mode: 0o600});
    return filePath;
};

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const receiptId = requirePositiveInt(args['receipt-id'], '--receipt-id');
    const userId = requirePositiveInt(args['user-id'], '--user-id');
    const outputDir = args.output === true
        ? path.resolve(process.cwd(), '..', 'tmp', 'ocr-experiments')
        : (args.output ? String(args.output) : null);

    const db = await verifyDevDatabase();
    const receipt = await receiptRepository.findById(userId, receiptId);
    if (!receipt) {
        throw new Error(`Receipt ${receiptId} was not found for user ${userId}`);
    }

    const sourceBuffer = await receiptStorage.read(receipt.storageKey);
    const profiles = ocrImagePreprocessor.listProfiles();
    const header = [
        `Receipt OCR preprocessing experiment`,
        `DATABASE(): ${db.databaseName}`,
        `CURRENT_USER(): ${db.currentUser}`,
        `Receipt ID: ${receiptId}`,
        `User ID: ${userId}`,
        `Engine: ${tesseractOcrAdapter.engine}`,
        `Engine version: ${await tesseractOcrAdapter.getVersion()}`,
        `Language: ${tesseractOcrAdapter.language}`,
        `Current production PSM: default`,
        `Alternate PSM checks: ${ALT_PSM_PROFILES.map(profile => `${profile}+psm${ALT_PSM}`).join(', ')}`,
        ''
    ].join('\n');

    const blocks = [];
    for (const profile of profiles) {
        const result = await runProfile({
            sourceBuffer,
            sourceMimeType: receipt.mimeType,
            profile
        });
        blocks.push(formatBlock(result));
    }

    for (const profile of ALT_PSM_PROFILES) {
        const alt = await runProfile({
            sourceBuffer,
            sourceMimeType: receipt.mimeType,
            profile,
            psm: ALT_PSM
        });
        blocks.push(formatBlock(alt));
    }

    const report = `${header}${blocks.join('\n')}`;
    process.stdout.write(report);
    const filePath = await writeReport({outputDir, receiptId, report});
    if (filePath) {
        process.stdout.write(`\nSaved report: ${filePath}\n`);
    }
}

main()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end().catch(() => {});
    });
