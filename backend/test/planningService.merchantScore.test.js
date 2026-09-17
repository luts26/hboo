import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../src/database/mysql.js';
import planningService from '../src/services/PlanningService.js';

test.after(async () => {
    await pool.end();
});

function merchantScore(planText, transactionText) {
    return planningService.getMerchantScore(
        {
            title: planText,
            description: null
        },
        {
            description: transactionText
        }
    );
}

test('matches Ukrainian planning text to Latin merchant by transliterated token', () => {
    const cases = [
        ['продукти в новус', 'NOVUS'],
        ['купити в бульварчик', 'Bulvarchik'],
        ['солодощі рошен', 'ROSHEN'],
        ['продукти в лоток', 'Mahazyn Lotok 6']
    ];

    cases.forEach(([planText, transactionText]) => {
        const score = merchantScore(planText, transactionText);

        assert.equal(score, 0.5);
        assert.ok(score > 0);
        assert.equal(merchantScore(planText.toUpperCase(), transactionText.toLowerCase()), 0.5);
    });
});

test('does not match unrelated Cyrillic and Latin merchants', () => {
    assert.equal(merchantScore('аптека', 'Mahazyn Lotok 6'), 0);
});

test('does not use y to i transliteration variants for substring matches', () => {
    assert.equal(merchantScore('сири', 'Sirius'), 0);
    assert.equal(merchantScore('ми', 'Milk'), 0);
    assert.equal(merchantScore('риба', 'Ribeye'), 0);
});

test('keeps existing same-script merchant matching unchanged', () => {
    assert.equal(merchantScore('Synthetic cafe meal', 'Synthetic cafe meal'), 1);
    assert.equal(merchantScore('продукти', 'свіжі продукти'), 1);
});

test('handles empty and null merchant descriptions safely', () => {
    assert.equal(merchantScore('', 'Mahazyn Lotok 6'), 0);
    assert.equal(merchantScore('продукти в лоток', null), 0);
});
