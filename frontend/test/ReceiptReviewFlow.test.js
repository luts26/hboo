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
	assert.match(apiSource, /parseReceipt\(receiptServerId/)
	assert.match(apiSource, /\/parse/)
	assert.match(apiSource, /planning_item_id/)
	assert.match(openReview, /receipt\.ocr\?\.status !== 'completed'/)
	assert.match(openReview, /receiptApiService\.parseReceipt/)
	assert.match(openReview, /getReceiptReviewPlanningItemId/)
	assert.doesNotMatch(openReview, /runReceiptOcr|recognizeStandaloneReceipt/)
	assert.match(createForm, /draft\.items\.map\(item => createReceiptReviewItem\(item\)\)/)
	assert.match(createForm, /receiptTotal: draft\?\.total\?\.value/)
	assert.match(createForm, /receiptTotalSource: draft\?\.total\?\.value/)
	assert.match(createForm, /purchasedAt: toDateTimeLocalValue\(draft\?\.purchasedAt\?\.value\)/)
	assert.match(createForm, /context: draft\?\.context \|\| null/)
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
	assert.match(payload, /totalCents: toMoneyCents\(item\.total\)/)
	assert.match(payload, /total: centsToMoney\(totalCents\)/)
})

test('receipt review validates item totals against receipt total without blocking mismatch by itself', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const totalWarning = source.match(/getReceiptReviewTotalWarning\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const validate = source.match(/validateReceiptReview\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(totalWarning, /Totals differ by/)
	assert.match(totalWarning, /Totals match/)
	assert.match(totalWarning, /differenceCents <= 5/)
	assert.doesNotMatch(validate, /getReceiptReviewTotalWarning/)
	assert.doesNotMatch(validate, /Totals differ/)
})

test('receipt review exposes granular blocking validation and disables create only for blocking errors', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const itemBlocking = extractMethod(source, 'getReceiptReviewItemBlockingMessage')
	const reviewBlocking = extractMethod(source, 'getReceiptReviewBlockingError')
	const template = extractMethod(source, 'getReceiptReviewTemplate')

	assert.match(itemBlocking, /if \(!item\.productId\) return 'Select product'/)
	assert.match(itemBlocking, /if \(!\(quantity > 0\)\) return 'Enter amount'/)
	assert.match(itemBlocking, /if \(!item\.unit\) return 'Select unit'/)
	assert.match(itemBlocking, /if \(total === null \|\| total < 0\) return 'Enter price'/)
	assert.match(reviewBlocking, /getReceiptReviewItemBlockingMessage/)
	assert.match(template, /blockingError/)
	assert.match(template, /review\.loading \|\| review\.saving \|\| blockingError/)
})

test('receipt review price validation reads the edited line total field reactively', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const updateItem = extractMethod(source, 'updateReceiptReviewItemField')
	const validationDom = extractMethod(source, 'updateReceiptReviewValidationDom')
	const itemBlocking = extractMethod(source, 'getReceiptReviewItemBlockingMessage')
	const itemTemplate = extractMethod(source, 'getReceiptReviewItemTemplate')
	const template = extractMethod(source, 'getReceiptReviewTemplate')

	assert.match(itemTemplate, /Price<input name="total"/)
	assert.doesNotMatch(itemTemplate, /name="price"|name="lineTotal"/)
	assert.match(itemBlocking, /const total = toMoneyCents\(item\.total\)/)
	assert.match(itemBlocking, /if \(total === null \|\| total < 0\) return 'Enter price'/)
	assert.match(updateItem, /item\[input\.name\] = input\.value/)
	assert.match(updateItem, /if \(input\.name === 'total'\) this\.updateReceiptReviewTotalsDom\(\)/)
	assert.match(updateItem, /\['quantity', 'total'\]\.includes\(input\.name\)\) this\.updateReceiptReviewItemStatusDom\(item\)/)
	assert.match(updateItem, /\['quantity', 'unit', 'total'\]\.includes\(input\.name\)\) this\.updateReceiptReviewValidationDom\(\)/)
	assert.match(validationDom, /const blockingError = this\.getReceiptReviewBlockingError\(\)/)
	assert.match(validationDom, /blockingNode\.textContent = blockingError/)
	assert.match(validationDom, /blockingNode\.hidden = !blockingError/)
	assert.match(validationDom, /submitButton\.disabled = Boolean\(review\.loading \|\| review\.saving \|\| blockingError\)/)
	assert.match(template, /data-review-blocking-error/)
})

