const listeners = new Set()

const PRODUCT_CATALOG_CHANGED_EVENT = 'hboo:product-catalog-changed'

const notifyProductCatalogChanged = (detail = {}) => {
	const payload = {
		entityType: detail.entityType || 'catalog',
		action: detail.action || 'change',
		timestamp: Date.now()
	}
	listeners.forEach(listener => listener(payload))
	if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
		window.dispatchEvent(new CustomEvent(PRODUCT_CATALOG_CHANGED_EVENT, {detail: payload}))
	}
	return payload
}

const subscribeProductCatalogChanges = listener => {
	if (typeof listener !== 'function') return () => {}
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export {
	PRODUCT_CATALOG_CHANGED_EVENT,
	notifyProductCatalogChanged,
	subscribeProductCatalogChanges
}
