import {getAuthenticatedUserId} from './AuthSession.js'
import IndexedDbClient from './IndexedDbClient.js'

const LEGACY_STORAGE_KEY = 'hboo-planing-items-v1'
const STORAGE_KEY_PREFIX = 'hboo-planning-v2'
const UNSCOPED_STORAGE_KEY = STORAGE_KEY_PREFIX
const STORAGE_VERSION = 2
const PLANNING_META_PREFIX = 'planning.state'
const PLANNING_MIGRATION_META_PREFIX = 'planning.localStorageMigration.v1'

const getPlanningStorageKey = userId => `${STORAGE_KEY_PREFIX}:user:${Number(userId)}`
const getPlanningMetaKey = userId => `${PLANNING_META_PREFIX}:user:${Number(userId)}`
const getPlanningMigrationMetaKey = userId => `${PLANNING_MIGRATION_META_PREFIX}:user:${Number(userId)}`

const toNumber = value => {
	const num = Number(value)
	return Number.isFinite(num) ? num : 0
}

const startOfDay = date => {
	const d = new Date(date)
	d.setHours(0, 0, 0, 0)
	return d.getTime()
}

const endOfDay = date => {
	const d = new Date(date)
	d.setHours(23, 59, 59, 999)
	return d.getTime()
}

const dateStringToTimestamp = (value, isEndOfDay = false) => {
	if (!value) return null
	const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
	if (!year || !month || !day) return null
	return (isEndOfDay ? endOfDay : startOfDay)(new Date(year, month - 1, day))
}

const getDefaultPeriodRange = () => {
	const now = new Date()
	return {
		dateFrom: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
		dateTo: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
	}
}

const createId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

const isTemporaryId = id => String(id || '').includes('-')

const readJson = (storageKey, fallback = null) => {
	try {
		const rawData = localStorage.getItem(storageKey)
		return rawData ? JSON.parse(rawData) : fallback
	} catch (error) {
		console.warn('Planning local data is not readable', error)
		return fallback
	}
}

const writeJson = (storageKey, data) => {
	localStorage.setItem(storageKey, JSON.stringify(data))
}

const normalizeStatus = status => {
	const map = {
		approve: 'completed',
		approved: 'completed',
		completed: 'completed',
		disable: 'cancelled',
		disabled: 'cancelled',
		cancelled: 'cancelled',
		pending: 'pending'
	}

	return map[status] || 'pending'
}

const normalizeChecklist = checklist => {
	if (!Array.isArray(checklist)) return undefined

	const items = checklist
		.map(item => ({
			id: String(item?.id || createId('checklist')),
			title: String(item?.title || '').trim(),
			checked: Boolean(item?.checked)
		}))
		.filter(item => item.title)

	return items.length ? items : undefined
}

const normalizePeriod = period => {
	const range = getDefaultPeriodRange()
	const now = Date.now()
	const dateFrom = toNumber(period?.dateFrom)
		|| dateStringToTimestamp(period?.startDate)
		|| dateStringToTimestamp(period?.start_date)
		|| toNumber(period?.from)
		|| range.dateFrom
	const dateTo = toNumber(period?.dateTo)
		|| dateStringToTimestamp(period?.endDate, true)
		|| dateStringToTimestamp(period?.end_date, true)
		|| toNumber(period?.to)
		|| range.dateTo

	return {
		id: String(period?.id || createId('period')),
		dateFrom: startOfDay(dateFrom),
		dateTo: endOfDay(dateTo),
		periodBudget: Math.max(0, toNumber(period?.periodBudget ?? period?.budgetAmount ?? period?.budget_amount)),
		status: period?.status || 'active',
		createdAt: toNumber(period?.createdAt) || now,
		updatedAt: toNumber(period?.updatedAt) || now
	}
}

const normalizeItem = (item, periodId) => {
	const now = Date.now()
	const plannedDate = dateStringToTimestamp(item?.plannedAt || item?.planned_at)
	const date = toNumber(item?.date || item?.createdAt) || plannedDate || now
	const createdAt = toNumber(item?.createdAt) || date
	const description = item?.desc ?? item?.description ?? ''
	const normalizedItem = {
		...item,
		id: String(item?.id || createId('item')),
		periodId: String(item?.periodId || item?.period_id || periodId),
		categoryId: item?.categoryId ?? item?.category_id ?? null,
		title: item?.title || description || 'Planning expense',
		sum: Math.max(0, toNumber(item?.sum ?? item?.plannedAmount ?? item?.planned_amount)),
		actualAmount: item?.actualAmount ?? item?.actual_amount ?? null,
		status: normalizeStatus(item?.status),
		date,
		typeStr: item?.typeStr || String(item?.categoryId ?? item?.category_id ?? 'other'),
		desc: description,
		transactionId: item?.transactionId ?? item?.transaction_id ?? null,
		completedAt: item?.completedAt ?? item?.completed_at ?? null,
		cancelledAt: item?.cancelledAt ?? item?.cancelled_at ?? null,
		createdAt,
		updatedAt: toNumber(item?.updatedAt) || createdAt
	}
	const checklist = normalizeChecklist(item?.checklist)

	if (checklist) normalizedItem.checklist = checklist
	else delete normalizedItem.checklist

	return normalizedItem
}