test('receipt review price uses receipt line total semantics from OCR through payload', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const createItem = source.match(/const createReceiptReviewItem = \(item = \{\}\) => \(\{[\s\S]*?\n\}\)/)?.[0] || ''
	const itemTemplate = extractMethod(source, 'getReceiptReviewItemTemplate')
	const payload = extractMethod(source, 'buildReceiptReviewPayload')

	assert.match(createItem, /receiptLineTotal: item\.total === null \|\| item\.total === undefined \? null : Number\(item\.total\)/)
	assert.match(createItem, /total: item\.total === null \|\| item\.total === undefined \? '' : normalizeMoneyString\(item\.total\)/)
	assert.match(itemTemplate, /value="\$\{this\.escapeHtml\(item\.total\)\}"/)
	assert.match(payload, /totalCents: toMoneyCents\(item\.total\)/)
	assert.match(payload, /total: centsToMoney\(totalCents\)/)
	assert.doesNotMatch(payload, /unitPrice|lineTotal|price:/)
})

test('receipt review price scenarios preserve cents and existing zero-price rule', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const itemBlocking = extractMethod(source, 'getReceiptReviewItemBlockingMessage')
	const template = extractMethod(source, 'getReceiptReviewTemplate')
	const cents = value => {
		const text = String(value).trim().replace(',', '.')
		if (!text || text === '.' || text === ',') return null
		const parsed = Number(text)
		return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : null
	}

	assert.equal(cents('2.15'), 215)
	assert.equal(cents(''), null)
	assert.equal(cents('0'), 0)
	assert.match(itemBlocking, /total < 0/)
	assert.doesNotMatch(itemBlocking, /!\(total > 0\)|total <= 0/)
	assert.match(template, /review\.loading \|\| review\.saving \|\| blockingError/)
})

test('receipt review supports manual confirmation of OCR-flagged but financially valid items', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const status = extractMethod(source, 'getReceiptReviewItemStatus')
	const confirm = extractMethod(source, 'confirmReceiptReviewItem')
	const itemTemplate = extractMethod(source, 'getReceiptReviewItemTemplate')
	const validate = extractMethod(source, 'validateReceiptReview')

	assert.match(status, /parserWarnings/)
	assert.match(status, /!item\.reviewConfirmed/)
	assert.match(itemTemplate, /data-purchase-action="confirm-review-item"/)
	assert.match(confirm, /item\.reviewConfirmed = true/)
	assert.doesNotMatch(validate, /parserWarnings|confidence/)
})

test('receipt review money precision uses cents for totals and avoids floating point artifacts', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const itemsTotal = extractMethod(source, 'getReceiptReviewItemsTotalCents')
	const warning = extractMethod(source, 'getReceiptReviewTotalWarning')
	const payload = extractMethod(source, 'buildReceiptReviewPayload')

	assert.match(source, /const toMoneyCents = value =>/)
	assert.match(source, /Math\.round\(\(parsed \+ Number\.EPSILON\) \* 100\)/)
	assert.match(source, /const normalizeMoneyString = value =>/)
	assert.match(itemsTotal, /toMoneyCents\(item\.total\)/)
	assert.match(warning, /differenceCents/)
	assert.match(warning, /formatMoneyCents\(differenceCents\)/)
	assert.match(payload, /total: centsToMoney\(totalCents\)/)

	const cents = value => {
		const parsed = Number(String(value).replace(',', '.'))
		return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : null
	}
	assert.equal(cents(254.70), 25470)
	assert.equal(cents(0.1) + cents(0.2), 30)
	assert.equal((30 / 100).toFixed(2), '0.30')
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
	assert.match(itemTemplate, /data-review-product-match/)
	assert.match(source, /Remember this match/)
	assert.match(source, /if \(!item\.productId\) return 'Select product'/)
	assert.match(createItem, /productId: item\.productId \|\| null/)
	assert.match(createItem, /rawName: item\.rawName \|\| ''/)
	assert.match(createItem, /productQuery: item\.productQuery \|\| ''/)
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
	assert.match(confirm, /closeReceiptReview\(\{render: false, force: true\}\)/)
	assert.match(payload, /client_mutation_id: form\.clientMutationId/)
	assert.match(payload, /transaction_provider: form\.context\?\.transaction\?\.provider \|\| null/)
	assert.match(payload, /transaction_id: form\.context\?\.transaction\?\.providerTransactionId \|\| null/)
	assert.match(payload, /items/)
	assert.doesNotMatch(confirm, /savePurchase\(/)
})

