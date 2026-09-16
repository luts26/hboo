import {getAuthToken} from '../services/AuthSession.js'

const api = {

	apiurl: '/api',
	authToken: getAuthToken(),

	getHeaders: function(headers = {}) {
		this.authToken = getAuthToken()
		const requestHeaders = {
			'Content-Type': 'application/json',
			...headers
		}

		if (this.authToken) {
			requestHeaders.Authorization = 'Bearer ' + this.authToken
		}

		return requestHeaders
	},

	get: function(path, headers = {}) {
		return new Promise(async (resolve, reject) => {
			const requestData = {
				method: 'GET',
				headers: this.getHeaders(headers)
			}
			const responce = await fetch(this.apiurl + path, requestData)
			if ([200, 201].indexOf(responce.status) !== -1) {
				const resjson = await responce.json()
				resolve(resjson)
			} else {
				reject(1)
			}

		})
	},

	post: function(path, data, headers = {}) {
		return new Promise(async (resolve, reject) => {
			const requestData = {
				method: 'POST',
				headers: this.getHeaders(headers)
			}
			if (data) requestData.body = JSON.stringify(data)
			const responce = await fetch(this.apiurl + path, requestData)
			if ([200, 201].indexOf(responce.status) !== -1) {
				const resjson = await responce.json()
				resolve(resjson)
			} else {
				reject(1)
			}
		})
	},

	put: function(path, data, headers = {}) {
		return new Promise(async (resolve, reject) => {
			const requestData = {
				method: 'PUT',
				headers: this.getHeaders(headers)
			}
			if (data) requestData.body = JSON.stringify(data)
			const responce = await fetch(this.apiurl + path, requestData)
			if ([200, 201].indexOf(responce.status) !== -1) {
				const resjson = await responce.json()
				resolve(resjson)
			} else {
				reject(1)
			}
		})
	},

	delete: function(path, headers = {}) {
		return new Promise(async (resolve, reject) => {
			const requestData = {
				method: 'DELETE',
				headers: this.getHeaders(headers)
			}
			const responce = await fetch(this.apiurl + path, requestData)
			if ([200, 201].indexOf(responce.status) !== -1) {
				const resjson = await responce.json()
				resolve(resjson)
			} else {
				reject(1)
			}
		})
	}
}

export default api