const normalizeServerSnapshot = snapshot => {
	if (!snapshot?.period) return null
	const period = normalizePeriod(snapshot.period)
	const items = Array.isArray(snapshot.items)
		? snapshot.items.map(item => normalizeItem(item, period.id))
		: []

	return {
		period,
		items,
		statistics: snapshot.statistics || null,
		updatedAt: toNumber(snapshot.updatedAt) || Date.now()
	}
}

const getLegacyItems = legacyData => {
	if (Array.isArray(legacyData)) return legacyData
	if (Array.isArray(legacyData?.items)) return legacyData.items
	if (Array.isArray(legacyData?.planningItems)) return legacyData.planningItems
	return []
}

const getLegacyPeriod = legacyData => {
	const period = legacyData?.period || legacyData?.currentPeriod || legacyData?.planningPeriod || null
	if (!period) return null

	const dateFrom = period.dateFrom ?? period.from
	const dateTo = period.dateTo ?? period.to
	if (!dateFrom || !dateTo) return null

	return {
		dateFrom,
		dateTo,
		periodBudget: period.periodBudget ?? 0
	}
}

const createEmptyStorage = () => {
	const period = normalizePeriod(getDefaultPeriodRange())
	return {
		version: STORAGE_VERSION,
		currentPeriodId: period.id,
		periods: [period],
		items: [],
		serverSnapshot: null,
		deletedItemIds: [],
		dirty: false
	}
}

const migrateLegacyData = legacyData => {
	const now = Date.now()
	const legacyPeriod = getLegacyPeriod(legacyData)
	const period = normalizePeriod({
		...(legacyPeriod || getDefaultPeriodRange()),
		id: createId('period'),
		status: 'active',
		createdAt: now,
		updatedAt: now
	})
	const items = getLegacyItems(legacyData).map(item => normalizeItem(item, period.id))

	return {
		version: STORAGE_VERSION,
		currentPeriodId: period.id,
		periods: [period],
		items,
		serverSnapshot: null,
		deletedItemIds: [],
		dirty: items.length > 0 || Boolean(legacyPeriod)
	}
}

class LocalStoragePlanningRepository {

	constructor(options = {}, legacyStorageKey = LEGACY_STORAGE_KEY) {
		const config = typeof options === 'object' && options !== null ? options : {storageKey: options}
		this.userId = config.userId || null
		this.storageKey = config.storageKey || null
		this.legacyStorageKey = config.legacyStorageKey || legacyStorageKey
		this.unscopedStorageKey = config.unscopedStorageKey || UNSCOPED_STORAGE_KEY
	}

	getUserId() {
		return this.userId || getAuthenticatedUserId()
	}

	getStorageKey() {
		if (this.storageKey) return this.storageKey

		const userId = this.getUserId()
		return userId ? getPlanningStorageKey(userId) : null
	}

	migrateUnscopedStorage(storageKey) {
		if (!storageKey || this.storageKey) return
		const scopedData = readJson(storageKey, null)
		const unscopedData = readJson(this.unscopedStorageKey, null)

		if (scopedData || !unscopedData) return

		writeJson(storageKey, unscopedData)
		localStorage.removeItem(this.unscopedStorageKey)
	}

	readStorage() {
		const storageKey = this.getStorageKey()
		if (!storageKey) return createEmptyStorage()
		this.migrateUnscopedStorage(storageKey)

		const storedData = readJson(storageKey, null)
		if (storedData?.version === STORAGE_VERSION && Array.isArray(storedData.periods) && Array.isArray(storedData.items)) {
			const periods = storedData.periods.map(period => normalizePeriod(period))
			const currentPeriodId = String(storedData.currentPeriodId || periods[0]?.id || '')
			return {
				...storedData,
				currentPeriodId,
				periods,
				items: storedData.items.map(item => normalizeItem(item, item.periodId || currentPeriodId)),
				serverSnapshot: normalizeServerSnapshot(storedData.serverSnapshot),
				deletedItemIds: Array.isArray(storedData.deletedItemIds) ? storedData.deletedItemIds.map(String) : [],
				dirty: Boolean(storedData.dirty)
			}
		}

		const legacyData = readJson(this.legacyStorageKey, null)
		const data = legacyData ? migrateLegacyData(legacyData) : createEmptyStorage()
		writeJson(storageKey, data)
		if (legacyData) localStorage.removeItem(this.legacyStorageKey)
		return data
	}

