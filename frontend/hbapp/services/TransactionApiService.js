import api from '../mixins/apiQueriesHelper.js'

export default class TransactionApiService {

	async getTransactions(query = '') {
		return api.get(`/hbv2/transaction${query}`)
	}
}
