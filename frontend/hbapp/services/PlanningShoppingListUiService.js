const defaultEscapeHtml = value => String(value ?? '')
	.replaceAll('&', '&amp;')
	.replaceAll('<', '&lt;')
	.replaceAll('>', '&gt;')
	.replaceAll('"', '&quot;')
	.replaceAll("'", '&#039;')

const renderShoppingProductSuggestions = (products = [], {escapeHtml = defaultEscapeHtml} = {}) => {
	return products.map(product => `
		<button type="button" data-action="planning-shopping-select-product" data-product-id="${product.id}">
			${escapeHtml(product.name)} <span>${escapeHtml(product.categoryName || '')}</span>
		</button>
	`).join('')
}

const applySelectedShoppingProduct = (form, product) => {
	if (!form || !product) return false
	const nameInput = form.querySelector('[name="name"]')
	const productIdInput = form.querySelector('[name="productId"]')
	const suggestions = form.querySelector('[data-shopping-suggestions]')
	const amountInput = form.querySelector('[name="amount"]')

	if (nameInput) {
		nameInput.value = product.name
		if (!nameInput.dataset) nameInput.dataset = {}
		nameInput.dataset.selectedProductName = product.name
	}
	if (productIdInput) productIdInput.value = product.id
	if (suggestions) suggestions.innerHTML = ''
	if (amountInput && typeof amountInput.focus === 'function') amountInput.focus()

	return true
}

const syncShoppingProductIdentityFromNameInput = input => {
	if (!input) return
	const form = input.closest('[data-shopping-editor]')
	if (!form) return
	const productIdInput = form.querySelector('[name="productId"]')
	const selectedName = input.dataset.selectedProductName || ''
	if (!productIdInput?.value) return
	if (String(input.value || '').trim() !== selectedName) {
		productIdInput.value = ''
		input.dataset.selectedProductName = ''
	}
}

const parseShoppingAmount = value => {
	const amountText = String(value || '').trim().replace(',', '.')
	if (!amountText) return null
	const amount = Number(amountText)
	return Number.isFinite(amount) && amount > 0 ? amount : null
}

const getShoppingItemEditorData = (editor, {createId, position = 0, now = Date.now} = {}) => {
	if (!editor) return null
	const name = String(editor.querySelector('[name="name"]')?.value || '').trim()
	if (!name) return null
	const existingId = editor.dataset.shoppingId || editor.dataset.checklistId || ''
	const localId = editor.dataset.shoppingLocalId || existingId || createId()
	const serverId = editor.dataset.shoppingServerId || null

	return {
		id: existingId || localId,
		localId,
		serverId,
		productId: editor.querySelector('[name="productId"]')?.value || null,
		name,
		title: name,
		amount: parseShoppingAmount(editor.querySelector('[name="amount"]')?.value),
		unit: editor.querySelector('[name="unit"]')?.value || null,
		checked: editor.dataset.checklistChecked === 'true' || editor.dataset.shoppingChecked === 'true',
		position,
		createdAt: Number(editor.dataset.shoppingCreatedAt) || now(),
		updatedAt: now()
	}
}

const buildShoppingItemFromFormData = (formData, {createId, position = 0, now = Date.now} = {}) => {
	const name = String(formData.get('name') || '').trim()
	if (!name) return null
	const localId = createId()

	return {
		id: localId,
		localId,
		productId: formData.get('productId') || null,
		name,
		title: name,
		amount: parseShoppingAmount(formData.get('amount')),
		unit: formData.get('unit') || null,
		checked: false,
		position,
		createdAt: now(),
		updatedAt: now()
	}
}

export {
	applySelectedShoppingProduct,
	buildShoppingItemFromFormData,
	getShoppingItemEditorData,
	renderShoppingProductSuggestions,
	syncShoppingProductIdentityFromNameInput
}