	writeStorage(data) {
		const storageKey = this.getStorageKey()
		if (!storageKey) return

		writeJson(storageKey, {
			version: STORAGE_VERSION,
			currentPeriodId: data.currentPeriodId,
			periods: Array.isArray(data.periods) ? data.periods : [],
			items: Array.isArray(data.items) ? data.items : [],
			serverSnapshot: data.serverSnapshot || null,
			deletedItemIds: Array.isArray(data.deletedItemIds) ? data.deletedItemIds : [],
			dirty: Boolean(data.dirty)
		})
	}

	async getPlanningState() {
		const data = this.readStorage()
		const currentPeriod = data.periods.find(period => String(period.id) === String(data.currentPeriodId)) || data.periods[0] || null

		return {
			...data,
			currentPeriodId: currentPeriod?.id || data.currentPeriodId,
			currentPeriod,
			items: currentPeriod ? data.items.filter(item => String(item.periodId) === String(currentPeriod.id)) : []
		}
	}

	async replaceFromServer({period, items = [], statistics = null}, {preserveDirty = false} = {}) {
		const storage = this.readStorage()
		const normalizedPeriod = normalizePeriod(period)
		const normalizedItems = items.map(item => {
			const localItem = normalizeItem(item, normalizedPeriod.id)
			const currentItem = storage.items.find(storedItem => String(storedItem.id) === String(localItem.id))
			if (currentItem?.checklist) localItem.checklist = currentItem.checklist
			return localItem
		})
		const serverSnapshot = {
			period: normalizedPeriod,
			items: normalizedItems,
			statistics,
			updatedAt: Date.now()
		}

		if (preserveDirty && storage.dirty) {
			this.writeStorage({
				...storage,
				serverSnapshot
			})
			return this.getPlanningState()
		}

		this.writeStorage({
			...storage,
			currentPeriodId: normalizedPeriod.id,
			periods: [normalizedPeriod],
			items: normalizedItems,
			serverSnapshot,
			deletedItemIds: [],
			dirty: false
		})

		return this.getPlanningState()
	}

	async updateCurrentPeriod(data, {markDirty = true} = {}) {
		const storage = this.readStorage()
		const currentPeriodId = storage.currentPeriodId
		const now = Date.now()
		let updatedPeriod = null
		const periods = storage.periods.map(period => {
			if (String(period.id) !== String(currentPeriodId)) return period
			updatedPeriod = normalizePeriod({
				...period,
				...data,
				id: period.id,
				createdAt: period.createdAt,
				updatedAt: now
			})
			return updatedPeriod
		})

		if (!updatedPeriod) {
			updatedPeriod = normalizePeriod({
				...getDefaultPeriodRange(),
				...data,
				updatedAt: now
			})
			periods.push(updatedPeriod)
			storage.currentPeriodId = updatedPeriod.id
		}

		this.writeStorage({...storage, periods, dirty: markDirty ? true : storage.dirty})
		return updatedPeriod
	}

	async createItem(data, {markDirty = true} = {}) {
		const storage = this.readStorage()
		const periodId = storage.currentPeriodId
		const now = Date.now()
		const item = normalizeItem({
			status: 'pending',
			date: now,
			createdAt: now,
			updatedAt: now,
			...data,
			id: createId('item'),
			periodId
		}, periodId)

		storage.items.push(item)
		this.writeStorage({...storage, dirty: markDirty ? true : storage.dirty})
		return item
	}

	async updateItem(id, data, {markDirty = true} = {}) {
		const storage = this.readStorage()
		let updatedItem = null
		const updatedItems = storage.items.map(item => {
			if (String(item.id) !== String(id)) return item
			updatedItem = normalizeItem({
				...item,
				...data,
				id: item.id,
				periodId: item.periodId,
				createdAt: item.createdAt,
				updatedAt: Date.now()
			}, item.periodId)
			return updatedItem
		})

		this.writeStorage({...storage, items: updatedItems, dirty: markDirty ? true : storage.dirty})
		return updatedItem
	}

	async setStatus(id, status, options = {}) {
		return this.updateItem(id, {status: normalizeStatus(status)}, options)
	}

	async removeItem(id) {
		const storage = this.readStorage()
		const item = storage.items.find(storedItem => String(storedItem.id) === String(id))
		const updatedItems = storage.items.filter(storedItem => String(storedItem.id) !== String(id))
		const deletedItemIds = !item || isTemporaryId(item.id)
			? storage.deletedItemIds
			: [...new Set([...storage.deletedItemIds, String(item.id)])]

		this.writeStorage({...storage, items: updatedItems, deletedItemIds, dirty: true})
		return true
	}

	async setDirty(dirty) {
		const storage = this.readStorage()
		this.writeStorage({...storage, dirty})
		return true
	}

