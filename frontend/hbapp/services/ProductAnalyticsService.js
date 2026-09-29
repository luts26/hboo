import {
	formatNormalizedQuantity,
	getDisplayPriceMultiplier,
	getDisplayPriceUnit,
	normalizeQuantity
} from './ProductUnitService.js'
import {parsePurchaseTime} from './PurchaseDateRange.js'

const UNKNOWN_CATEGORY_ID = 'unknown'
const UNKNOWN_CATEGORY_NAME = 'Інше'
const UNKNOWN_PRODUCT_ID = 'unknown'
const UNKNOWN_PRODUCT_NAME = 'Unknown product'

const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100

const toFiniteMoney = value => {
	const number = Number(value)
	return Number.isFinite(number) ? number : null
}

const toProductKey = value => String(value ?? '')

const compareBySpentDesc = (left, right) => {
	const spentDiff = Number(right.spent) - Number(left.spent)
	if (spentDiff) return spentDiff
	return String(left.name || '').localeCompare(String(right.name || ''), 'uk')
}

const compareLatestItem = (left, right) => {
	const timeDiff = Number(left.purchaseTime || 0) - Number(right.purchaseTime || 0)
	if (timeDiff) return timeDiff
	const purchaseDiff = String(left.purchaseId || '').localeCompare(String(right.purchaseId || ''))
	if (purchaseDiff) return purchaseDiff
	return String(left.itemId || '').localeCompare(String(right.itemId || ''))
}

const compareHistoryPointAsc = (left, right) => {
	const timeDiff = Number(left.timestamp || 0) - Number(right.timestamp || 0)
	if (timeDiff) return timeDiff
	const purchaseDiff = String(left.purchaseId || '').localeCompare(String(right.purchaseId || ''))
	if (purchaseDiff) return purchaseDiff
	return String(left.purchaseItemId || '').localeCompare(String(right.purchaseItemId || ''))
}

const compareHistoryPointDesc = (left, right) => -compareHistoryPointAsc(left, right)

const buildProductIndexes = products => {
	const byId = new Map()
	products.forEach(product => {
		byId.set(toProductKey(product.id), product)
		if (product.serverId) byId.set(toProductKey(product.serverId), product)
		if (product.localId) byId.set(toProductKey(product.localId), product)
	})
	return byId
}

const buildCategoryIndexes = categories => new Map(categories.map(category => [toProductKey(category.id), category]))

const buildMerchantIndexes = merchants => {
	const byId = new Map()
	merchants.forEach(merchant => {
		byId.set(toProductKey(merchant.id), merchant)
		if (merchant.serverId) byId.set(toProductKey(merchant.serverId), merchant)
		if (merchant.localId) byId.set(toProductKey(merchant.localId), merchant)
	})
	return byId
}

const resolveProduct = (item, productsById) => {
	const product = productsById.get(toProductKey(item.productId))
		|| productsById.get(toProductKey(item.productServerId))
	return {
		id: product?.id ?? item.productId ?? item.productServerId ?? `${UNKNOWN_PRODUCT_ID}:${item.productName || item.id || ''}`,
		name: product?.name || item.productName || UNKNOWN_PRODUCT_NAME,
		categoryId: product?.categoryId ?? item.categoryId ?? null,
		categoryName: product?.categoryName || item.categoryName || null,
		measurementType: product?.measurementType || item.measurementType || null,
		resolved: Boolean(product || item.productId || item.productServerId)
	}
}

const resolveCategory = (item, product, categoriesById) => {
	const categoryId = product?.categoryId ?? item.categoryId ?? null
	const category = categoriesById.get(toProductKey(categoryId))
	return {
		id: category?.id ?? categoryId ?? UNKNOWN_CATEGORY_ID,
		name: category?.name || product?.categoryName || item.categoryName || UNKNOWN_CATEGORY_NAME
	}
}

