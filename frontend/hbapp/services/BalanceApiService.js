import api from '../mixins/apiQueriesHelper.js'

export default class BalanceApiService {

	async getBalance(queryParam = '') {
		return api.get(`/hbv2/balance${queryParam}`)
	}
}