	async markCurrentPeriodPersisted(period) {
		const storage = this.readStorage()
		const previousPeriodId = String(storage.currentPeriodId || '')
		const normalizedPeriod = normalizePeriod(period)
		let periodReplaced = false
		const periods = storage.periods
			.map(storedPeriod => {
				if (String(storedPeriod.id) !== previousPeriodId && String(storedPeriod.id) !== String(normalizedPeriod.id)) {
					return storedPeriod
				}

				if (periodReplaced) return null
				periodReplaced = true
				return {
					...normalizedPeriod,
					createdAt: normalizedPeriod.createdAt || storedPeriod.createdAt,
					updatedAt: normalizedPeriod.updatedAt || storedPeriod.updatedAt
				}
			})
			.filter(Boolean)

		if (!periodReplaced) periods.push(normalizedPeriod)

		const items = storage.items.map(item => {
			if (String(item.periodId) !== previousPeriodId) return item
			return normalizeItem({
				...item,
				periodId: normalizedPeriod.id
			}, normalizedPeriod.id)
		})
		const snapshot = storage.serverSnapshot
		const serverSnapshot = snapshot
			? {
				...snapshot,
				period: normalizedPeriod
			}
			: {
				period: normalizedPeriod,
				items: [],
				statistics: null,
				updatedAt: Date.now()
			}

		this.writeStorage({
			...storage,
			currentPeriodId: normalizedPeriod.id,
			periods,
			items,
			serverSnapshot,
			dirty: true
		})

		return this.getPlanningState()
	}

	async markItemPersisted(localItemId, item, periodId) {
		const storage = this.readStorage()
		const normalizedItem = normalizeItem(item, periodId)
		const currentItem = storage.items.find(storedItem => String(storedItem.id) === String(localItemId))
		if (currentItem?.checklist) normalizedItem.checklist = currentItem.checklist

		let itemReplaced = false
		const items = storage.items
			.map(storedItem => {
				if (String(storedItem.id) !== String(localItemId) && String(storedItem.id) !== String(normalizedItem.id)) {
					return storedItem
				}

				if (itemReplaced) return null
				itemReplaced = true
				return normalizedItem
			})
			.filter(Boolean)

		if (!itemReplaced) items.push(normalizedItem)

		const snapshot = storage.serverSnapshot
		const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : []
		const serverSnapshot = snapshot
			? {
				...snapshot,
				items: [
					...snapshotItems.filter(snapshotItem => String(snapshotItem.id) !== String(normalizedItem.id)),
					normalizedItem
				],
				updatedAt: Date.now()
			}
			: storage.serverSnapshot

		this.writeStorage({
			...storage,
			items,
			serverSnapshot,
			dirty: true
		})

		return this.getPlanningState()
	}

	async markCleanFromState({period, items, statistics = null}) {
		const normalizedPeriod = normalizePeriod(period)
		const normalizedItems = items.map(item => normalizeItem(item, normalizedPeriod.id))
		const serverSnapshot = {
			period: normalizedPeriod,
			items: normalizedItems,
			statistics,
			updatedAt: Date.now()
		}

		this.writeStorage({
			version: STORAGE_VERSION,
			currentPeriodId: normalizedPeriod.id,
			periods: [normalizedPeriod],
			items: normalizedItems,
			serverSnapshot,
			deletedItemIds: [],
			dirty: false
		})

		return this.getPlanningState()
	}

	async applyPersistedItem(item, {statistics = undefined} = {}) {
		const storage = this.readStorage()
		const normalizedItem = normalizeItem(item, item.periodId || item.period_id || storage.currentPeriodId)
		const items = storage.items.map(storedItem => {
			if (String(storedItem.id) !== String(normalizedItem.id)) return storedItem
			return {
				...normalizedItem,
				checklist: storedItem.checklist
			}
		})
		const itemExists = items.some(storedItem => String(storedItem.id) === String(normalizedItem.id))
		if (!itemExists) items.push(normalizedItem)

		const snapshot = storage.serverSnapshot
		const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : []
		const serverSnapshot = snapshot
			? {
				...snapshot,
				items: [
					...snapshotItems.filter(snapshotItem => String(snapshotItem.id) !== String(normalizedItem.id)),
					normalizedItem
				],
				statistics: statistics === undefined ? snapshot.statistics : statistics,
				updatedAt: Date.now()
			}
			: storage.serverSnapshot

		this.writeStorage({
			...storage,
			items,
			serverSnapshot,
			dirty: storage.dirty
		})

		return this.getPlanningState()
	}

	isTemporaryId(id) {
		return isTemporaryId(id)
	}
}

const getEntityLocalId = (userId, type, id) => `user:${Number(userId)}:${type}:${String(id)}`

const getServerId = id => isTemporaryId(id) ? undefined : String(id)

