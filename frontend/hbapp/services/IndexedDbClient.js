const DATABASE_NAME = 'hboo-offline-v1'
const DATABASE_VERSION = 1

const STORE_DEFINITIONS = {
	meta: {
		keyPath: 'key',
		indexes: []
	},
	planningPeriods: {
		keyPath: 'localId',
		indexes: [
			{name: 'userId', keyPath: 'userId'},
			{name: 'serverId', keyPath: 'serverId'},
			{name: 'status', keyPath: 'status'},
			{name: 'dateFrom', keyPath: 'dateFrom'},
			{name: 'dateTo', keyPath: 'dateTo'},
			{name: 'updatedAt', keyPath: 'updatedAt'}
		]
	},
	planningItems: {
		keyPath: 'localId',
		indexes: [
			{name: 'userId', keyPath: 'userId'},
			{name: 'periodLocalId', keyPath: 'periodLocalId'},
			{name: 'periodServerId', keyPath: 'periodServerId'},
			{name: 'serverId', keyPath: 'serverId'},
			{name: 'status', keyPath: 'status'},
			{name: 'date', keyPath: 'date'},
			{name: 'updatedAt', keyPath: 'updatedAt'},
			{name: 'syncStatus', keyPath: 'syncStatus'}
		]
	},
	planningServerSnapshots: {
		keyPath: 'periodLocalId',
		indexes: [
			{name: 'fetchedAt', keyPath: 'fetchedAt'},
			{name: 'serverVersion', keyPath: 'serverVersion'}
		]
	},
	transactions: {
		keyPath: ['provider', 'providerTransactionId'],
		indexes: [
			{name: 'provider', keyPath: 'provider'},
			{name: 'timestamp', keyPath: 'timestamp'},
			{name: 'categoryId', keyPath: 'categoryId'},
			{name: 'amount', keyPath: 'amount'},
			{name: 'fetchedAt', keyPath: 'fetchedAt'}
		]
	},
	transactionWindows: {
		keyPath: 'windowKey',
		indexes: [
			{name: 'provider', keyPath: 'provider'},
			{name: 'dateFrom', keyPath: 'dateFrom'},
			{name: 'dateTo', keyPath: 'dateTo'},
			{name: 'fetchedAt', keyPath: 'fetchedAt'}
		]
	},
	balances: {
		keyPath: ['provider', 'accountId'],
		indexes: [
			{name: 'provider', keyPath: 'provider'},
			{name: 'snapshotAt', keyPath: 'snapshotAt'},
			{name: 'fetchedAt', keyPath: 'fetchedAt'}
		]
	},
	categories: {
		keyPath: ['language', 'id'],
		indexes: [
			{name: 'language', keyPath: 'language'},
			{name: 'code', keyPath: 'code'},
			{name: 'updatedAt', keyPath: 'updatedAt'}
		]
	},
	syncQueue: {
		keyPath: 'operationId',
		indexes: [
			{name: 'userId', keyPath: 'userId'},
			{name: 'entityType', keyPath: 'entityType'},
			{name: 'entityLocalId', keyPath: 'entityLocalId'},
			{name: 'status', keyPath: 'status'},
			{name: 'createdAt', keyPath: 'createdAt'},
			{name: 'nextAttemptAt', keyPath: 'nextAttemptAt'}
		]
	}
}

const migrations = {
	1: (db, transaction) => {
		Object.entries(STORE_DEFINITIONS).forEach(([storeName, definition]) => {
			const store = db.objectStoreNames.contains(storeName)
				? transaction.objectStore(storeName)
				: db.createObjectStore(storeName, {keyPath: definition.keyPath})

			definition.indexes.forEach(index => {
				if (!store.indexNames.contains(index.name)) {
					store.createIndex(index.name, index.keyPath, {unique: Boolean(index.unique)})
				}
			})
		})
	}
}

const assertIndexedDbAvailable = () => {
	if (!globalThis.indexedDB) {
		throw new Error('IndexedDB is not available in this browser context')
	}
}

const requestToPromise = request => {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
	})
}

const transactionDone = transaction => {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve()
		transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
		transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
	})
}

const runMigrations = (db, transaction, oldVersion, newVersion) => {
	for (let version = oldVersion + 1; version <= newVersion; version++) {
		if (migrations[version]) migrations[version](db, transaction)
	}
}

export default class IndexedDbClient {

	constructor({databaseName = DATABASE_NAME, version = DATABASE_VERSION} = {}) {
		this.databaseName = databaseName
		this.version = version
		this.openPromise = null
		this.db = null
	}

	openDatabase() {
		if (this.db) return Promise.resolve(this.db)
		if (this.openPromise) return this.openPromise

		try {
			assertIndexedDbAvailable()
		} catch (error) {
			return Promise.reject(error)
		}

		this.openPromise = new Promise((resolve, reject) => {
			const request = globalThis.indexedDB.open(this.databaseName, this.version)

			request.onupgradeneeded = event => {
				runMigrations(request.result, request.transaction, event.oldVersion || 0, event.newVersion || this.version)
			}

			request.onsuccess = () => {
				this.db = request.result
				this.db.onversionchange = () => this.close()
				resolve(this.db)
			}

			request.onerror = () => {
				reject(request.error || new Error('IndexedDB open failed'))
			}

			request.onblocked = () => {
				reject(new Error('IndexedDB open blocked by another tab'))
			}
		}).finally(() => {
			this.openPromise = null
		})

		return this.openPromise
	}

	async get(storeName, key) {
		const db = await this.openDatabase()
		return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(key))
	}

	async getAll(storeName, query = null) {
		const db = await this.openDatabase()
		return requestToPromise(db.transaction(storeName, 'readonly').objectStore(storeName).getAll(query))
	}

	async put(storeName, value) {
		const db = await this.openDatabase()
		const tx = db.transaction(storeName, 'readwrite')
		const done = transactionDone(tx)
		try {
			const result = await requestToPromise(tx.objectStore(storeName).put(value))
			await done
			return result
		} catch (error) {
			await done.catch(() => {})
			throw error
		}
	}

	async delete(storeName, key) {
		const db = await this.openDatabase()
		const tx = db.transaction(storeName, 'readwrite')
		const done = transactionDone(tx)
		try {
			const result = await requestToPromise(tx.objectStore(storeName).delete(key))
			await done
			return result
		} catch (error) {
			await done.catch(() => {})
			throw error
		}
	}

	async transaction(storeNames, mode, callback) {
		const db = await this.openDatabase()
		const tx = db.transaction(storeNames, mode)
		const done = transactionDone(tx)
		const getStore = storeName => tx.objectStore(storeName)
		const helpers = {
			get: (storeName, key) => requestToPromise(getStore(storeName).get(key)),
			getAll: (storeName, query = null) => requestToPromise(getStore(storeName).getAll(query)),
			put: (storeName, value) => requestToPromise(getStore(storeName).put(value)),
			delete: (storeName, key) => requestToPromise(getStore(storeName).delete(key))
		}

		try {
			const result = await callback({
				transaction: tx,
				getStore,
				...helpers
			})

			await done
			return result
		} catch (error) {
			try {
				tx.abort()
			} catch {
				// Transaction may have already completed or aborted.
			}
			await done.catch(() => {})
			throw error
		}
	}

	close() {
		if (!this.db) return
		this.db.close()
		this.db = null
	}
}

export {
	DATABASE_NAME,
	DATABASE_VERSION,
	STORE_DEFINITIONS
}
