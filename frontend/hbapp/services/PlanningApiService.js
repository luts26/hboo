import api from '../mixins/apiQueriesHelper.js'

const toApiDate = value => {
	const date = new Date(Number(value))
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
}

export default class PlanningApiService {

	async getCurrentPeriod() {
		return api.get('/planning/period/current')
	}

	async getPeriodItems(periodId) {
		return api.get(`/planning/period/${encodeURIComponent(periodId)}/items`)
	}

	async getPeriodStatistics(periodId) {
		return api.get(`/planning/period/${encodeURIComponent(periodId)}/statistics`)
	}

	async createPeriod(period) {
		return api.post('/planning/period', {
			start_date: toApiDate(period.dateFrom),
			end_date: toApiDate(period.dateTo),
			budget_amount: Number(period.periodBudget) || 0
		})
	}

	async updatePeriod(period) {
		return api.put(`/planning/period/${encodeURIComponent(period.id)}`, {
			start_date: toApiDate(period.dateFrom),
			end_date: toApiDate(period.dateTo),
			budget_amount: Number(period.periodBudget) || 0
		})
	}

	async createItem(item, periodId) {
		return api.post('/planning/item', this.mapItemToApi(item, periodId))
	}

	async updateItem(item) {
		return api.put(`/planning/item/${encodeURIComponent(item.id)}`, this.mapItemToApi(item, item.periodId))
	}

	async deleteItem(itemId) {
		return api.delete(`/planning/item/${encodeURIComponent(itemId)}`)
	}

	async getTransactionCandidates(itemId) {
		return api.get(`/planning/item/${encodeURIComponent(itemId)}/transactions/candidates`)
	}

	async getLinkedTransactions(itemId) {
		return api.get(`/planning/item/${encodeURIComponent(itemId)}/transactions/linked`)
	}

	async getTransactionSuggestions(itemId) {
		return api.get(`/planning/item/${encodeURIComponent(itemId)}/transactions/suggestions`)
	}

	async linkTransaction(itemId, transaction) {
		return api.post(`/planning/item/${encodeURIComponent(itemId)}/transactions`, {
			provider: transaction.provider,
			providerTransactionId: transaction.providerTransactionId
		})
	}

	async unlinkTransaction(itemId, transaction) {
		const response = await fetch(`${api.apiurl}/planning/item/${encodeURIComponent(itemId)}/transactions`, {
			method: 'DELETE',
			headers: api.getHeaders(),
			body: JSON.stringify({
				provider: transaction.provider,
				providerTransactionId: transaction.providerTransactionId
			})
		})

		if ([200, 201].indexOf(response.status) === -1) {
			throw new Error('Unable to unlink transaction')
		}

		return response.json()
	}

	async confirmSuggestedTransaction(itemId, transaction) {
		return api.post(`/planning/item/${encodeURIComponent(itemId)}/transactions/confirm`, {
			provider: transaction.provider,
			providerTransactionId: transaction.providerTransactionId
		})
	}

	mapItemToApi(item, periodId) {
		return {
			period_id: Number(periodId),
			category_id: item.categoryId ? Number(item.categoryId) : null,
			title: item.title || item.desc || 'Planning expense',
			description: item.desc || null,
			planned_amount: Number(item.sum) || 0,
			actual_amount: item.actualAmount === null || item.actualAmount === undefined || item.actualAmount === ''
				? null
				: Number(item.actualAmount),
			status: item.status || 'pending',
			planned_at: toApiDate(item.date || Date.now()),
			transaction_id: item.transactionId || null
		}
	}
}