const omitUndefined = data => {
	Object.keys(data).forEach(key => {
		if (data[key] === undefined) delete data[key]
	})
	return data
}

const periodToRecord = (period, userId) => {
	const normalizedPeriod = normalizePeriod(period)
	const serverId = getServerId(normalizedPeriod.id)

	return omitUndefined({
		...normalizedPeriod,
		localId: getEntityLocalId(userId, 'period', normalizedPeriod.id),
		serverId,
		userId: Number(userId)
	})
}

const itemToRecord = (item, userId) => {
	const normalizedItem = normalizeItem(item, item.periodId)
	const serverId = getServerId(normalizedItem.id)
	const periodServerId = getServerId(normalizedItem.periodId)

	return omitUndefined({
		...normalizedItem,
		localId: getEntityLocalId(userId, 'item', normalizedItem.id),
		serverId,
		userId: Number(userId),
		periodLocalId: getEntityLocalId(userId, 'period', normalizedItem.periodId),
		periodServerId,
		syncStatus: 'local'
	})
}

const recordToPeriod = record => normalizePeriod(record)

const recordToItem = record => {
	const {
		localId,
		serverId,
		userId,
		periodLocalId,
		periodServerId,
		syncStatus,
		deletedAt,
		...item
	} = record || {}

	return normalizeItem(item, item.periodId)
}

const normalizeStorageData = data => {
	const periods = Array.isArray(data?.periods) ? data.periods.map(period => normalizePeriod(period)) : []
	const currentPeriodId = String(data?.currentPeriodId || periods[0]?.id || '')

	return {
		version: STORAGE_VERSION,
		currentPeriodId,
		periods,
		items: Array.isArray(data?.items) ? data.items.map(item => normalizeItem(item, item.periodId || currentPeriodId)) : [],
		serverSnapshot: normalizeServerSnapshot(data?.serverSnapshot),
		deletedItemIds: Array.isArray(data?.deletedItemIds) ? data.deletedItemIds.map(String) : [],
		dirty: Boolean(data?.dirty)
	}
}

export default class PlanningLocalRepository {

	constructor(options = {}, legacyStorageKey = LEGACY_STORAGE_KEY) {
		const config = typeof options === 'object' && options !== null ? options : {storageKey: options}
		this.userId = config.userId || null
		this.storageKey = config.storageKey || null
		this.legacyStorageKey = config.legacyStorageKey || legacyStorageKey
		this.unscopedStorageKey = config.unscopedStorageKey || UNSCOPED_STORAGE_KEY
		this.indexedDbClient = config.indexedDbClient || new IndexedDbClient()
		this.fallbackRepository = new LocalStoragePlanningRepository(config, legacyStorageKey)
		this.initializationPromise = null
		this.useFallback = false
	}

	getUserId() {
		return this.userId || getAuthenticatedUserId()
	}

	getStorageKey() {
		if (this.storageKey) return this.storageKey

		const userId = this.getUserId()
		return userId ? getPlanningStorageKey(userId) : null
	}

	getMetaKey() {
		const userId = this.getUserId()
		return userId ? getPlanningMetaKey(userId) : null
	}

	getMigrationMetaKey() {
		const userId = this.getUserId()
		return userId ? getPlanningMigrationMetaKey(userId) : null
	}

	readLocalStorageForMigration() {
		const storageKey = this.getStorageKey()
		if (!storageKey) return createEmptyStorage()

		const storedData = readJson(storageKey, null)
		if (storedData?.version === STORAGE_VERSION && Array.isArray(storedData.periods) && Array.isArray(storedData.items)) {
			return normalizeStorageData(storedData)
		}

		if (!this.storageKey) {
			const unscopedData = readJson(this.unscopedStorageKey, null)
			if (unscopedData?.version === STORAGE_VERSION && Array.isArray(unscopedData.periods) && Array.isArray(unscopedData.items)) {
				return normalizeStorageData(unscopedData)
			}
		}

		const legacyData = readJson(this.legacyStorageKey, null)
		return legacyData ? migrateLegacyData(legacyData) : createEmptyStorage()
	}

	async ensureIndexedDbReady() {
		if (this.useFallback) return false
		if (this.storageKey || !this.getUserId()) {
			this.useFallback = true
			return false
		}
		if (this.initializationPromise) return this.initializationPromise

		this.initializationPromise = this.initializeIndexedDb()
			.catch(error => {
				console.warn('Planning IndexedDB storage is unavailable; falling back to localStorage', error)
				this.useFallback = true
				return false
			})
			.finally(() => {
				this.initializationPromise = null
			})

		return this.initializationPromise
	}

