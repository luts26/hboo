import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.resolve(__dirname, '../hbapp/pages/PurchasePage.js'), 'utf8')

const extractMethod = name => {
	const declaration = new RegExp(`\\n\\t(?:async )?${name}\\(`).exec(source)
	if (!declaration) return ''
	const start = declaration.index + 2
	const bodyStart = source.indexOf(') {', start) + 2
	if (bodyStart < 2) return ''
	let depth = 0
	for (let index = bodyStart; index < source.length; index += 1) {
		if (source[index] === '{') depth += 1
		if (source[index] === '}') {
			depth -= 1
			if (depth === 0) return source.slice(start, index + 1)
		}
	}
	return ''
}

test('manual and Receipt Review Merchant fields expose one shared New Merchant modal', () => {
	assert.match(source, /data-merchant-target="manual">\+ New/)
	assert.match(source, /data-merchant-target="review">\+ New/)
	assert.match(source, /<h4 id="new-merchant-title">New merchant<\/h4>/)
	assert.match(source, /data-purchase-action="create-new-merchant"/)
	assert.match(source, /data-purchase-action="close-new-merchant"/)
})

test('New Merchant validates, trims and prevents repeated submissions', () => {
	const create = extractMethod('createNewMerchant')
	assert.match(create, /if \(!form\.open \|\| form\.saving\) return/)
	assert.match(create, /String\(form\.name \|\| ''\)\.trim\(\)/)
	assert.match(create, /Merchant name is required/)
	assert.match(create, /form\.saving = true/)
	assert.match(create, /apiService\.createMerchant\(name\)/)
})

test('existing normalized Merchant is offered for selection instead of duplicated', () => {
	const find = extractMethod('findMerchantByName')
	const create = extractMethod('createNewMerchant')
	const select = extractMethod('selectExistingMerchant')
	assert.match(find, /normalizeComparableText\(name\)/)
	assert.match(find, /normalizeComparableText\(merchant\.name\) === normalizedName/)
	assert.match(create, /form\.existingMerchantId = existing\.id/)
	assert.match(select, /selectMerchantForActiveForm\(merchant\)/)
})

test('successful local creation immediately selects Merchant and preserves active form objects', () => {
	const create = extractMethod('createNewMerchant')
	const select = extractMethod('selectMerchantForActiveForm')
	assert.match(create, /this\.state\.merchants\.push\(merchant\)/)
	assert.match(create, /this\.selectMerchantForActiveForm\(merchant\)/)
	assert.match(create, /this\.closeNewMerchant\(\)/)
	assert.match(select, /this\.state\.form\.merchantId = merchant\.id/)
	assert.match(select, /this\.state\.receiptReview\.form\.merchantId = merchant\.id/)
	assert.doesNotMatch(select, /this\.state\.form =|this\.state\.receiptReview =/)
})

test('XML selection is persisted but confirmed Merchant mapping remains explicit', () => {
	const select = extractMethod('selectMerchantForActiveForm')
	assert.match(select, /merchantMappingSaved = false/)
	assert.match(select, /merchantMatchStatus = 'selected'/)
	assert.match(select, /persistXmlMerchantSelection/)
	assert.doesNotMatch(select, /xmlMerchantMappingRepository\.save|rememberReceiptReviewMerchant/)
})

test('Merchant local-to-server replacement refreshes open forms', () => {
	const replace = extractMethod('handleMerchantIdReplacement')
	assert.match(replace, /this\.state\.form\.merchantId = serverId/)
	assert.match(replace, /this\.state\.receiptReview\.form\.merchantId = serverId/)
	assert.match(replace, /getMerchants\(\{includeDisabled: true\}\)/)
	assert.match(replace, /persistXmlMerchantSelection/)
})
