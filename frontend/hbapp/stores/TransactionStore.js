import TransactionApiService from '../services/TransactionApiService.js'
import TransactionLocalRepository from '../services/TransactionLocalRepository.js'

const cloneData = data => data ? JSON.parse(JSON.stringify(data)) : null

class TransactionStore {

	constructor() {
		this.apiService = new TransactionApiService()
		this.repository = new TransactionLocalRepository()
		this.listeners = new Set()
		this.loadPromise = null
		this.state = {
			data: null,
			updatedAt: null,
			loading: false,
			loaded: false,
			source: null,
			stale: false,
			error: null
		}
	}

	getState() {
		return {
			...this.state,
			data: cloneData(this.state.data)
		}
	}

	subscribe(listener) {
		if (typeof listener !== 'function') return () => {}
		this.listeners.add(listener)
		listener(this.getState())
		return () => this.listeners.delete(listener)
	}

	notify() {
		const state = this.getState()
		this.listeners.forEach(listener => listener(state))
	}

	setState(patch) {
		this.state = {
			...this.state,
			...patch
		}
		this.notify()
	}

	hydrateFromCache() {
		if (this.state.loaded || this.state.data) return this.getState()
		const cache = this.repository.get()
		if (!cache) return this.getState()

		this.setState({
			data: cache.data,
			updatedAt: cache.updatedAt,
			loaded: true,
			source: 'cache',
			stale: false,
			error: null
		})
		return this.getState()
	}

	load(query = '') {
		if (this.loadPromise) return this.loadPromise

		const cache = this.repository.get()
		if (cache) {
			this.setState({
				data: cache.data,
				updatedAt: cache.updatedAt,
				loaded: true,
				source: 'cache',
				stale: false,
				error: null
			})
		}

		this.loadPromise = this.refresh(query)
			.finally(() => {
				this.loadPromise = null
			})

		return this.loadPromise
	}

	async refresh(query = '') {
		this.setState({loading: true})

		try {
			const data = await this.apiService.getTransactions(query)
			const cache = this.repository.save(data)
			this.setState({
				data,
				updatedAt: cache?.updatedAt || Date.now(),
				loading: false,
				loaded: true,
				source: 'api',
				stale: false,
				error: null
			})
			return this.getState()
		} catch (error) {
			const cache = this.repository.get()
			if (cache) {
				this.setState({
					data: cache.data,
					updatedAt: cache.updatedAt,
					loading: false,
					loaded: true,
					source: 'cache',
					stale: true,
					error
				})
				return this.getState()
			}

			this.setState({
				data: null,
				updatedAt: null,
				loading: false,
				loaded: false,
				source: null,
				stale: false,
				error
			})
			return this.getState()
		}
	}
}

export default new TransactionStore()
