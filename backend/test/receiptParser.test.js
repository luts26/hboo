import test from 'node:test';
import assert from 'node:assert/strict';

import {
    detectDate,
    extractMoneyTokens,
    parseMoneyToken,
    parseReceiptOcr
} from '../src/receipts/ReceiptParser.js';

const novusFixture = `
NOVUS
APT .Ne 99 Хліб пш.Панський Цархліб 1/2 н/ск. 400r
1.000 X 40.79 = 40.79

APT.Ne 450 Плетінка здобна 3501
1.000 X 64.99 = 64.99

APT.Ne 91 Гомілка куряча oxonogxeHa Bn/Bup Bar
0.604 X 79.99 = 48.31

APT .Ne 21 MakeT майка зелений 6io
2.000 X 1.49 = 2.98

APT .Ne 641 Чай T.M'siTa Карпатський п.б/я 1,35r*20wT
1.000 X 29.79 = 29.79

APT.Ne 175 Нектар Садочок Виноград, яблуко 0,5n
1.000 X 41.49 = 41.49

APT.Ne 642 Пряники BuweHbka Кулиничі 3001
1.000 X 53.99 = 53.99
`;

const brusylivFixture = `
Брусилівські ковбаси
1 шт X 0,40
1-Пакет майка 0,40

0,258 кг. X 148,00 =
308-Ковб.ліверна"Звичайна" охол.
38,18

1 шт X 202,00 =
1663-Сир Гауда нарізка 400г
202,00

БЕЗГОТІВКОВА 240,58 ГРН
СУМА 240,58
ПДВ 40,10
17.09.2026 08:47:47
`;

const poorAtbFixture = `
АТБ
4820012345678
Крупа гречана ядриця
2.062 X 19.95 431.54
СУМА 424.59
БЕЗГОТІВКОВА 424.50 ГРН
ОПЛАТА 420.50
`;

test('clean NOVUS OCR produces item candidates and preserves raw arithmetic evidence', () => {
    const result = parseReceiptOcr(novusFixture);

    assert.equal(result.parserVersion, 'receipt-parser-v1');
    assert.equal(result.merchant.normalizedHint, 'NOVUS');
    assert.equal(result.items.length, 7);
    assert.equal(result.items[0].rawName, 'Хліб пш.Панський Цархліб 1/2 н/ск. 400r');
    assert.match(result.items[0].rawText, /1\.000 X 40\.79 = 40\.79/);

    const weighted = result.items.find(item => item.quantity === 0.604);
    assert.equal(weighted.unitPrice, 79.99);
    assert.equal(weighted.total, 48.31);
    assert.equal(weighted.validation.arithmeticChecked, true);
    assert.equal(weighted.validation.arithmeticValid, true);

    const packageItem = result.items.find(item => item.rawName.includes('MakeT майка зелений 6io'));
    assert.equal(packageItem.quantity, 2);
    assert.equal(packageItem.unitPrice, 1.49);
    assert.equal(packageItem.total, 2.98);
    assert.equal(packageItem.validation.arithmeticValid, true);
});

test('physical receipt supports arithmetic before product name, comma decimals, total and date', () => {
    const result = parseReceiptOcr(brusylivFixture);

    assert.equal(result.merchant.normalizedHint, 'Брусилівські ковбаси');
    assert.equal(result.total.value, 240.58);
    assert.equal(result.purchasedAt.value, '2026-09-17T08:47:47');

    const sausage = result.items.find(item => item.rawName.includes('Ковб.ліверна'));
    assert.equal(sausage.quantity, 0.258);
    assert.equal(sausage.unit, 'kg');
    assert.equal(sausage.unitPrice, 148);
    assert.equal(sausage.total, 38.18);
    assert.equal(sausage.validation.arithmeticValid, true);

    const cheese = result.items.find(item => item.rawName.includes('Сир Гауда'));
    assert.equal(cheese.quantity, 1);
    assert.equal(cheese.unit, 'pcs');
    assert.equal(cheese.unitPrice, 202);
    assert.equal(cheese.total, 202);
    assert.equal(cheese.validation.arithmeticValid, true);
});

test('poor ATB OCR keeps corrupted item total and marks arithmetic mismatch', () => {
    const result = parseReceiptOcr(poorAtbFixture);

    const item = result.items[0];
    assert.equal(item.quantity, 2.062);
    assert.equal(item.unitPrice, 19.95);
    assert.equal(item.total, 431.54);
    assert.equal(item.validation.arithmeticChecked, true);
    assert.equal(item.validation.arithmeticValid, false);
    assert.equal(item.validation.expectedTotal, 41.14);
    assert.ok(item.validation.difference > 300);
    assert.ok(item.warnings.includes('ITEM_ARITHMETIC_MISMATCH'));

    assert.equal(result.total.value, null);
    assert.ok(result.warnings.includes('CONFLICTING_TOTAL_CANDIDATES'));
    assert.deepEqual(
        result.totalCandidates.map(candidate => candidate.value).sort((a, b) => a - b),
        [420.50, 424.50, 424.59]
    );
});

test('money parser supports Ukrainian decimal styles without treating barcodes as prices', () => {
    assert.equal(parseMoneyToken('40.79'), 40.79);
    assert.equal(parseMoneyToken('40,79'), 40.79);
    assert.equal(parseMoneyToken('0,40'), 0.40);
    assert.equal(parseMoneyToken('202,00'), 202);
    assert.equal(parseMoneyToken('4820012345678'), null);
    assert.deepEqual(extractMoneyTokens('4820012345678'), []);
});

test('invalid receipt dates are rejected instead of normalized', () => {
    assert.deepEqual(detectDate([{raw: '32.09.2026 08:47:47', normalized: '32.09.2026 08:47:47'}]), {
        raw: null,
        value: null,
        confidence: 0
    });
});
