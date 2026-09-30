const PARSER_VERSION = 'receipt-parser-v1';
const MONEY_TOLERANCE = 0.02;

const TOTAL_MARKER_RE = /(сума|усього|всього|до\s+сплати|безготівкова|готівка|оплата|разом|total|amount)/iu;
const FOOTER_RE = /(безготівкова|картка|visa|mastercard|термінал|комісія|пдв|сума|операц|оплата|фіскаль|каса|знижка|грн|решта)/iu;
const BARCODE_RE = /^\s*\d{8,14}\s*$/;
const MERCHANTS = [
    {pattern: /\bnovus\b/iu, rawName: 'NOVUS', normalizedHint: 'NOVUS'},
    {pattern: /атб|\batb\b/iu, rawName: 'АТБ', normalizedHint: 'ATB'},
    {pattern: /брусил[іi]вськ/iu, rawName: 'Брусилівські ковбаси', normalizedHint: 'Брусилівські ковбаси'}
];

const clamp = value => Math.max(0, Math.min(1, Math.round(value * 100) / 100));
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function normalizeLine(value) {
    return String(value || '')
        .replace(/\r/g, '')
        .replace(/[×]/g, 'X')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseDecimalToken(value, {maxDecimals = 3} = {}) {
    const text = String(value || '').trim();
    const match = text.match(new RegExp(`^\\d{1,6}([.,]\\d{1,${maxDecimals}})?$`));
    if (!match) return null;
    const number = Number(text.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
}

function parseMoneyToken(value) {
    const text = String(value || '').trim();
    if (!/^\d{1,6}[.,]\d{2}$/.test(text)) return null;
    const number = Number(text.replace(',', '.'));
    if (!Number.isFinite(number) || number < 0 || number > 999999) return null;
    return roundMoney(number);
}

function extractMoneyTokens(line) {
    const matches = [];
    const re = /(^|[^\d])(\d{1,6}[.,]\d{2})(?!\d)/g;
    let match;
    while ((match = re.exec(line)) !== null) {
        const raw = match[2];
        const value = parseMoneyToken(raw);
        if (value !== null) matches.push({raw, value, index: match.index + match[1].length});
    }
    return matches;
}

function findArithmetic(line) {
    const normalized = normalizeLine(line);
    const re = /(^|[^\d])(\d{1,5}(?:[.,]\d{1,3})?)\s*(кг|kg|г|g|шт|pcs|pc|л|l|мл|ml)?\.?\s*[xXхХ]\s*(\d{1,6}[.,]\d{2})(?:\s*=?\s*(\d{1,6}[.,]\d{2}))?/iu;
    const match = normalized.match(re);
    if (!match) return null;

    const quantity = parseDecimalToken(match[2], {maxDecimals: 3});
    const unitPrice = parseMoneyToken(match[4]);
    const total = match[5] ? parseMoneyToken(match[5]) : null;
    if (quantity === null || unitPrice === null) return null;

    return {
        raw: match[0].trim(),
        quantity,
        unit: normalizeUnit(match[3]),
        unitPrice,
        total,
        hasExplicitTotal: total !== null,
        hasEquals: /=/.test(normalized)
    };
}

function normalizeUnit(unit) {
    if (!unit) return null;
    const text = unit.toLowerCase().replace(/\./g, '');
    if (['кг', 'kg'].includes(text)) return 'kg';
    if (['г', 'g'].includes(text)) return 'g';
    if (['шт', 'pcs', 'pc'].includes(text)) return 'pcs';
    if (['л', 'l'].includes(text)) return 'l';
    if (['мл', 'ml'].includes(text)) return 'ml';
    return text;
}

function isBarcodeLine(line) {
    return BARCODE_RE.test(normalizeLine(line));
}

function isFooterLine(line) {
    return FOOTER_RE.test(normalizeLine(line));
}

function isPlausibleNameLine(line) {
    const text = normalizeLine(line);
    if (!text || text.length < 3) return false;
    if (isBarcodeLine(text) || isFooterLine(text) || findArithmetic(text)) return false;
    return /[\p{L}]/u.test(text);
}

function cleanName(line) {
    let text = normalizeLine(line);
    text = text.replace(/^(?:APT|ART|АРТ|ШК|WK)\s*\.?\s*(?:N[eе]|№|No)?\s*\d+\s*/iu, '');
    text = text.replace(/^\d{1,6}\s*[-–]\s*/, '');
    text = text.replace(/\s+\d{1,6}[.,]\d{2}\s*(?:грн)?\s*$/iu, '');
    return text.trim() || normalizeLine(line);
}

function trailingMoney(line) {
    const text = normalizeLine(line);
    const match = text.match(/(\d{1,6}[.,]\d{2})\s*(?:грн)?\s*$/iu);
    return match ? {raw: match[1], value: parseMoneyToken(match[1])} : null;
}

function validateArithmetic(quantity, unitPrice, total) {
    if (quantity === null || unitPrice === null || total === null) {
        return {
            arithmeticChecked: false,
            arithmeticValid: null,
            expectedTotal: null,
            difference: null
        };
    }
    const expectedTotal = roundMoney(quantity * unitPrice);
    const difference = roundMoney(Math.abs(expectedTotal - total));
    return {
        arithmeticChecked: true,
        arithmeticValid: difference <= MONEY_TOLERANCE,
        expectedTotal,
        difference
    };
}

function scoreItem({arithmetic, hasName, layout, validation, warnings}) {
    let score = 0.35;
    if (arithmetic) score += 0.25;
    if (hasName) score += 0.15;
    if (layout === 'name-before-arithmetic' || layout === 'arithmetic-before-name') score += 0.1;
    if (validation.arithmeticValid === true) score += 0.15;
    if (validation.arithmeticValid === false) score -= 0.35;
    if (warnings.length) score -= warnings.length * 0.05;
    return clamp(score);
}

function parseItems(lines) {
    const items = [];
    const consumed = new Set();

    lines.forEach((line, index) => {
        if (consumed.has(index)) return;
        const arithmetic = findArithmetic(line.normalized);
        if (!arithmetic) return;

        let nameLine = null;
        let totalFromAdjacent = null;
        let layout = 'arithmetic-only';
        const rawLines = [line.raw];

        const previous = lines[index - 1];
        const next = lines[index + 1];
        const afterNext = lines[index + 2];

        const preferNextName = Boolean(arithmetic.unit);
        if (preferNextName && next && isPlausibleNameLine(next.normalized)) {
            nameLine = next;
            layout = 'arithmetic-before-name';
            rawLines.push(next.raw);
            consumed.add(index + 1);
            if (!arithmetic.total) {
                const nextTrailing = trailingMoney(next.normalized);
                if (nextTrailing && nextTrailing.value !== null) totalFromAdjacent = nextTrailing;
                else if (afterNext && extractMoneyTokens(afterNext.normalized).length === 1 && !isFooterLine(afterNext.normalized)) {
                    totalFromAdjacent = extractMoneyTokens(afterNext.normalized)[0];
                    rawLines.push(afterNext.raw);
                    consumed.add(index + 2);
                }
            }
        } else if (previous && !consumed.has(index - 1) && isPlausibleNameLine(previous.normalized)) {
            nameLine = previous;
            layout = 'name-before-arithmetic';
            rawLines.unshift(previous.raw);
            consumed.add(index - 1);
        } else if (next && isPlausibleNameLine(next.normalized)) {
            nameLine = next;
            layout = 'arithmetic-before-name';
            rawLines.push(next.raw);
            consumed.add(index + 1);
            if (!arithmetic.total) {
                const nextTrailing = trailingMoney(next.normalized);
                if (nextTrailing && nextTrailing.value !== null) totalFromAdjacent = nextTrailing;
                else if (afterNext && extractMoneyTokens(afterNext.normalized).length === 1 && !isFooterLine(afterNext.normalized)) {
                    totalFromAdjacent = extractMoneyTokens(afterNext.normalized)[0];
                    rawLines.push(afterNext.raw);
                    consumed.add(index + 2);
                }
            }
        }

        const total = arithmetic.total ?? totalFromAdjacent?.value ?? null;
        const validation = validateArithmetic(arithmetic.quantity, arithmetic.unitPrice, total);
        const warnings = [];
        if (validation.arithmeticValid === false) warnings.push('ITEM_ARITHMETIC_MISMATCH');
        if (!nameLine) warnings.push('ITEM_NAME_UNCERTAIN');
        if (total === null) warnings.push('ITEM_TOTAL_MISSING');

        items.push({
            rawText: rawLines.join('\n'),
            rawName: nameLine ? cleanName(nameLine.normalized) : normalizeLine(line.raw),
            quantity: arithmetic.quantity,
            unit: arithmetic.unit,
            unitPrice: arithmetic.unitPrice,
            total,
            confidence: scoreItem({arithmetic, hasName: Boolean(nameLine), layout, validation, warnings}),
            validation,
            warnings
        });
        consumed.add(index);
    });

    return items;
}

function detectTotal(lines) {
    const candidates = [];
    lines.forEach((line, index) => {
        if (findArithmetic(line.normalized) || isBarcodeLine(line.normalized) || /пдв/iu.test(line.normalized)) return;
        const tokens = extractMoneyTokens(line.normalized);
        if (!tokens.length) return;
        const hasMarker = TOTAL_MARKER_RE.test(line.normalized);
        const hasCurrency = /\b(грн|uah)\b/iu.test(line.normalized);
        if (!hasMarker && !hasCurrency) return;
        tokens.forEach(token => {
            let confidence = 0.45;
            if (hasMarker) confidence += 0.3;
            if (hasCurrency) confidence += 0.1;
            candidates.push({
                raw: token.raw,
                value: token.value,
                line: line.raw,
                lineIndex: index,
                confidence: clamp(confidence)
            });
        });
    });

    candidates.sort((a, b) => b.confidence - a.confidence || b.lineIndex - a.lineIndex);
    const warnings = [];
    if (!candidates.length) {
        return {raw: null, value: null, confidence: 0, candidates, warnings: ['TOTAL_NOT_FOUND']};
    }

    const strong = candidates.filter(candidate => candidate.confidence >= 0.65);
    const values = new Set(strong.map(candidate => candidate.value.toFixed(2)));
    if (values.size > 1) {
        warnings.push('CONFLICTING_TOTAL_CANDIDATES');
        return {raw: null, value: null, confidence: 0.2, candidates, warnings};
    }

    const selected = strong[0] || candidates[0];
    return {
        raw: selected.raw,
        value: selected.confidence >= 0.65 ? selected.value : null,
        confidence: selected.confidence >= 0.65 ? selected.confidence : 0.35,
        candidates,
        warnings: selected.confidence >= 0.65 ? warnings : ['TOTAL_UNCERTAIN']
    };
}

function detectDate(lines) {
    for (const line of lines) {
        const match = line.normalized.match(/\b(\d{2})[./-](\d{2})[./-](\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\b/);
        if (!match) continue;
        const [, dd, mm, yyyy, hh, min, ss = '00'] = match;
        const day = Number(dd);
        const month = Number(mm);
        const year = Number(yyyy);
        const hour = Number(hh);
        const minute = Number(min);
        const second = Number(ss);
        const date = new Date(year, month - 1, day, hour, minute, second);
        if (
            year >= 2000 && year <= 2100
            && date.getFullYear() === year
            && date.getMonth() === month - 1
            && date.getDate() === day
            && date.getHours() === hour
            && date.getMinutes() === minute
            && date.getSeconds() === second
        ) {
            const pad = value => String(value).padStart(2, '0');
            return {
                raw: match[0],
                value: `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`,
                confidence: 0.9
            };
        }
    }

    return {raw: null, value: null, confidence: 0};
}

function detectMerchant(text) {
    const merchant = MERCHANTS.find(item => item.pattern.test(text));
    if (!merchant) return {rawName: null, normalizedHint: null, confidence: 0};
    return {
        rawName: merchant.rawName,
        normalizedHint: merchant.normalizedHint,
        confidence: 0.75
    };
}

function crossCheckItemsTotal(items, total) {
    const confidentTotals = items
        .filter(item => item.total !== null && item.confidence >= 0.55)
        .map(item => item.total);
    if (confidentTotals.length < 2 || total.value === null) return null;
    const itemsTotal = roundMoney(confidentTotals.reduce((sum, value) => sum + value, 0));
    const difference = roundMoney(Math.abs(itemsTotal - total.value));
    return {
        itemsTotal,
        difference,
        valid: difference <= Math.max(0.05, confidentTotals.length * MONEY_TOLERANCE)
    };
}

function parseReceiptOcr(rawText) {
    const text = String(rawText || '');
    const lines = text
        .split(/\n+/)
        .map(raw => ({raw, normalized: normalizeLine(raw)}))
        .filter(line => line.normalized);

    const merchant = detectMerchant(text);
    const purchasedAt = detectDate(lines);
    const items = parseItems(lines);
    const totalDetection = detectTotal(lines);
    const warnings = [...totalDetection.warnings];
    const itemTotalCheck = crossCheckItemsTotal(items, totalDetection);
    if (itemTotalCheck && !itemTotalCheck.valid) warnings.push('ITEMS_TOTAL_MISMATCH');
    if (!items.length) warnings.push('ITEMS_NOT_FOUND');

    return {
        merchant,
        purchasedAt,
        total: {
            raw: totalDetection.raw,
            value: totalDetection.value,
            confidence: totalDetection.confidence
        },
        totalCandidates: totalDetection.candidates,
        items,
        validation: {
            itemTotalsChecked: Boolean(itemTotalCheck),
            itemTotalsValid: itemTotalCheck ? itemTotalCheck.valid : null,
            itemsTotal: itemTotalCheck ? itemTotalCheck.itemsTotal : null,
            difference: itemTotalCheck ? itemTotalCheck.difference : null
        },
        warnings,
        parserVersion: PARSER_VERSION
    };
}

export {
    MONEY_TOLERANCE,
    PARSER_VERSION,
    cleanName,
    detectDate,
    extractMoneyTokens,
    findArithmetic,
    parseMoneyToken,
    parseReceiptOcr,
    validateArithmetic
};
