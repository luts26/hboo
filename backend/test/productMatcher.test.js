import test from 'node:test';
import assert from 'node:assert/strict';

import {ProductMatcher} from '../src/services/ProductMatcher.js';
import {normalizeProductText} from '../src/services/ProductTextNormalizer.js';
import {ProductCatalogService} from '../src/services/ProductCatalogService.js';

const products = [
    {id: 1, categoryId: 10, categoryName: 'Молочні', name: 'Молоко', measurementType: 'volume', status: 'active'},
    {id: 2, categoryId: 11, categoryName: 'Хліб та випічка', name: 'Хліб', measurementType: 'weight', status: 'active'},
    {id: 3, categoryId: 10, categoryName: 'Молочні', name: 'Сир', measurementType: 'weight', status: 'active'},
    {id: 4, categoryId: 12, categoryName: 'Бакалія', name: 'Сіль', measurementType: 'weight', status: 'active'}
];

const aliases = [
    {
        id: 10,
        productId: 1,
        productName: 'Молоко',
        categoryId: 10,
        categoryName: 'Молочні',
        measurementType: 'volume',
        merchantId: 7,
        merchantName: 'АТБ',
        alias: 'Молоко Простоквашино 2.5% 900мл',
        normalizedAlias: normalizeProductText('Молоко Простоквашино 2.5% 900мл')
    },
    {
        id: 11,
        productId: 2,
        productName: 'Хліб',
        categoryId: 11,
        categoryName: 'Хліб та випічка',
        measurementType: 'weight',
        merchantId: null,
        merchantName: null,
        alias: 'Хліб пш.Панський 400г',
        normalizedAlias: normalizeProductText('Хліб пш.Панський 400г')
    },
    {
        id: 12,
        productId: 2,
        productName: 'Хліб',
        categoryId: 11,
        categoryName: 'Хліб та випічка',
        measurementType: 'weight',
        merchantId: 7,
        merchantName: 'АТБ',
        alias: 'Store X',
        normalizedAlias: normalizeProductText('Store X')
    },
    {
        id: 13,
        productId: 1,
        productName: 'Молоко',
        categoryId: 10,
        categoryName: 'Молочні',
        measurementType: 'volume',
        merchantId: null,
        merchantName: null,
        alias: 'Store X',
        normalizedAlias: normalizeProductText('Store X')
    }
];

function makeRepository({createdAliases = []} = {}) {
    return {
        findProducts: async () => products,
        findProductById: async id => products.find(product => Number(product.id) === Number(id)) || null,
        findMerchantById: async id => Number(id) === 7 ? {id: 7, name: 'АТБ', status: 'active'} : null,
        findProductAliasByNormalized: async ({normalizedAlias, merchantId}) => [...aliases, ...createdAliases]
            .find(alias => alias.normalizedAlias === normalizedAlias
                && (merchantId === null ? alias.merchantId === null : Number(alias.merchantId) === Number(merchantId))) || null,
        findProductAliases: async productId => [...aliases, ...createdAliases].filter(alias => Number(alias.productId) === Number(productId)),
        createProductAlias: async alias => {
            const created = {
                id: 99,
                productName: products.find(product => product.id === alias.productId)?.name,
                merchantName: alias.merchantId ? 'АТБ' : null,
                ...alias
            };
            createdAliases.push(created);
            return created;
        }
    };
}

test('normalizes product aliases deterministically without deleting product evidence', () => {
    assert.equal(
        normalizeProductText('  Молоко Простоквашино 2.5% 900мл  '),
        'молоко простоквашино 2 5 900мл'
    );
    assert.equal(
        normalizeProductText('Хліб пш.Панський 400г'),
        'хліб пш панський 400г'
    );
});

test('matches merchant-specific exact alias before global alias', async () => {
    const matcher = new ProductMatcher({catalogRepository: makeRepository()});
    const result = await matcher.match({rawName: 'Store X', merchantId: 7});

    assert.equal(result.source, 'alias_merchant');
    assert.equal(result.match.productName, 'Хліб');
});

test('matches global exact alias when merchant-specific alias is absent', async () => {
    const matcher = new ProductMatcher({catalogRepository: makeRepository()});
    const result = await matcher.match({rawName: 'Хліб пш.Панський 400г', merchantId: 8});

    assert.equal(result.source, 'alias_global');
    assert.equal(result.match.productName, 'Хліб');
});

test('matches exact canonical Product name deterministically', async () => {
    const matcher = new ProductMatcher({catalogRepository: makeRepository()});
    const result = await matcher.match({rawName: 'Молоко'});

    assert.equal(result.source, 'product_name');
    assert.equal(result.match.productName, 'Молоко');
});

test('returns conservative token suggestions without deterministic match', async () => {
    const matcher = new ProductMatcher({catalogRepository: makeRepository()});
    const result = await matcher.match({rawName: 'Молоко Простоквашино 2.5% 900мл', merchantId: 8});

    assert.equal(result.match, null);
    assert.equal(result.source, 'token_similarity');
    assert.equal(result.candidates[0].productName, 'Молоко');
    assert.equal(result.candidates[0].source, 'token_similarity');
});

test('does not force unrelated or weak short-token matches', async () => {
    const matcher = new ProductMatcher({catalogRepository: makeRepository()});

    assert.equal((await matcher.match({rawName: 'Сириус пакет'})).source, 'none');
    assert.equal((await matcher.match({rawName: 'Пакет майка'})).source, 'none');
});

test('duplicate same alias is idempotent and conflicting alias is rejected', async () => {
    const service = new ProductCatalogService({
        catalogRepository: makeRepository(),
        purchasesRepository: {}
    });

    const duplicate = await service.createProductAlias(1, {
        alias: 'Молоко Простоквашино 2.5% 900мл',
        merchant_id: 7
    });
    assert.equal(duplicate.idempotent, true);
    assert.equal(duplicate.created, false);

    await assert.rejects(() => service.createProductAlias(2, {
        alias: 'Молоко Простоквашино 2.5% 900мл',
        merchant_id: 7
    }), /another product/);
});