	async initializeIndexedDb() {
		await this.indexedDbClient.openDatabase()
		const migrationKey = this.getMigrationMetaKey()
		const migration = await this.indexedDbClient.get('meta', migrationKey)

		if (!migration) {
			const localStorageData = this.readLocalStorageForMigration()
			await this.writeIndexedDbStorage(localStorageData)
			await this.indexedDbClient.put('meta', {
				key: migrationKey,
				userId: Number(this.getUserId()),
				version: 1,
				completedAt: Date.now()
			})
		}

		return true
	}

	async readStorage() {
		const isIndexedDbReady = await this.ensureIndexedDbReady()
		if (!isIndexedDbReady) return this.fallbackRepository.readStorage()

		try {
			return await this.readIndexedDbStorage()
		} catch (error) {
			console.warn('Planning IndexedDB storage is not readable; falling back to localStorage', error)
			this.useFallback = true
			return this.fallbackRepository.readStorage()
		}
	}

	async readIndexedDbStorage() {
		const userId = Number(this.getUserId())
		const meta = await this.indexedDbClient.get('meta', this.getMetaKey())
		if (!meta) {
			const emptyStorage = createEmptyStorage()
			await this.writeIndexedDbStorage(emptyStorage)
			return emptyStorage
		}

		const [periodRecords, itemRecords, snapshotRecords] = await Promise.all([
			this.indexedDbClient.getAll('planningPeriods'),
			this.indexedDbClient.getAll('planningItems'),
			this.indexedDbClient.getAll('planningServerSnapshots')
		])
		const periodLocalIds = new Set(Array.isArray(meta.periodLocalIds) ? meta.periodLocalIds : [])
		const itemLocalIds = new Set(Array.isArray(meta.itemLocalIds) ? meta.itemLocalIds : [])
		const periods = periodRecords
			.filter(record => Number(record.userId) === userId && periodLocalIds.has(record.localId))
			.map(recordToPeriod)
		const items = itemRecords
			.filter(record => Number(record.userId) === userId && itemLocalIds.has(record.localId))
			.map(recordToItem)
		const currentPeriodId = String(meta.currentPeriodId || periods[0]?.id || '')
		const currentPeriodLocalId = currentPeriodId ? getEntityLocalId(userId, 'period', currentPeriodId) : null
		const snapshot = snapshotRecords.find(record => Number(record.userId) === userId && record.periodLocalId === currentPeriodLocalId)
		const serverSnapshot = snapshot?.snapshot ? normalizeServerSnapshot(snapshot.snapshot) : null

		return normalizeStorageData({
			version: STORAGE_VERSION,
			currentPeriodId,
			periods,
			items,
			serverSnapshot,
			deletedItemIds: Array.isArray(meta.deletedItemIds) ? meta.deletedItemIds : [],
			dirty: Boolean(meta.dirty)
		})
	}

	async writeStorage(data) {
		const isIndexedDbReady = await this.ensureIndexedDbReady()
		if (!isIndexedDbReady) {
			this.fallbackRepository.writeStorage(data)
			return
		}

		try {
			await this.writeIndexedDbStorage(data)
			this.fallbackRepository.writeStorage(data)
		} catch (error) {
			console.warn('Planning IndexedDB storage is not writable; falling back to localStorage', error)
			this.useFallback = true
			this.fallbackRepository.writeStorage(data)
		}
	}

	async writeIndexedDbStorage(data) {
		const userId = Number(this.getUserId())
		const previousMeta = await this.indexedDbClient.get('meta', this.getMetaKey()).catch(() => null)
		const storage = normalizeStorageData(data)
		const periodRecords = storage.periods.map(period => periodToRecord(period, userId))
		const itemRecords = storage.items.map(item => itemToRecord(item, userId))
		const currentPeriodLocalId = storage.currentPeriodId
			? getEntityLocalId(userId, 'period', storage.currentPeriodId)
			: null

		await Promise.all([
			...periodRecords.map(record => this.indexedDbClient.put('planningPeriods', record)),
			...itemRecords.map(record => this.indexedDbClient.put('planningItems', record))
		])

		if (storage.serverSnapshot?.period) {
			const snapshotPeriodLocalId = getEntityLocalId(userId, 'period', storage.serverSnapshot.period.id)
			await this.indexedDbClient.put('planningServerSnapshots', {
				periodLocalId: snapshotPeriodLocalId,
				userId,
				snapshot: storage.serverSnapshot,
				fetchedAt: storage.serverSnapshot.updatedAt || Date.now(),
				serverVersion: storage.serverSnapshot.updatedAt || Date.now()
			})
		}

		await this.indexedDbClient.put('meta', {
			key: this.getMetaKey(),
			userId,
			version: STORAGE_VERSION,
			currentPeriodId: storage.currentPeriodId,
			currentPeriodLocalId,
			periodLocalIds: periodRecords.map(record => record.localId),
			itemLocalIds: itemRecords.map(record => record.localId),
			deletedItemIds: storage.deletedItemIds,
			dirty: storage.dirty,
			updatedAt: Date.now()
		})

		const periodLocalIds = new Set(periodRecords.map(record => record.localId))
		const itemLocalIds = new Set(itemRecords.map(record => record.localId))
		const stalePeriodIds = (previousMeta?.periodLocalIds || []).filter(localId => !periodLocalIds.has(localId))
		const staleItemIds = (previousMeta?.itemLocalIds || []).filter(localId => !itemLocalIds.has(localId))

		await Promise.all([
			...stalePeriodIds.map(localId => this.indexedDbClient.delete('planningPeriods', localId)),
			...stalePeriodIds.map(localId => this.indexedDbClient.delete('planningServerSnapshots', localId)),
			...staleItemIds.map(localId => this.indexedDbClient.delete('planningItems', localId))
		])
	}

