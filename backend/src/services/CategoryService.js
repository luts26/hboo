import categoryRepository from '../repositories/CategoryRepository.js';

class CategoryService {

    getActiveCategories(language = 'uk') {
        return categoryRepository.findActive(language);
    }

    findByExternalCode(provider, externalCode, language = 'uk') {
        return categoryRepository.findByExternalCode(provider, externalCode, language);
    }
}

export default new CategoryService();
