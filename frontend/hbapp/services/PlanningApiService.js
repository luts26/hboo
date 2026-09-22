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

	async request(path, {method = 'GET', data = undefined} = {}) {
		const headers = api.getHeaders()
		const requestData = {
			method,
			headers
		}
		if (data !== undefined) requestData.body = JSON.stringify(data)

		const response = await fetch(`${api.apiurl}${path}`, requestData)
		api.observeResponseAuth(response, headers)
		if ([200, 201].indexOf(response.status) !== -1) {
			return response.json()
		}

		const error = new Error('Planning API request failed')
		error.status = response.status
		error.statusCode = response.status
		throw error
	}

	async getCurrentPeriod() {
		return this.request('/planning/period/current')
	}

	async getPeriodItems(periodId) {
		return this.request(`/planning/period/${encodeURIComponent(periodId)}/items`)
	}

	async getPeriodStatistics(periodId) {
		return this.request(`/planning/period/${encodeURIComponent(periodId)}/statistics`)
	}

	async createPeriod(period) {
		return this.request('/planning/period', {
			method: 'POST',
			data: {
				start_date: toApiDate(period.dateFrom),
				end_date: toApiDate(period.dateTo),
				budget_amount: Number(period.periodBudget) || 0
			}
		})
	}

	async updatePeriod(period) {
		return this.request(`/planning/period/${encodeURIComponent(period.id)}`, {
			method: 'PUT',
			data: {
				start_date: toApiDate(period.dateFrom),
				end_date: toApiDate(period.dateTo),
				budget_amount: Number(period.periodBudget) || 0
			}
		})
	}

	async createItem(item, periodId) {
		return this.request('/planning/item', {
			method: 'POST',
			data: this.mapItemToApi(item, periodId)
		})
	}

	async updateItem(item) {
		return this.request(`/planning/item/${encodeURIComponent(item.id)}`, {
			method: 'PUT',
			data: this.mapItemToApi(item, item.periodId)
		})
	}

	async deleteItem(itemId) {
		const headers = api.getHeaders()
		const response = await fetch(`${api.apiurl}/planning/item/${encodeURIComponent(itemId)}`, {
			method: 'DELETE',
			headers
		})
		api.observeResponseAuth(response, headers)

		if ([200, 201].indexOf(response.status) !== -1) {
			return response.json()
		}

		if (response.status === 404) {
			const body = await response.json().catch(() => null)
			if (body?.error === 'Planning item not found') {
				return {
					deleted: true,
					alreadyAbsent: true
				}
			}
		}

		const error = new Error('Planning item delete failed')
		error.status = response.status
		error.statusCode = response.status
		throw error
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
		const headers = api.getHeaders()
		const response = await fetch(`${api.apiurl}/planning/item/${encodeURIComponent(itemId)}/transactions`, {
			method: 'DELETE',
			headers,
			body: JSON.stringify({
				provider: transaction.provider,
				providerTransactionId: transaction.providerTransactionId
			})
		})
		api.observeResponseAuth(response, headers)

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