	async getPlanningState() {
		const data = await this.readStorage()
		const currentPeriod = data.periods.find(period => String(period.id) === String(data.currentPeriodId)) || data.periods[0] || null

		return {
			...data,
			currentPeriodId: currentPeriod?.id || data.currentPeriodId,
			currentPeriod,
			items: currentPeriod ? data.items.filter(item => String(item.periodId) === String(currentPeriod.id)) : []
		}
	}

	async replaceFromServer({period, items = [], statistics = null}, {preserveDirty = false} = {}) {
		const storage = await this.readStorage()
		const normalizedPeriod = normalizePeriod(period)
		const normalizedItems = items.map(item => {
			const localItem = normalizeItem(item, normalizedPeriod.id)
			const currentItem = storage.items.find(storedItem => String(storedItem.id) === String(localItem.id))
			if (currentItem?.checklist) localItem.checklist = currentItem.checklist
			return localItem
		})
		const serverSnapshot = {
			period: normalizedPeriod,
			items: normalizedItems,
			statistics,
			updatedAt: Date.now()
		}

		if (preserveDirty && storage.dirty) {
			await this.writeStorage({
				...storage,
				serverSnapshot
			})
			return this.getPlanningState()
		}

		await this.writeStorage({
			...storage,
			currentPeriodId: normalizedPeriod.id,
			periods: [normalizedPeriod],
			items: normalizedItems,
			serverSnapshot,
			deletedItemIds: [],
			dirty: false
		})

		return this.getPlanningState()
	}

	async updateCurrentPeriod(data, {markDirty = true} = {}) {
		const storage = await this.readStorage()
		const currentPeriodId = storage.currentPeriodId
		const now = Date.now()
		let updatedPeriod = null
		const periods = storage.periods.map(period => {
			if (String(period.id) !== String(currentPeriodId)) return period
			updatedPeriod = normalizePeriod({
				...period,
				...data,
				id: period.id,
				createdAt: period.createdAt,
				updatedAt: now
			})
			return updatedPeriod
		})

		if (!updatedPeriod) {
			updatedPeriod = normalizePeriod({
				...getDefaultPeriodRange(),
				...data,
				updatedAt: now
			})
			periods.push(updatedPeriod)
			storage.currentPeriodId = updatedPeriod.id
		}

		await this.writeStorage({...storage, periods, dirty: markDirty ? true : storage.dirty})
		return updatedPeriod
	}

	async createItem(data, {markDirty = true} = {}) {
		const storage = await this.readStorage()
		const periodId = storage.currentPeriodId
		const now = Date.now()
		const item = normalizeItem({
			status: 'pending',
			date: now,
			createdAt: now,
			updatedAt: now,
			...data,
			id: createId('item'),
			periodId
		}, periodId)

		storage.items.push(item)
		await this.writeStorage({...storage, dirty: markDirty ? true : storage.dirty})
		return item
	}

	async updateItem(id, data, {markDirty = true} = {}) {
		const storage = await this.readStorage()
		let updatedItem = null
		const updatedItems = storage.items.map(item => {
			if (String(item.id) !== String(id)) return item
			updatedItem = normalizeItem({
				...item,
				...data,
				id: item.id,
				periodId: item.periodId,
				createdAt: item.createdAt,
				updatedAt: Date.now()
			}, item.periodId)
			return updatedItem
		})

		await this.writeStorage({...storage, items: updatedItems, dirty: markDirty ? true : storage.dirty})
		return updatedItem
	}

	async setStatus(id, status, options = {}) {
		return this.updateItem(id, {status: normalizeStatus(status)}, options)
	}

	async removeItem(id) {
		const storage = await this.readStorage()
		const item = storage.items.find(storedItem => String(storedItem.id) === String(id))
		const updatedItems = storage.items.filter(storedItem => String(storedItem.id) !== String(id))
		const deletedItemIds = !item || isTemporaryId(item.id)
			? storage.deletedItemIds
			: [...new Set([...storage.deletedItemIds, String(item.id)])]

		await this.writeStorage({...storage, items: updatedItems, deletedItemIds, dirty: true})
		return true
	}