const getUnitPrice = (spent, normalizedQuantity) => {
	if (!normalizedQuantity || normalizedQuantity.quantity <= 0) return null
	const multiplier = getDisplayPriceMultiplier(normalizedQuantity.unit)
	if (!multiplier) return null
	return roundMoney(spent / normalizedQuantity.quantity * multiplier)
}

const formatMoneyAmount = value => Number(value || 0).toLocaleString('uk-UA', {
	maximumFractionDigits: 2,
	minimumFractionDigits: 2
})

const formatUnitPriceLabel = (value, unit) => value === null || value === undefined || !unit
	? ''
	: `${formatMoneyAmount(value)} грн/${unit}`

const formatMoneyLabel = value => `${formatMoneyAmount(value)} грн`

const formatRawQuantity = (quantity, unit) => {
	const amount = Number(quantity)
	if (!Number.isFinite(amount) || !unit) return ''
	return `${amount.toLocaleString('uk-UA', {
		maximumFractionDigits: 2,
		minimumFractionDigits: 0
	})} ${unit}`
}

const getPurchaseIdentity = purchase => purchase.id ?? purchase.serverId ?? purchase.clientMutationId

const resolveMerchant = (purchase, merchantsById) => {
	const merchant = merchantsById.get(toProductKey(purchase.merchantId))
		|| merchantsById.get(toProductKey(purchase.merchantServerId))
	return {
		id: merchant?.id ?? purchase.merchantId ?? purchase.merchantServerId ?? null,
		name: merchant?.name || purchase.merchantName || 'Unknown merchant'
	}
}

const formatShortDateLabel = timestamp => {
	const date = new Date(Number(timestamp))
	if (Number.isNaN(date.getTime())) return ''
	return date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})
}

const formatFullDateLabel = timestamp => {
	const date = new Date(Number(timestamp))
	if (Number.isNaN(date.getTime())) return ''
	return date.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	})
}

const getMerchantKey = point => {
	if (point.merchantId !== null && point.merchantId !== undefined && point.merchantId !== '') return `id:${point.merchantId}`
	return `legacy:${point.merchantName || 'Unknown merchant'}`
}

const compareStorePrices = (left, right) => {
	const purchaseDiff = Number(right.purchaseCount || 0) - Number(left.purchaseCount || 0)
	if (purchaseDiff) return purchaseDiff
	const observationDiff = Number(right.observationCount || 0) - Number(left.observationCount || 0)
	if (observationDiff) return observationDiff
	return String(left.merchantName || '').localeCompare(String(right.merchantName || ''), 'uk')
}

const buildPriceChartPoints = history => history.map(point => ({
	id: `${point.purchaseId || 'purchase'}:${point.purchaseItemId || point.timestamp}`,
	purchaseId: point.purchaseId,
	purchaseItemId: point.purchaseItemId,
	timestamp: point.timestamp,
	dateLabel: formatShortDateLabel(point.timestamp),
	fullDateLabel: formatFullDateLabel(point.timestamp),
	price: point.normalizedUnitPrice,
	priceLabel: point.unitPriceLabel,
	merchantId: point.merchantId,
	merchantName: point.merchantName,
	quantityLabel: point.quantityLabel,
	total: point.total,
	totalLabel: formatMoneyLabel(point.total)
}))

