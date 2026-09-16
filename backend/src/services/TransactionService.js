import transactionRepository from '../repositories/TransactionRepository.js';
import springBankClient from '../clients/BankClient.js';
import categoryRepository from '../repositories/CategoryRepository.js';

const toCategoryResponse = category => {
    if (!category) return null;

    return {
        id: category.id,
        code: category.code,
        name: category.name,
        icon: category.icon
    };
};

class TransactionService {

    async getCategory(provider, externalCode, language = 'uk', categoryCache = new Map()) {
        const cacheKey = `${provider}:${externalCode}:${language}`;
        if (!categoryCache.has(cacheKey)) {
            categoryCache.set(
                cacheKey,
                categoryRepository.findByExternalCode(provider, externalCode, language)
            );
        }

        return categoryCache.get(cacheKey);
    }

    async normalizeMonoTransaction(transaction, language = 'uk', categoryCache = new Map()) {
        const category = await this.getCategory('mono', transaction.mcc, language, categoryCache);

        return {
            ...transaction,
            category: toCategoryResponse(category)
        };
    }

    async normalizePrivatTransaction(transaction, language = 'uk', categoryCache = new Map()) {
        const normalizedCategory = await this.getCategory('privat', transaction.category, language, categoryCache);

        return {
            ...transaction,
            rawCategory: transaction.category,
            bankCategory: transaction.category,
            category: toCategoryResponse(normalizedCategory)
        };
    }

	async getTransactions(dateFrom, dateTo, updateTransaction = null, language = 'uk') {

	    const bankServiceAvailable = await springBankClient.isAvailable();

	    if (bankServiceAvailable) {
	        try {
	            if (updateTransaction === '1') {
	                await springBankClient.updateMonoTransactions();
	            } else if (updateTransaction === '2') {
	                await springBankClient.updatePrivatTransactions();
	            }
	        } catch (error) {
	            console.error(
	                'Transaction refresh failed:',
	                error.message
	            );
	        }
	    }

        const [monoTransactions, privatTransactions] = await Promise.all([
            transactionRepository.getMonoTransactions(dateFrom, dateTo),
            transactionRepository.getPrivatTransactions(dateFrom, dateTo)
        ]);
        const categoryCache = new Map();

	    return {
	        mono: await Promise.all(
                monoTransactions.map(transaction => this.normalizeMonoTransaction(transaction, language, categoryCache))
            ),
	        privat: await Promise.all(
                privatTransactions.map(transaction => this.normalizePrivatTransaction(transaction, language, categoryCache))
            )
	    };
	}

}

export default new TransactionService();