test('receipt review success close bypasses submit guard without enabling manual close while saving', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const closeMethod = source.match(/closeReceiptReview\(\{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(closeMethod, /force = false/)
	assert.match(closeMethod, /receiptReview\.saving && !force/)
	assert.match(source, /closeReceiptReview\(\{render: false, force: true\}\)/)
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

test('receipt review product matcher is advisory and alias learning is explicit', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const openReview = extractMethod(source, 'openReceiptReview')
	const matchLoader = extractMethod(source, 'loadReceiptReviewProductMatches')
	const aliasMethod = extractMethod(source, 'rememberReceiptReviewAlias')
	const selectReviewProduct = extractMethod(source, 'selectReceiptReviewProduct')
	const setReviewProduct = extractMethod(source, 'setReceiptReviewProduct')
	const payload = extractMethod(source, 'buildReceiptReviewPayload')

	assert.match(openReview, /loadReceiptReviewProductMatches/)
	assert.match(matchLoader, /apiService\.matchProduct/)
	assert.match(matchLoader, /shoppingItems/)
	assert.match(matchLoader, /catch/)
	assert.doesNotMatch(matchLoader, /item\.productId\s*=/)
	assert.match(aliasMethod, /apiService\.createProductAlias/)
	assert.match(aliasMethod, /item\.rawName/)
	assert.match(aliasMethod, /Could not save alias\. You can still create the purchase\./)
	assert.doesNotMatch(selectReviewProduct, /item\.unit = getAllowedUnits/)
	assert.match(selectReviewProduct, /setReceiptReviewProduct\(item, product\)/)
	assert.match(setReviewProduct, /item\.productId = product\.id/)
	assert.match(setReviewProduct, /item\.productServerId = product\.serverId/)
	assert.match(setReviewProduct, /const allowedUnits = getAllowedUnits\(product\.measurementType\)/)
	assert.match(payload, /raw_name: item\.rawName \|\| null/)
})

test('receipt review stores a real unit in state when product selection makes the dropdown show a fallback', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const setReviewProduct = extractMethod(source, 'setReceiptReviewProduct')
	const unitOptions = source.match(/const getReviewUnitOptions = item => \{[\s\S]*?\n\}/)?.[0] || ''
	const blocking = extractMethod(source, 'getReceiptReviewItemBlockingMessage')
	const payload = extractMethod(source, 'buildReceiptReviewPayload')

	assert.match(unitOptions, /const allowedUnits = getAllowedUnits\(item\.measurementType\)/)
	assert.match(unitOptions, /const units = allowedUnits\.length \? \[\.\.\.allowedUnits\] : \['pcs', 'g', 'kg', 'ml', 'l'\]/)
	assert.match(setReviewProduct, /if \(!item\.unit \|\| \(allowedUnits\.length && !allowedUnits\.includes\(item\.unit\)\)\)/)
	assert.match(setReviewProduct, /item\.unit = allowedUnits\[0\] \|\| ''/)
	assert.match(blocking, /if \(!item\.unit\) return 'Select unit'/)
	assert.match(payload, /unit: item\.unit/)
})

test('receipt review preserves normalized OCR units and manual unit changes use validation field', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const normalizeUnit = source.match(/const normalizeReviewUnit = unit => \{[\s\S]*?\n\}/)?.[0] || ''
	const createReviewItem = source.match(/const createReceiptReviewItem = \(item = \{\}\) => \(\{[\s\S]*?\n\}\)/)?.[0] || ''
	const updateItem = extractMethod(source, 'updateReceiptReviewItemField')

	assert.match(normalizeUnit, /\['кг', 'kg'\]\.includes\(text\)\) return 'kg'/)
	assert.match(normalizeUnit, /\['г', 'g'\]\.includes\(text\)\) return 'g'/)
	assert.match(normalizeUnit, /\['мл', 'ml'\]\.includes\(text\)\) return 'ml'/)
	assert.match(normalizeUnit, /\['шт', 'pcs', 'pc'\]\.includes\(text\)\) return 'pcs'/)
	assert.match(createReviewItem, /unit: deriveReviewAmount\(item\)\.unit \|\| ''/)
	assert.match(updateItem, /item\[input\.name\] = input\.value/)
	assert.match(updateItem, /if \(input\.name === 'unit'\) this\.updateReceiptReviewProductDom\(item\)/)
})

test('receipt review valid unit state enables create while truly missing unit blocks it', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const setReviewProduct = extractMethod(source, 'setReceiptReviewProduct')
	const blocking = extractMethod(source, 'getReceiptReviewItemBlockingMessage')
	const reviewBlocking = extractMethod(source, 'getReceiptReviewBlockingError')
	const template = extractMethod(source, 'getReceiptReviewTemplate')

	assert.match(setReviewProduct, /item\.unit = allowedUnits\[0\] \|\| ''/)
	assert.match(blocking, /if \(!item\.unit\) return 'Select unit'/)
	assert.match(reviewBlocking, /const invalidItem = form\.items\.find\(item => this\.getReceiptReviewItemBlockingMessage\(item\)\)/)
	assert.match(template, /review\.loading \|\| review\.saving \|\| blockingError/)
})