const buildStorePrices = (history, priceUnit) => {
	const stores = new Map()
	history.forEach(point => {
		const key = getMerchantKey(point)
		const aggregate = stores.get(key) || {
			merchantId: point.merchantId,
			merchantName: point.merchantName,
			spent: 0,
			normalizedQuantity: 0,
			displayQuantity: '',
			averageUnitPrice: null,
			averageUnitPriceLabel: '',
			lastUnitPrice: null,
			lastUnitPriceLabel: '',
			purchaseCount: 0,
			observationCount: 0,
			distinctPurchaseIds: new Set(),
			latestPoint: null
		}
		aggregate.spent = roundMoney(aggregate.spent + point.total)
		aggregate.normalizedQuantity += point.normalizedQuantity
		aggregate.observationCount += 1
		aggregate.distinctPurchaseIds.add(toProductKey(point.purchaseId))
		if (!aggregate.latestPoint || compareHistoryPointAsc(point, aggregate.latestPoint) >= 0) {
			aggregate.latestPoint = point
		}
		stores.set(key, aggregate)
	})

	return Array.from(stores.values())
		.map(store => {
			const multiplier = getDisplayPriceMultiplier(store.latestPoint?.normalizedUnit)
			const averageUnitPrice = store.normalizedQuantity > 0 && multiplier
				? roundMoney(store.spent / store.normalizedQuantity * multiplier)
				: null
			return {
				merchantId: store.merchantId,
				merchantName: store.merchantName,
				spent: store.spent,
				spentLabel: formatMoneyLabel(store.spent),
				normalizedQuantity: store.normalizedQuantity || null,
				displayQuantity: store.normalizedQuantity > 0
					? formatNormalizedQuantity(store.normalizedQuantity, store.latestPoint?.normalizedUnit)
					: '',
				averageUnitPrice,
				averageUnitPriceLabel: formatUnitPriceLabel(averageUnitPrice, priceUnit),
				lastUnitPrice: store.latestPoint?.normalizedUnitPrice ?? null,
				lastUnitPriceLabel: store.latestPoint?.unitPriceLabel || '',
				purchaseCount: store.distinctPurchaseIds.size,
				observationCount: store.observationCount
			}
		})
		.sort(compareStorePrices)
}

