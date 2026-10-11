import productCatalogRepository from '../repositories/ProductCatalogRepository.js';
import {normalizeProductText, tokenizeProductText} from './ProductTextNormalizer.js';

const EXACT_SOURCES = new Set(['alias_merchant', 'alias_global', 'product_name']);

class ProductMatcher {
    constructor({catalogRepository = productCatalogRepository} = {}) {
        this.catalogRepository = catalogRepository;
    }

    async match({rawName, merchantId = null, shoppingItems = []} = {}) {
        const normalized = normalizeProductText(rawName);
        if (!normalized) return this.emptyResult('none');

        const merchantKey = this.optionalId(merchantId);
        if (merchantKey) {
            const merchantAlias = await this.catalogRepository.findProductAliasByNormalized({
                normalizedAlias: normalized,
                merchantId: merchantKey
            });
            if (merchantAlias) return this.exactResult(merchantAlias, 'alias_merchant');
        }

        const globalAlias = await this.catalogRepository.findProductAliasByNormalized({
            normalizedAlias: normalized,
            merchantId: null
        });
        if (globalAlias) return this.exactResult(globalAlias, 'alias_global');

        const products = await this.catalogRepository.findProducts({includeDisabled: false});
        const exactProduct = products.find(product => normalizeProductText(product.name) === normalized);
        if (exactProduct) return this.exactResult(exactProduct, 'product_name');

        const candidates = this.findTokenCandidates(normalized, products);
        const contextualCandidates = this.findShoppingListCandidates(normalized, shoppingItems, products, candidates);
        return {
            match: null,
            source: candidates.length ? 'token_similarity' : (contextualCandidates.length ? 'shopping_list' : 'none'),
            candidates: this.mergeCandidates(candidates, contextualCandidates)
        };
    }

    findTokenCandidates(normalizedRawName, products) {
        const rawTokens = new Set(tokenizeProductText(normalizedRawName));
        if (!rawTokens.size) return [];

        return products
            .map(product => this.scoreProduct(product, rawTokens))
            .filter(Boolean)
            .sort((a, b) => b.score - a.score || a.productName.localeCompare(b.productName, 'uk'))
            .slice(0, 3)
            .map(({score, ...candidate}) => candidate);
    }

    scoreProduct(product, rawTokens) {
        const productTokens = tokenizeProductText(product.name);
        if (!productTokens.length) return null;

        const matched = productTokens.filter(token => rawTokens.has(token));
        if (!matched.length) return null;

        if (productTokens.length === 1) {
            const [token] = productTokens;
            if (token.length < 4 || !rawTokens.has(token) || rawTokens.size < 2) return null;
            return {
                ...this.formatCandidate(product, 'token_similarity'),
                score: 1
            };
        }

        const ratio = matched.length / productTokens.length;
        if (matched.length < 2 && ratio < 1) return null;
        if (ratio < 0.8) return null;

        return {
            ...this.formatCandidate(product, 'token_similarity'),
            score: ratio
        };
    }

    findShoppingListCandidates(normalizedRawName, shoppingItems = [], products = [], existingCandidates = []) {
        const plannedProductIds = new Set((Array.isArray(shoppingItems) ? shoppingItems : [])
            .map(item => this.optionalId(item.productId ?? item.product_id))
            .filter(Boolean)
            .map(String));
        if (!plannedProductIds.size) return [];

        const productsById = new Map(products.map(product => [String(product.id), product]));
        const rawTokens = new Set(tokenizeProductText(normalizedRawName));
        const exactPlannedProducts = (Array.isArray(shoppingItems) ? shoppingItems : [])
            .filter(item => this.optionalId(item.productId ?? item.product_id))
            .filter(item => {
                const productName = normalizeProductText(item.productName || item.product_name || item.name);
                if (!productName) return false;
                if (productName === normalizedRawName) return true;
                const productTokens = tokenizeProductText(productName);
                return productTokens.length === 1
                    && productTokens[0].length >= 3
                    && rawTokens.has(productTokens[0]);
            })
            .map(item => productsById.get(String(this.optionalId(item.productId ?? item.product_id))))
            .filter(Boolean);

        const catalogPlannedProducts = existingCandidates
            .filter(candidate => plannedProductIds.has(String(candidate.productId)))
            .map(candidate => productsById.get(String(candidate.productId)))
            .filter(Boolean);

        return [...exactPlannedProducts, ...catalogPlannedProducts]
            .map(product => this.formatCandidate(product, 'shopping_list'));
    }

    mergeCandidates(...candidateGroups) {
        const seen = new Set();
        const merged = [];
        candidateGroups.flat().forEach(candidate => {
            const key = String(candidate?.productId || '');
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(candidate);
        });
        return merged.slice(0, 3);
    }

    exactResult(product, source) {
        const match = this.formatCandidate(product, source);
        return {
            match,
            source,
            candidates: EXACT_SOURCES.has(source) ? [match] : []
        };
    }

    emptyResult(source) {
        return {
            match: null,
            source,
            candidates: []
        };
    }

    formatCandidate(product, source) {
        return {
            productId: Number(product.productId || product.id),
            productName: product.productName || product.name,
            categoryId: product.categoryId === undefined ? null : Number(product.categoryId),
            categoryName: product.categoryName || null,
            measurementType: product.measurementType || null,
            source
        };
    }

    optionalId(value) {
        if (value === null || value === undefined || value === '') return null;
        const id = Number(value);
        return Number.isInteger(id) && id > 0 ? id : null;
    }
}

export {ProductMatcher};
export default new ProductMatcher();
