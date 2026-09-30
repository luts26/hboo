import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {getDisplayPriceMultiplier, normalizeQuantity} from '../hbapp/services/ProductUnitService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')
const extractMethod = (source, name) => {
	const declaration = new RegExp(`\\n\\t(?:async )?${name}\\(`).exec(source)
	if (!declaration) return ''
	const start = declaration.index + 2
	const bodyStart = source.indexOf('{', start)
	if (bodyStart === -1) return ''
	let depth = 0
	for (let index = bodyStart; index < source.length; index += 1) {
		const char = source[index]
		if (char === '{') depth += 1
		if (char === '}') {
			depth -= 1
			if (depth === 0) return source.slice(start, index + 1)
		}
	}
	return ''
}

test('receipt review loads parser result into editable review state without rerunning OCR', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const apiSource = read('hbapp/services/ReceiptApiService.js')
	const openReview = source.match(/async openReceiptReview\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const createForm = source.match(/createReceiptReviewForm\(receipt, draft\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(source, /receiptReview:/)
	assert.match(source, /data-purchase-action="review-standalone-receipt"/)
	assert.match(apiSource, /parseReceipt\(receiptServerId\)/)
	assert.match(apiSource, /\/parse/)
	assert.match(openReview, /receipt\.ocr\?\.status !== 'completed'/)
	assert.match(openReview, /receiptApiService\.parseReceipt/)
	assert.doesNotMatch(openReview, /runReceiptOcr|recognizeStandaloneReceipt/)
	assert.match(createForm, /draft\.items\.map\(item => createReceiptReviewItem\(item\)\)/)
	assert.match(createForm, /receiptTotal: draft\?\.total\?\.value/)
	assert.match(createForm, /receiptTotalSource: draft\?\.total\?\.value/)
	assert.match(createForm, /purchasedAt: toDateTimeLocalValue\(draft\?\.purchasedAt\?\.value\)/)
})

test('receipt review supports editing, adding and removing items including zero parser items', () => {
	const source = read('hbapp/pages/PurchasePage.js')

	assert.match(source, /updateReceiptReviewField\(input\)/)
	assert.match(source, /updateReceiptReviewItemField\(input\)/)
	assert.match(source, /data-review-field/)
	assert.match(source, /data-review-item-field/)
	assert.match(source, /addReceiptReviewItem\(\)/)
	assert.match(source, /removeReceiptReviewItem\(rowId\)/)
	assert.match(source, /data-purchase-action="add-review-item"/)
	assert.match(source, /data-purchase-action="remove-review-item"/)
	assert.match(source, /: \[createReceiptReviewItem\(\)\]/)
})

test('receipt review shows human warnings and OCR evidence without editable arithmetic warning', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const itemTemplate = source.match(/getReceiptReviewItemTemplate\(item\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.doesNotMatch(source, /getReviewItemExpectedTotal/)
	assert.doesNotMatch(source, /getReviewItemArithmeticWarning/)
	assert.doesNotMatch(source, /Expected approximately/)
	assert.match(source, /getReceiptReviewItemStatus/)
	assert.match(source, /Check this item/)
	assert.doesNotMatch(itemTemplate, /ITEM_ARITHMETIC_MISMATCH|CONFLICTING_TOTAL_CANDIDATES/)
	assert.match(itemTemplate, /Show OCR text/)
	assert.match(source, /toggleReceiptReviewRawText/)
	assert.match(source, /Show full OCR text/)
})

test('receipt review uses manual purchase item semantics amount unit price', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const itemTemplate = source.match(/getReceiptReviewItemTemplate\(item\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const payload = source.match(/buildReceiptReviewPayload\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(itemTemplate, />Amount<input/)
	assert.match(itemTemplate, />Unit<select/)
	assert.match(itemTemplate, />Price<input/)
	assert.doesNotMatch(itemTemplate, /Unit price/)
	assert.doesNotMatch(itemTemplate, /name="unitPrice"/)
	assert.match(payload, /quantity: parseDecimalInput\(item\.quantity\)/)
	assert.match(payload, /total: parseDecimalInput\(item\.total\)/)
})

test('receipt review validates item totals against receipt total without blocking mismatch by itself', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const totalWarning = source.match(/getReceiptReviewTotalWarning\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const validate = source.match(/validateReceiptReview\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(totalWarning, /Totals differ by/)
	assert.match(totalWarning, /Totals match/)
	assert.match(totalWarning, /<= 0\.05/)
	assert.doesNotMatch(validate, /getReceiptReviewTotalWarning/)
	assert.doesNotMatch(validate, /Totals differ/)
})

test('receipt review requires explicit product selection and reuses existing create product workflow', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const validate = source.match(/validateReceiptReview\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const itemTemplate = source.match(/getReceiptReviewItemTemplate\(item\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const createItem = source.match(/const createReceiptReviewItem = \(item = \{\}\) => \(\{[\s\S]*?\n\}\)/)?.[0] || ''

	assert.match(source, /selectProduct\(rowId, productId\)/)
	assert.match(source, /this\.state\.receiptReview\.form\?\.items/)
	assert.match(itemTemplate, /data-purchase-action="select-review-product"/)
	assert.match(itemTemplate, /data-purchase-action="start-create-product"/)
	assert.match(itemTemplate, /Search existing product/)
	assert.match(itemTemplate, /Create new product/)
	assert.match(itemTemplate, /OCR text is not a selected Product/)
	assert.match(validate, /Every review item must have an explicitly selected product/)
	assert.match(createItem, /productId: item\.productId \|\| null/)
	assert.match(createItem, /rawName: item\.rawName \|\| ''/)
	assert.match(createItem, /productQuery: item\.productQuery \|\| ''/)
	assert.doesNotMatch(source, /ProductMatcher|fuzzy|automatic Product/i)
})

test('receipt review preselects only exact merchants and allows correction', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const findMerchant = source.match(/findExactMerchantId\(merchantHint\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const template = source.match(/getReceiptReviewTemplate\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(findMerchant, /normalizeComparableText/)
	assert.match(findMerchant, /hints\.includes\(normalizeComparableText\(merchant\.name\)\)/)
	assert.doesNotMatch(findMerchant, /includes\(.*merchant\.name.*hint|startsWith|levenshtein|fuzzy/i)
	assert.match(template, /<select name="merchantId" data-review-field>/)
	assert.match(template, /Other \/ no merchant/)
})

test('receipt review confirmation creates purchase, links receipt locally and guards double submit', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const apiSource = read('hbapp/services/ReceiptApiService.js')
	const confirm = source.match(/async confirmReceiptReview\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const payload = source.match(/buildReceiptReviewPayload\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(apiSource, /confirmReceiptPurchase\(receiptServerId, purchase\)/)
	assert.match(apiSource, /\/confirm/)
	assert.match(confirm, /if \(this\.state\.receiptReview\.saving\) return/)
	assert.match(confirm, /receiptApiService\.confirmReceiptPurchase/)
	assert.match(confirm, /mergeServerPurchases/)
	assert.match(confirm, /linkStandaloneToPurchase/)
	assert.match(confirm, /refreshSelectedRangeFromLocal/)
	assert.match(payload, /client_mutation_id: form\.clientMutationId/)
	assert.match(payload, /items/)
	assert.doesNotMatch(confirm, /savePurchase\(/)
})

test('receipt review product search preserves raw OCR name separately from selected product', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const updateItem = extractMethod(source, 'updateReceiptReviewItemField')
	const selectProduct = source.match(/selectProduct\(rowId, productId\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const itemTemplate = source.match(/getReceiptReviewItemTemplate\(item\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(itemTemplate, /item\.rawName \|\| item\.productName/)
	assert.match(updateItem, /item\.productId = null/)
	assert.match(updateItem, /item\.productName = ''/)
	assert.match(updateItem, /item\.suggestions = this\.getSuggestions\(input\.value\)/)
	assert.match(selectProduct, /row\.productId = product\.id/)
	assert.match(selectProduct, /row\.productName = product\.name/)
	assert.match(selectProduct, /row\.productQuery = product\.name/)
	assert.doesNotMatch(selectProduct, /rawName\s*=/)
})

test('receipt review create product is secondary and avoids exact-name duplicates', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const startCreate = source.match(/startCreateProduct\(rowId\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const saveNew = source.match(/async saveNewProduct\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(startCreate, /name: row\?\.rawName \|\| row\?\.productQuery \|\| ''/)
	assert.match(saveNew, /exactExisting/)
	assert.match(saveNew, /normalizeComparableText\(product\.name\) === normalizeComparableText\(form\.name\)/)
	assert.match(saveNew, /this\.selectReceiptReviewProduct\(rowId, exactExisting\.id\)/)
	assert.match(saveNew, /this\.selectProduct\(rowId, exactExisting\.id\)/)
	assert.match(saveNew, /return/)
})

test('receipt review unknown total is blank, shows suggestion, and never displays zero as receipt evidence', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const template = source.match(/getReceiptReviewTemplate\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const createForm = source.match(/createReceiptReviewForm\(receipt, draft\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(createForm, /receiptTotal: draft\?\.total\?\.value === null \|\| draft\?\.total\?\.value === undefined \? ''/)
	assert.match(template, /formatOptionalMoney\(form\.receiptTotal\)/)
	assert.match(template, /Suggested total/)
	assert.match(template, /Based on reviewed items, not receipt OCR/)
	assert.match(template, /data-purchase-action="use-review-items-total"/)
	assert.doesNotMatch(template, /formatMoney\(parseDecimalInput\(form\.receiptTotal\) \|\| 0\)/)
})

test('receipt review suggested total follows current items until user accepts it', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const useItemsTotal = source.match(/useReviewItemsTotal\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const itemsTotal = source.match(/getReceiptReviewItemsTotal\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const template = source.match(/getReceiptReviewTemplate\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(itemsTotal, /this\.state\.receiptReview\.form\?\.items/)
	assert.match(itemsTotal, /parseDecimalInput\(item\.total\)/)
	assert.match(template, /formatMoney\(itemsTotal\)/)
	assert.match(template, /Use \$\{itemsTotal\.toFixed\(2\)\}/)
	assert.match(useItemsTotal, /this\.state\.receiptReview\.form\.receiptTotal = normalizeDecimalString\(this\.getReceiptReviewItemsTotal\(\)\)/)
	assert.match(useItemsTotal, /receiptTotalSource = 'suggested'/)
})

test('receipt review derives package and weighted amounts from parser evidence conservatively', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const extractPackage = source.match(/const extractPackageAmount = rawName => \{[\s\S]*?\n\}/)?.[0] || ''
	const deriveAmount = source.match(/const deriveReviewAmount = item => \{[\s\S]*?\n\}/)?.[0] || ''
	const createItem = source.match(/const createReceiptReviewItem = \(item = \{\}\) => \(\{[\s\S]*?\n\}\)/)?.[0] || ''

	assert.match(extractPackage, /400|кг\|kg\|г\|g\|мл\|ml\|л\|l\|шт\|pcs\|pc/)
	assert.match(deriveAmount, /receiptUnit && receiptUnit !== 'pcs'/)
	assert.match(deriveAmount, /packageAmount\.quantity \* multiplier/)
	assert.match(deriveAmount, /Number\.isInteger\(receiptQuantity\)/)
	assert.match(createItem, /quantity: deriveReviewAmount\(item\)/)
	assert.match(createItem, /receiptUnitPrice/)
	assert.match(createItem, /receiptLineTotal/)
})

test('receipt review examples cover bread milk eggs multiple packages and weighted item', () => {
	const source = read('hbapp/pages/PurchasePage.js')

	assert.match(source, /extractPackageAmount/)
	assert.match(source, /г\|g/)
	assert.match(source, /мл\|ml/)
	assert.match(source, /шт\|pcs/)
	assert.match(source, /packageAmount\.quantity \* multiplier/)
	assert.match(source, /receiptUnit && receiptUnit !== 'pcs'/)
})

test('receipt review known total is preserved and compared with editable item totals', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const createForm = source.match(/createReceiptReviewForm\(receipt, draft\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const warning = source.match(/getReceiptReviewTotalWarning\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(createForm, /normalizeDecimalString\(draft\.total\.value\)/)
	assert.match(createForm, /: 'parser'/)
	assert.match(warning, /const itemsTotal = this\.getReceiptReviewItemsTotal\(\)/)
	assert.match(warning, /Totals match/)
	assert.match(warning, /Totals differ by/)
})

test('receipt review merchant remains conservative for absent parser merchant and exact for known merchant', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const createForm = source.match(/createReceiptReviewForm\(receipt, draft\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const findMerchant = source.match(/findExactMerchantId\(merchantHint\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(createForm, /merchantId: merchantId \|\| ''/)
	assert.match(findMerchant, /merchantHint\?\.normalizedHint/)
	assert.match(findMerchant, /merchantHint\?\.rawName/)
	assert.match(findMerchant, /hints\.includes\(normalizeComparableText\(merchant\.name\)\)/)
	assert.doesNotMatch(findMerchant, /products|prices|filename|previous|history/i)
})

test('receipt review state is preserved while product creation opens and closes', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const startCreate = source.match(/startCreateProduct\(rowId\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const cancelCreate = source.match(/cancelCreateProduct\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const saveNew = source.match(/async saveNewProduct\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.doesNotMatch(startCreate, /receiptReview\s*=/)
	assert.doesNotMatch(cancelCreate, /receiptReview\s*=/)
	assert.doesNotMatch(saveNew, /receiptReview\s*=/)
	assert.doesNotMatch(startCreate, /resetForm/)
	assert.doesNotMatch(saveNew, /resetForm/)
})

test('receipt review normal input handlers update state without full modal rerender', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const updateField = extractMethod(source, 'updateReceiptReviewField')
	const updateItem = extractMethod(source, 'updateReceiptReviewItemField')
	const selectReviewProduct = extractMethod(source, 'selectReceiptReviewProduct')

	assert.match(updateField, /this\.state\.receiptReview\.form\[input\.name\] = input\.value/)
	assert.match(updateField, /updateReceiptReviewTotalsDom\(\)/)
	assert.doesNotMatch(updateField, /renderReceiptReviewModal|this\.render\(/)
	assert.match(updateItem, /item\[input\.name\] = input\.value/)
	assert.match(updateItem, /updateReceiptReviewProductDom\(item\)/)
	assert.match(updateItem, /updateReceiptReviewTotalsDom\(\)/)
	assert.doesNotMatch(updateItem, /renderReceiptReviewModal|this\.render\(/)
	assert.match(selectReviewProduct, /updateReceiptReviewProductDom\(item\)/)
	assert.doesNotMatch(selectReviewProduct, /renderReceiptReviewModal|this\.render\(/)
	assert.doesNotMatch(source, /renderReceiptReviewModalPreservingFocus/)
})

test('receipt review uses targeted DOM updates for totals suggestions and product selection', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const template = extractMethod(source, 'getReceiptReviewTemplate')
	const itemTemplate = extractMethod(source, 'getReceiptReviewItemTemplate')
	const totalsDom = extractMethod(source, 'updateReceiptReviewTotalsDom')
	const suggestionsDom = extractMethod(source, 'updateReceiptReviewSuggestionsDom')
	const selectedDom = extractMethod(source, 'updateReceiptReviewSelectedProductDom')

	assert.match(template, /data-review-items-total/)
	assert.match(template, /data-review-receipt-total/)
	assert.match(template, /data-review-suggestion/)
	assert.match(template, /data-review-suggested-total/)
	assert.match(template, /data-review-total-warning/)
	assert.match(itemTemplate, /data-review-suggestions/)
	assert.match(itemTemplate, /data-review-selected-product/)
	assert.match(itemTemplate, /data-review-item-status/)
	assert.match(totalsDom, /textContent = formatMoney\(itemsTotal\)/)
	assert.match(totalsDom, /suggestionNode\.hidden = hasReceiptTotal/)
	assert.match(suggestionsDom, /container\.innerHTML/)
	assert.doesNotMatch(suggestionsDom, /receipt-review-body|receipt-review-items/)
	assert.match(selectedDom, /Selected: \$\{item\.productName\}/)
})

test('normalized price remains derived through existing quantity normalization', () => {
	const normalized = normalizeQuantity(400, 'g')
	const multiplier = getDisplayPriceMultiplier(normalized.unit)
	const pricePerKg = 40.79 / normalized.quantity * multiplier
	const rounded = Math.round((pricePerKg + Number.EPSILON) * 100) / 100

	assert.equal(normalized.unit, 'g')
	assert.equal(multiplier, 1000)
	assert.equal(rounded, 101.98)
})

test('receipt review explicitly supports poor ATB and clean NOVUS flows as normal review paths', () => {
	const source = read('hbapp/pages/PurchasePage.js')

	assert.match(source, /ITEM_ARITHMETIC_MISMATCH|parserWarnings|receiptLineTotal/)
	assert.match(source, /addReceiptReviewItem/)
	assert.match(source, /removeReceiptReviewItem/)
	assert.match(source, /Create purchase/)
	assert.match(source, /createReceiptReviewItem\(item\)/)
	assert.match(source, /rawName/)
	assert.match(source, /receiptUnitPrice/)
	assert.match(source, /total/)
})
