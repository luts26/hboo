import {UNCATEGORIZED_CATEGORY_ID} from './FinancialAnalyticsService.js'

const buildTransactionDrilldownPath = ({dateFrom, dateTo, categoryId} = {}) => {
	const id = categoryId === undefined || categoryId === null ? '' : String(categoryId)
	if (!id || id === UNCATEGORIZED_CATEGORY_ID) return null
	const params = new URLSearchParams()
	params.set('date_from', String(Number(dateFrom)))
	params.set('date_to', String(Number(dateTo)))
	params.set('category_id', id)
	return `/transaction?${params.toString()}`
}

const getCategoryFilterFromQuery = (query = '') => {
	const params = new URLSearchParams(String(query || '').replace(/^\?/, ''))
	return params.get('category_id') || null
}

export {
	buildTransactionDrilldownPath,
	getCategoryFilterFromQuery
}
