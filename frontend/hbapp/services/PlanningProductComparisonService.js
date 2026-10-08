import {normalizeQuantity} from './ProductUnitService.js'

const EPSILON = 0.000001

const toProductId = value => {
	if (value === null || value === undefined || value === '') return null
	const id = Number(value)
	return Number.isInteger(id) && id > 0 ? id : null
}

const toAmount = value => {
	if (value === null || value === undefined || value === '') return null
	const amount = Number(value)
	return Number.isFinite(amount) && amount > 0 ? amount : null
}

const formatAmount = value => value === null || value === undefined
	? null
	: Number(Number(value).toFixed(6))

const emptyQuantity = () => ({
	amount: null,
	unit: null,
	normalizedAmount: null,
	normalizedUnit: null,
	comparable: false
})

const buildQuantity = (amount, unit) => {
	const value = toAmount(amount)
	if (value === null || !unit) return emptyQuantity()
	const normalized = normalizeQuantity(value, unit)
	if (!normalized || normalized.quantity <= 0) {
		return {
			amount: formatAmount(value),
			unit,
			normalizedAmount: null,
			normalizedUnit: null,
			comparable: false
		}
	}

	return {
		amount: formatAmount(value),
		unit,
		normalizedAmount: formatAmount(normalized.quantity),
		normalizedUnit: normalized.unit,
		comparable: true
	}
}

const mergeQuantity = (current, next) => {
	if (!current) return next
	if (!current.comparable || !next.comparable || current.normalizedUnit !== next.normalizedUnit) {
		return {
			...current,
			amount: null,
			unit: null,
			normalizedAmount: null,
			normalizedUnit: null,
			comparable: false
		}
	}

	const normalizedAmount = current.normalizedAmount + next.normalizedAmount
	return {
		amount: formatAmount(normalizedAmount),
		unit: current.normalizedUnit,
		normalizedAmount: formatAmount(normalizedAmount),
		normalizedUnit: current.normalizedUnit,
		comparable: true
	}
}

const publicQuantity = quantity => (!quantity || quantity.amount === null || !quantity.unit)
	? {amount: null, unit: null}
	: {amount: formatAmount(quantity.amount), unit: quantity.unit}

const compareQuantity = (planned, purchased) => {
	if (!planned?.comparable) return 'purchased'
	if (!purchased?.comparable || planned.normalizedUnit !== purchased.normalizedUnit) return 'not_comparable'
	const difference = purchased.normalizedAmount - planned.normalizedAmount
	if (Math.abs(difference) <= EPSILON) return 'matched'
	return difference < 0 ? 'under' : 'over'
}

const aggregatePlanned = (shoppingItems = []) => {
	const products = new Map()
	let unresolvedPlannedItems = 0

	shoppingItems.forEach((item, index) => {
		const productId = toProductId(item.productId ?? item.product_id)
		if (!productId) {
			unresolvedPlannedItems += 1
			return
		}

		const key = String(productId)
		const current = products.get(key) || {
			productId,
			productName: item.productName || item.name || 'Product',
			firstPosition: Number.isFinite(Number(item.position)) ? Number(item.position) : index,
			plannedQuantity: null
		}
		current.plannedQuantity = mergeQuantity(current.plannedQuantity, buildQuantity(item.amount, item.unit))
		products.set(key, current)
	})

	return {
		products: Array.from(products.values()).sort((left, right) => {
			const positionDiff = left.firstPosition - right.firstPosition
			if (positionDiff) return positionDiff
			return String(left.productName || '').localeCompare(String(right.productName || ''), 'uk')
		}),
		unresolvedPlannedItems
	}
}

const aggregatePurchased = (purchaseItems = []) => {
	const products = new Map()
	let unresolvedPurchaseItems = 0

	purchaseItems.forEach((item, index) => {
		const productId = toProductId(item.productId ?? item.product_id)
		if (!productId) {
			unresolvedPurchaseItems += 1
			return
		}

		const key = String(productId)
		const current = products.get(key) || {
			productId,
			productName: item.productName || item.rawName || item.raw_name || 'Product',
			firstPosition: index,
			purchasedQuantity: null,
			itemCount: 0
		}
		current.purchasedQuantity = mergeQuantity(current.purchasedQuantity, buildQuantity(item.quantity ?? item.amount, item.unit))
		current.itemCount += 1
		products.set(key, current)
	})

	return {
		products: Array.from(products.values()).sort((left, right) => {
			const positionDiff = left.firstPosition - right.firstPosition
			if (positionDiff) return positionDiff
			return String(left.productName || '').localeCompare(String(right.productName || ''), 'uk')
		}),
		unresolvedPurchaseItems
	}
}

const buildPlanningProductComparison = (shoppingItems = [], purchaseItems = []) => {
	const planned = aggregatePlanned(shoppingItems)
	const purchased = aggregatePurchased(purchaseItems)
	const purchasedById = new Map(purchased.products.map(product => [String(product.productId), product]))
	const plannedById = new Map(planned.products.map(product => [String(product.productId), product]))
	const purchaseHasResolvedProducts = purchased.products.length > 0

	const plannedRows = planned.products.map(product => {
		const factual = purchasedById.get(String(product.productId)) || null
		const status = factual
			? compareQuantity(product.plannedQuantity, factual.purchasedQuantity)
			: (purchaseHasResolvedProducts || purchased.unresolvedPurchaseItems === 0 ? 'not_purchased' : 'not_comparable')

		return {
			productId: product.productId,
			productName: product.productName,
			planned: publicQuantity(product.plannedQuantity),
			purchased: factual ? publicQuantity(factual.purchasedQuantity) : null,
			status
		}
	})

	const unplannedPurchased = purchased.products
		.filter(product => !plannedById.has(String(product.productId)))
		.map(product => ({
			productId: product.productId,
			productName: product.productName,
			planned: null,
			purchased: publicQuantity(product.purchasedQuantity),
			status: 'unplanned'
		}))

	return {
		planned: plannedRows,
		unplannedPurchased,
		summary: {
			plannedProducts: plannedRows.length,
			purchasedPlannedProducts: plannedRows.filter(row => row.purchased).length,
			notPurchasedProducts: plannedRows.filter(row => row.status === 'not_purchased').length,
			unplannedPurchasedProducts: unplannedPurchased.length,
			resolvedPurchaseItems: purchased.products.reduce((sum, product) => sum + product.itemCount, 0),
			unresolvedPurchaseItems: purchased.unresolvedPurchaseItems,
			unresolvedPlannedItems: planned.unresolvedPlannedItems
		}
	}
}

export {
	buildPlanningProductComparison
}