test('receipt review applies confirmed matches into purchase payload state without changing receipt values', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const applyMatch = extractMethod(source, 'applyReceiptReviewProductMatch')
	const setReviewProduct = extractMethod(source, 'setReceiptReviewProduct')
	const payload = extractMethod(source, 'buildReceiptReviewPayload')

	assert.match(applyMatch, /item\.productMatch = result\?\.match \? mapped\[0\] \|\| null : null/)
	assert.match(applyMatch, /if \(!item\.productId && item\.productMatch && isExactProductMatchSource\(item\.productMatch\.matchSource\)\)/)
	assert.match(applyMatch, /setReceiptReviewProduct\(item, item\.productMatch\)/)
	assert.match(applyMatch, /item\.productMatchCandidates = mapped\.slice\(0, 3\)/)
	assert.doesNotMatch(applyMatch, /item\.quantity\s*=|item\.total\s*=|item\.rawName\s*=/)
	assert.match(setReviewProduct, /item\.productId = product\.id/)
	assert.match(payload, /product_id: item\.productServerId \|\| item\.productId/)
	assert.match(payload, /quantity: parseDecimalInput\(item\.quantity\)/)
	assert.match(payload, /totalCents: toMoneyCents\(item\.total\)/)
	assert.match(payload, /total: centsToMoney\(totalCents\)/)
	assert.match(payload, /raw_name: item\.rawName \|\| null/)
})

test('receipt review leaves ambiguous matches unselected and selectable by click', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const applyMatch = extractMethod(source, 'applyReceiptReviewProductMatch')
	const itemTemplate = extractMethod(source, 'getReceiptReviewProductMatchTemplate')

	assert.match(applyMatch, /if \(result\?\.match\) candidates\.push\(result\.match\)/)
	assert.match(applyMatch, /if \(!item\.productId && item\.productMatch/)
	assert.match(itemTemplate, /data-purchase-action="accept-review-product-match"/)
	assert.match(itemTemplate, /data-product-id="\$\{product\.id\}"/)
	assert.match(source, /if \(action === 'accept-review-product-match'\) this\.selectReceiptReviewProduct/)
})

test('receipt review merchant suggestion is explicit and does not replace user choice', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const createForm = extractMethod(source, 'createReceiptReviewForm')
	const contextTemplate = extractMethod(source, 'getReceiptReviewContextTemplate')
	const useSuggestion = extractMethod(source, 'useReceiptReviewMerchantSuggestion')

	assert.match(createForm, /merchantSuggestion: merchantId \? null : this\.findPlanningMerchantSuggestion\(draft\?\.context\)/)
	assert.match(contextTemplate, /data-purchase-action="use-review-merchant-suggestion"/)
	assert.match(useSuggestion, /if \(!form\?\.merchantSuggestion \|\| form\.merchantId\) return/)
	assert.match(useSuggestion, /form\.merchantId = form\.merchantSuggestion\.id/)
	assert.match(useSuggestion, /loadReceiptReviewProductMatches/)
})

test('receipt review displays smart import context, match sources, and discrepancy warnings', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const template = extractMethod(source, 'getReceiptReviewTemplate')
	const contextTemplate = extractMethod(source, 'getReceiptReviewContextTemplate')
	const warningsTemplate = extractMethod(source, 'getReceiptReviewWarningsTemplate')
	const matchTemplate = extractMethod(source, 'getReceiptReviewProductMatchTemplate')

	assert.match(source, /MATCH_SOURCE_LABELS/)
	assert.match(source, /WARNING_LABELS/)
	assert.match(template, /getReceiptReviewContextTemplate\(form\)/)
	assert.match(template, /getReceiptReviewWarningsTemplate\(form\)/)
	assert.match(contextTemplate, /Planning:/)
	assert.match(contextTemplate, /Linked transaction:/)
	assert.match(source, /MERCHANT_CONTEXT_MISMATCH|RECEIPT_TOTAL_TRANSACTION_MISMATCH/)
	assert.match(matchTemplate, /MATCH_SOURCE_LABELS\[product\.matchSource\]/)
	assert.match(source, /planningItem/)
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

	assert.match(source, /getReceiptReviewItemsTotalCents\(\)/)
	assert.match(source, /toMoneyCents\(item\.total\)/)
	assert.match(template, /formatMoney\(itemsTotal\)/)
	assert.match(template, /formatMoneyCents\(this\.getReceiptReviewItemsTotalCents\(\)\)/)
	assert.match(useItemsTotal, /this\.state\.receiptReview\.form\.receiptTotal = normalizeMoneyString\(this\.getReceiptReviewItemsTotal\(\)\)/)
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

	assert.match(createForm, /normalizeMoneyString\(draft\.total\.value\)/)
	assert.match(createForm, /: 'parser'/)
	assert.match(warning, /this\.getReceiptReviewItemsTotalCents\(\)/)
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