	async setDirty(dirty) {
		const storage = await this.readStorage()
		await this.writeStorage({...storage, dirty})
		return true
	}

	async markCurrentPeriodPersisted(period) {
		const storage = await this.readStorage()
		const previousPeriodId = String(storage.currentPeriodId || '')
		const normalizedPeriod = normalizePeriod(period)
		let periodReplaced = false
		const periods = storage.periods
			.map(storedPeriod => {
				if (String(storedPeriod.id) !== previousPeriodId && String(storedPeriod.id) !== String(normalizedPeriod.id)) {
					return storedPeriod
				}

				if (periodReplaced) return null
				periodReplaced = true
				return {
					...normalizedPeriod,
					createdAt: normalizedPeriod.createdAt || storedPeriod.createdAt,
					updatedAt: normalizedPeriod.updatedAt || storedPeriod.updatedAt
				}
			})
			.filter(Boolean)

		if (!periodReplaced) periods.push(normalizedPeriod)

		const items = storage.items.map(item => {
			if (String(item.periodId) !== previousPeriodId) return item
			return normalizeItem({
				...item,
				periodId: normalizedPeriod.id
			}, normalizedPeriod.id)
		})
		const snapshot = storage.serverSnapshot
		const serverSnapshot = snapshot
			? {
				...snapshot,
				period: normalizedPeriod
			}
			: {
				period: normalizedPeriod,
				items: [],
				statistics: null,
				updatedAt: Date.now()
			}

		await this.writeStorage({
			...storage,
			currentPeriodId: normalizedPeriod.id,
			periods,
			items,
			serverSnapshot,
			dirty: true
		})

		return this.getPlanningState()
	}

	async markItemPersisted(localItemId, item, periodId) {
		const storage = await this.readStorage()
		const normalizedItem = normalizeItem(item, periodId)
		const currentItem = storage.items.find(storedItem => String(storedItem.id) === String(localItemId))
		if (currentItem?.checklist) normalizedItem.checklist = currentItem.checklist

		let itemReplaced = false
		const items = storage.items
			.map(storedItem => {
				if (String(storedItem.id) !== String(localItemId) && String(storedItem.id) !== String(normalizedItem.id)) {
					return storedItem
				}

				if (itemReplaced) return null
				itemReplaced = true
				return normalizedItem
			})
			.filter(Boolean)

		if (!itemReplaced) items.push(normalizedItem)

		const snapshot = storage.serverSnapshot
		const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : []
		const serverSnapshot = snapshot
			? {
				...snapshot,
				items: [
					...snapshotItems.filter(snapshotItem => String(snapshotItem.id) !== String(normalizedItem.id)),
					normalizedItem
				],
				updatedAt: Date.now()
			}
			: storage.serverSnapshot

		await this.writeStorage({
			...storage,
			items,
			serverSnapshot,
			dirty: true
		})

		return this.getPlanningState()
	}

	async markCleanFromState({period, items, statistics = null}) {
		const normalizedPeriod = normalizePeriod(period)
		const normalizedItems = items.map(item => normalizeItem(item, normalizedPeriod.id))
		const serverSnapshot = {
			period: normalizedPeriod,
			items: normalizedItems,
			statistics,
			updatedAt: Date.now()
		}

		await this.writeStorage({
			version: STORAGE_VERSION,
			currentPeriodId: normalizedPeriod.id,
			periods: [normalizedPeriod],
			items: normalizedItems,
			serverSnapshot,
			deletedItemIds: [],
			dirty: false
		})

		return this.getPlanningState()
	}

	async applyPersistedItem(item, {statistics = undefined} = {}) {
		const storage = await this.readStorage()
		const normalizedItem = normalizeItem(item, item.periodId || item.period_id || storage.currentPeriodId)
		const items = storage.items.map(storedItem => {
			if (String(storedItem.id) !== String(normalizedItem.id)) return storedItem
			return {
				...normalizedItem,
				checklist: storedItem.checklist
			}
		})
		const itemExists = items.some(storedItem => String(storedItem.id) === String(normalizedItem.id))
		if (!itemExists) items.push(normalizedItem)

		const snapshot = storage.serverSnapshot
		const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : []
		const serverSnapshot = snapshot
			? {
				...snapshot,
				items: [
					...snapshotItems.filter(snapshotItem => String(snapshotItem.id) !== String(normalizedItem.id)),
					normalizedItem
				],
				statistics: statistics === undefined ? snapshot.statistics : statistics,
				updatedAt: Date.now()
			}
			: storage.serverSnapshot

		await this.writeStorage({
			...storage,
			items,
			serverSnapshot,
			dirty: storage.dirty
		})

		return this.getPlanningState()
	}

	isTemporaryId(id) {
		return isTemporaryId(id)
	}
}

export {getPlanningStorageKey}
