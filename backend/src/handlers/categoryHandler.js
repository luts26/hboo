import categoryService from '../services/CategoryService.js';
import { sendJson } from '../http/response.js';

async function categoryHandler(req, res, url) {
    const language = url.searchParams.get('lang') || 'uk';
    const categories = await categoryService.getActiveCategories(language);

    sendJson(res, 200, categories);
}

export default categoryHandler;
