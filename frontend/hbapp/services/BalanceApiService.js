import api from '../mixins/apiQueriesHelper.js'

export default class BalanceApiService {

	async getBalance(queryParam = '') {
		return api.get(`/hbv2/balance${queryParam}`)
	}

	async getBalanceHistory({provider, dateFrom, dateTo} = {}) {
		const params = new URLSearchParams({
			provider,
			date_from: String(dateFrom),
			date_to: String(dateTo)
		})
		return api.get(`/hbv2/balance/history?${params.toString()}`)
	}
}
