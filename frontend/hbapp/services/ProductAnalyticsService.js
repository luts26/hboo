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

export {
	UNKNOWN_CATEGORY_ID,
	UNKNOWN_CATEGORY_NAME,
	calculateProductAnalytics,
	roundMoney
}