const calculateProductAnalytics = ({
	purchases = [],
	products = [],
	categories = [],
	period = null
} = {}) => {
	const productsById = buildProductIndexes(products)
	const categoriesById = buildCategoryIndexes(categories)
	const categoryTotals = new Map()
	const productTotals = new Map()
	const purchaseIds = new Set()
	let spent = 0
	let itemsCount = 0

	purchases
		.filter(purchase => purchase?.syncStatus !== 'pending_delete')
		.forEach(purchase => {
			const purchaseTime = parsePurchaseTime(purchase.purchasedAt)
			if (period && (purchaseTime === null || purchaseTime < period.dateFrom || purchaseTime > period.dateTo)) return
			purchaseIds.add(toProductKey(purchase.id ?? purchase.serverId ?? purchase.clientMutationId))

			;(purchase.items || []).forEach(item => {
				itemsCount += 1
				const itemTotal = toFiniteMoney(item.total)
				const itemSpent = itemTotal === null ? 0 : roundMoney(itemTotal)
				spent = roundMoney(spent + itemSpent)

				const product = resolveProduct(item, productsById)
				const category = resolveCategory(item, product, categoriesById)
				const categoryKey = toProductKey(category.id)
				const categoryAggregate = categoryTotals.get(categoryKey) || {
					categoryId: category.id,
					name: category.name,
					spent: 0,
					percentage: 0,
					itemsCount: 0
				}
				categoryAggregate.spent = roundMoney(categoryAggregate.spent + itemSpent)
				categoryAggregate.itemsCount += 1
				categoryTotals.set(categoryKey, categoryAggregate)

				const productKey = toProductKey(product.id)
				const productAggregate = productTotals.get(productKey) || {
					productId: product.id,
					name: product.name,
					categoryId: category.id,
					categoryName: category.name,
					spent: 0,
					quantitySpent: 0,
					normalizedQuantity: 0,
					normalizedUnit: null,
					quantityLabel: '',
					averageUnitPrice: null,
					lastUnitPrice: null,
					priceUnit: null,
					purchaseCount: 0,
					lastPurchasedAt: null,
					distinctPurchaseIds: new Set(),
					latestItem: null
				}
				productAggregate.spent = roundMoney(productAggregate.spent + itemSpent)
				productAggregate.distinctPurchaseIds.add(toProductKey(purchase.id ?? purchase.serverId ?? purchase.clientMutationId))

				const normalizedQuantity = normalizeQuantity(item.quantity, item.unit)
				if (normalizedQuantity && normalizedQuantity.quantity > 0) {
					const unitPrice = getUnitPrice(itemSpent, normalizedQuantity)
					if (!productAggregate.normalizedUnit) productAggregate.normalizedUnit = normalizedQuantity.unit
					if (productAggregate.normalizedUnit === normalizedQuantity.unit) {
						productAggregate.normalizedQuantity += normalizedQuantity.quantity
						productAggregate.quantitySpent = roundMoney(productAggregate.quantitySpent + itemSpent)
						productAggregate.priceUnit = getDisplayPriceUnit(normalizedQuantity.unit)
					}
					if (unitPrice !== null) {
						const latestCandidate = {
							unitPrice,
							purchasedAt: purchase.purchasedAt,
							purchaseTime,
							purchaseId: purchase.id ?? purchase.serverId ?? purchase.clientMutationId,
							itemId: item.id
						}
						if (!productAggregate.latestItem || compareLatestItem(latestCandidate, productAggregate.latestItem) >= 0) {
							productAggregate.latestItem = latestCandidate
						}
					}
				}

				productTotals.set(productKey, productAggregate)
			})
		})

	const categoriesView = Array.from(categoryTotals.values())
		.map(category => ({
			...category,
			percentage: spent > 0 ? Math.round(category.spent / spent * 1000) / 10 : 0
		}))
		.sort(compareBySpentDesc)

	const productsView = Array.from(productTotals.values())
		.map(product => {
			const multiplier = getDisplayPriceMultiplier(product.normalizedUnit)
			const averageUnitPrice = product.normalizedQuantity > 0 && multiplier
				? roundMoney(product.quantitySpent / product.normalizedQuantity * multiplier)
				: null
			return {
				productId: product.productId,
				name: product.name,
				categoryId: product.categoryId,
				categoryName: product.categoryName,
				spent: product.spent,
				normalizedQuantity: product.normalizedQuantity || null,
				normalizedUnit: product.normalizedUnit,
				quantityLabel: product.normalizedQuantity > 0 ? formatNormalizedQuantity(product.normalizedQuantity, product.normalizedUnit) : '',
				averageUnitPrice,
				lastUnitPrice: product.latestItem?.unitPrice ?? null,
				priceUnit: product.priceUnit,
				purchaseCount: product.distinctPurchaseIds.size,
				lastPurchasedAt: product.latestItem?.purchasedAt ?? null
			}
		})
		.sort(compareBySpentDesc)

	return {
		period,
		totals: {
			spent,
			purchasesCount: purchaseIds.size,
			itemsCount,
			distinctProducts: productsView.filter(product => !String(product.productId).startsWith(`${UNKNOWN_PRODUCT_ID}:`)).length
		},
		categories: categoriesView,
		products: productsView
	}
}

const buildProductDetail = ({
	productId,
	purchases = [],
	products = [],
	categories = [],
	merchants = [],
	period = null
} = {}) => {
	const productsById = buildProductIndexes(products)
	const categoriesById = buildCategoryIndexes(categories)
	const merchantsById = buildMerchantIndexes(merchants)
	const targetKey = toProductKey(productId)
	const purchaseIds = new Set()
	const history = []
	let spent = 0
	let comparableSpent = 0
	let normalizedQuantity = 0
	let normalizedUnit = null
	let productSnapshot = null
	let categorySnapshot = null

	purchases
		.filter(purchase => purchase?.syncStatus !== 'pending_delete')
		.forEach(purchase => {
			const purchaseTime = parsePurchaseTime(purchase.purchasedAt)
			if (period && (purchaseTime === null || purchaseTime < period.dateFrom || purchaseTime > period.dateTo)) return

			;(purchase.items || []).forEach(item => {
				const product = resolveProduct(item, productsById)
				if (toProductKey(product.id) !== targetKey) return

				const category = resolveCategory(item, product, categoriesById)
				if (!productSnapshot) productSnapshot = product
				if (!categorySnapshot) categorySnapshot = category

				const itemTotal = toFiniteMoney(item.total)
				const itemSpent = itemTotal === null ? 0 : roundMoney(itemTotal)
				spent = roundMoney(spent + itemSpent)
				purchaseIds.add(toProductKey(getPurchaseIdentity(purchase)))

				const itemQuantity = normalizeQuantity(item.quantity, item.unit)
				if (!itemQuantity || itemQuantity.quantity <= 0) return
				if (normalizedUnit && normalizedUnit !== itemQuantity.unit) return

				const unitPrice = getUnitPrice(itemSpent, itemQuantity)
				if (unitPrice === null) return
				if (!normalizedUnit) normalizedUnit = itemQuantity.unit

				normalizedQuantity += itemQuantity.quantity
				comparableSpent = roundMoney(comparableSpent + itemSpent)
				const priceUnit = getDisplayPriceUnit(itemQuantity.unit)
				const merchant = resolveMerchant(purchase, merchantsById)
				history.push({
					purchaseId: getPurchaseIdentity(purchase),
					purchaseItemId: item.id,
					purchasedAt: purchase.purchasedAt,
					timestamp: purchaseTime,
					merchantId: merchant.id,
					merchantName: merchant.name,
					quantity: Number(item.quantity),
					unit: item.unit,
					quantityLabel: formatRawQuantity(item.quantity, item.unit),
					normalizedQuantity: itemQuantity.quantity,
					normalizedUnit: itemQuantity.unit,
					displayUnit: priceUnit,
					total: itemSpent,
					unitPrice,
					normalizedUnitPrice: unitPrice,
					unitPriceLabel: formatUnitPriceLabel(unitPrice, priceUnit)
				})
			})
		})

	history.sort(compareHistoryPointAsc)

	const product = productSnapshot || productsById.get(targetKey) || null
	const category = categorySnapshot || (product
		? resolveCategory({}, {
			categoryId: product.categoryId,
			categoryName: product.categoryName
		}, categoriesById)
		: null)
	const priceUnit = getDisplayPriceUnit(normalizedUnit)
	const multiplier = getDisplayPriceMultiplier(normalizedUnit)
	const averageUnitPrice = normalizedQuantity > 0 && multiplier
		? roundMoney(comparableSpent / normalizedQuantity * multiplier)
		: null
	const lastPoint = history.at(-1) || null
	const priceChartPoints = buildPriceChartPoints(history)
	const storePrices = buildStorePrices(history, priceUnit)

	return {
		product: product ? {
			id: product.id ?? productId,
			name: product.name || UNKNOWN_PRODUCT_NAME,
			measurementType: product.measurementType || null
		} : {
			id: productId,
			name: UNKNOWN_PRODUCT_NAME,
			measurementType: null
		},
		category: category ? {
			id: category.id,
			name: category.name
		} : {
			id: UNKNOWN_CATEGORY_ID,
			name: UNKNOWN_CATEGORY_NAME
		},
		period,
		spent,
		normalizedQuantity: normalizedQuantity || null,
		normalizedUnit,
		displayQuantity: normalizedQuantity > 0 ? formatNormalizedQuantity(normalizedQuantity, normalizedUnit) : '',
		averageUnitPrice,
		averageUnitPriceLabel: formatUnitPriceLabel(averageUnitPrice, priceUnit),
		lastUnitPrice: lastPoint?.unitPrice ?? null,
		lastUnitPriceLabel: lastPoint?.unitPriceLabel || '',
		priceUnit,
		purchaseCount: purchaseIds.size,
		history,
		recentPurchases: [...history].sort(compareHistoryPointDesc),
		priceChartPoints,
		storePrices
	}
}

export {
	UNKNOWN_CATEGORY_ID,
	UNKNOWN_CATEGORY_NAME,
	buildProductDetail,
	calculateProductAnalytics,
	roundMoney
}
