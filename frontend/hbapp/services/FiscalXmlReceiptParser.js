const MAX_XML_BYTES = 2 * 1024 * 1024
const MAX_PRODUCTS = 500
const MAX_XML_ELEMENTS = 10000
const SUPPORTED_ENCODINGS = new Map([
	['utf-8', 'utf-8'],
	['utf8', 'utf-8'],
	['windows-1251', 'windows-1251'],
	['cp1251', 'windows-1251']
])

const fail = message => {
	throw new Error(message)
}

const decodeEntities = value => String(value || '')
	.replace(/&quot;/g, '"')
	.replace(/&apos;/g, "'")
	.replace(/&lt;/g, '<')
	.replace(/&gt;/g, '>')
	.replace(/&amp;/g, '&')
	.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
	.replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))

const localTagPattern = name => `(?:[\\w.-]+:)?${name}`

const firstElement = (xml, name) => {
	const pattern = localTagPattern(name)
	return xml.match(new RegExp(`<${pattern}\\b([^>]*)>([\\s\\S]*?)<\\/${pattern}\\s*>`, 'i'))
}

const allElements = (xml, name) => {
	const pattern = localTagPattern(name)
	return [...xml.matchAll(new RegExp(`<${pattern}\\b([^>]*?)(?:\\/\\s*>|>([\\s\\S]*?)<\\/${pattern}\\s*>)`, 'gi'))]
}

const elementText = (xml, name) => {
	const element = firstElement(xml, name)
	return element ? decodeEntities(element[2]).trim() || null : null
}

const parseAttributes = source => {
	const attributes = {}
	const matches = [...String(source || '').matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)]
	matches.forEach(match => {
		attributes[match[1].replace(/^.*:/, '')] = decodeEntities(match[3] ?? match[4] ?? '')
	})
	return attributes
}

const parseInteger = value => /^-?\d+$/.test(String(value ?? '').trim()) ? Number(value) : null

const parseDecimal = value => {
	const text = String(value ?? '').trim().replace(',', '.')
	return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null
}

const decimalToCents = value => {
	const match = String(value ?? '').trim().replace(',', '.').match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/)
	if (!match) return null
	const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'))
	return match[1] ? -cents : cents
}

const normalizeUnit = value => {
	const unit = String(value || '').trim().toLocaleLowerCase('uk-UA').replace(/\.$/, '')
	if (['кг', 'kg'].includes(unit)) return 'kg'
	if (['г', 'гр', 'g'].includes(unit)) return 'g'
	if (['л', 'l'].includes(unit)) return 'l'
	if (['мл', 'ml'].includes(unit)) return 'ml'
	if (['шт', 'штука', 'pcs', 'pc'].includes(unit)) return 'pcs'
	return null
}

const inferPackageSize = name => {
	const normalizedName = String(name || '').replace(/,/g, '.')
	const multiplied = normalizedName.match(/(^|[^\d%])(\d+)\s*[xх×*]\s*(\d+(?:\.\d+)?)\s*(кг|kg|г|гр|g|мл|ml|л|l)(?![\p{L}\d])/iu)
	if (multiplied) {
		return {
			quantity: Number(multiplied[2]) * Number(multiplied[3]),
			unit: normalizeUnit(multiplied[4]),
			text: multiplied[0].trim(),
			confident: true
		}
	}
	const matches = [...normalizedName.matchAll(/(^|[^\d%])(\d+(?:\.\d+)?)\s*(кг|kg|г|гр|g|мл|ml|л|l|шт|pcs|pc)(?![\p{L}\d])/giu)]
		.map(match => ({quantity: Number(match[2]), unit: normalizeUnit(match[3]), text: match[0].trim()}))
		.filter(item => item.quantity > 0 && item.unit)
	if (!matches.length) return null
	const selected = matches[matches.length - 1]
	return {...selected, confident: true}
}

const canonicalQuantity = ({sourceQuantity, sourceUnit, packageSize}) => {
	if (sourceUnit === 'kg') return {quantity: sourceQuantity === null ? null : sourceQuantity * 1000, unit: 'g', mode: 'measured'}
	if (sourceUnit === 'l') return {quantity: sourceQuantity === null ? null : sourceQuantity * 1000, unit: 'ml', mode: 'measured'}
	if (['g', 'ml'].includes(sourceUnit)) return {quantity: sourceQuantity, unit: sourceUnit, mode: 'measured'}
	if (packageSize && sourceQuantity !== null && Number.isInteger(sourceQuantity) && sourceQuantity > 0) {
		let quantity = packageSize.quantity * sourceQuantity
		let unit = packageSize.unit
		if (unit === 'kg') ({quantity, unit} = {quantity: quantity * 1000, unit: 'g'})
		if (unit === 'l') ({quantity, unit} = {quantity: quantity * 1000, unit: 'ml'})
		return {quantity, unit, mode: 'package'}
	}
	if (sourceUnit === 'pcs') return {quantity: sourceQuantity, unit: 'pcs', mode: 'count'}
	return {quantity: sourceQuantity, unit: sourceQuantity === null ? null : 'pcs', mode: 'count'}
}

const timestampToIso = value => {
	const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
	return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}` : null
}

const checkDateTimeToIso = (date, time) => {
	const dateMatch = String(date || '').match(/^(\d{2})(\d{2})(\d{4})$/)
	const timeMatch = String(time || '').match(/^(\d{2})(\d{2})(\d{2})$/)
	return dateMatch && timeMatch
		? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`
		: null
}

const validationResult = (items, totalCents, warnings) => {
	const itemsTotalCents = items.reduce((sum, item) => sum + (item.finalLineAmountCents ?? 0), 0)
	const differenceCents = totalCents === null ? null : itemsTotalCents - totalCents
	if (totalCents === null) warnings.push('TOTAL_NOT_FOUND')
	if (!items.length) warnings.push('ITEMS_NOT_FOUND')
	if (differenceCents !== null && differenceCents !== 0) warnings.push('ITEMS_TOTAL_MISMATCH')
	return {valid: warnings.length === 0, itemsTotalCents, receiptTotalCents: totalCents, differenceCents}
}

const toReviewItem = item => ({
	...item,
	quantityNormalized: true,
	quantity: item.canonicalQuantity,
	unit: item.canonicalUnit,
	unitPrice: item.unitPriceCents === null ? null : item.unitPriceCents / 100,
	total: item.finalLineAmountCents === null ? null : item.finalLineAmountCents / 100,
	rawName: item.originalName,
	rawText: item.originalName,
	confidence: item.warnings.length ? 0.5 : 1,
	validation: {sourceQuantity: item.sourceQuantity, sourceUnit: item.sourceUnit},
	warnings: item.warnings
})

const parseRq = xml => {
	const dat = allElements(xml, 'DAT')[0]
	const end = allElements(xml, 'E').at(-1)
	if (!dat || !end) fail('RQ receipt is missing required fiscal metadata.')
	const datAttributes = parseAttributes(dat[1])
	const endAttributes = parseAttributes(end[1])
	const discounts = allElements(xml, 'D').map(element => {
		const attributes = parseAttributes(element[1])
		return {rowNumber: attributes.N || null, itemRowNumber: attributes.NI || null, amountCents: parseInteger(attributes.SM)}
	})
	const discountByRow = new Map()
	discounts.forEach(discount => {
		if (!discount.itemRowNumber || discount.amountCents === null) return
		discountByRow.set(discount.itemRowNumber, (discountByRow.get(discount.itemRowNumber) || 0) + discount.amountCents)
	})
	const items = allElements(xml, 'P').map(element => {
		const attributes = parseAttributes(element[1])
		const rawQuantity = parseInteger(attributes.Q)
		const sourceQuantity = rawQuantity === null ? 1 : rawQuantity / 1000
		const sourceUnit = normalizeUnit(attributes.AT_TM) || (rawQuantity !== null ? 'pcs' : 'pcs')
		const packageSize = sourceUnit === 'pcs' ? inferPackageSize(attributes.NM) : null
		const canonical = canonicalQuantity({sourceQuantity, sourceUnit, packageSize})
		const grossCents = parseInteger(attributes.SM)
		const discountCents = discountByRow.get(attributes.N) || 0
		const warnings = []
		if (canonical.quantity === null || !canonical.unit) warnings.push('QUANTITY_REVIEW_REQUIRED')
		return toReviewItem({
			rowNumber: attributes.N || null,
			originalName: attributes.NM || '',
			sourceQuantity,
			sourceUnit,
			sourceRawQuantity: attributes.Q ?? null,
			packageCount: sourceUnit === 'pcs' ? sourceQuantity : null,
			packageSize,
			canonicalQuantity: canonical.quantity,
			canonicalUnit: canonical.unit,
			quantityMode: canonical.mode,
			unitPriceCents: parseInteger(attributes.PRC),
			grossLineAmountCents: grossCents,
			discountCents,
			finalLineAmountCents: grossCents === null ? null : grossCents - discountCents,
			barcode: /^\d{8,14}$/.test(attributes.CD || '') ? attributes.CD : null,
			sourceIdentifier: attributes.CD || null,
			merchantItemCode: attributes.C || null,
			warnings
		})
	})
	const warnings = []
	const totalCents = parseInteger(endAttributes.SM)
	const validation = validationResult(items, totalCents, warnings)
	return {
		sourceType: 'xml', sourceFormat: 'RQ',
		merchant: {
			rawName: null,
			legalName: null,
			normalizedHint: null,
			taxId: datAttributes.TN || null,
			address: null,
			pointName: null,
			matchStatus: 'unmatched'
		},
		purchasedAt: {value: timestampToIso(endAttributes.TS), source: 'fiscal'},
		fiscalIdentity: {fiscalRegisterNumber: endAttributes.FN || datAttributes.FN || null, receiptNumber: endAttributes.NO || null, timestamp: endAttributes.TS || null},
		items, discounts, total: {minorUnits: totalCents, value: totalCents === null ? null : totalCents / 100}, validation, warnings
	}
}

const parseCheck = xml => {
	const head = firstElement(xml, 'CHECKHEAD')
	const body = firstElement(xml, 'CHECKBODY')
	const totalSection = firstElement(xml, 'CHECKTOTAL')
	if (!head || !body || !totalSection) fail('CHECK receipt is missing required sections.')
	const items = allElements(body[2], 'ROW').map(element => {
		const row = element[2] || ''
		const sourceQuantity = parseDecimal(elementText(row, 'AMOUNT'))
		const sourceUnit = normalizeUnit(elementText(row, 'UNITNM')) || 'pcs'
		const originalName = elementText(row, 'NAME') || ''
		const packageSize = sourceUnit === 'pcs' ? inferPackageSize(originalName) : null
		const canonical = canonicalQuantity({sourceQuantity, sourceUnit, packageSize})
		const finalCents = decimalToCents(elementText(row, 'COST'))
		const discountCents = decimalToCents(elementText(row, 'DISCOUNTSUM')) || 0
		const warnings = []
		if (sourceQuantity === null) warnings.push('QUANTITY_REVIEW_REQUIRED')
		return toReviewItem({
			rowNumber: parseAttributes(element[1]).ROWNUM || null,
			originalName,
			sourceQuantity,
			sourceUnit,
			sourceRawQuantity: elementText(row, 'AMOUNT'),
			packageCount: sourceUnit === 'pcs' ? sourceQuantity : null,
			packageSize,
			canonicalQuantity: canonical.quantity,
			canonicalUnit: canonical.unit,
			quantityMode: canonical.mode,
			unitPriceCents: decimalToCents(elementText(row, 'PRICE')),
			grossLineAmountCents: finalCents === null ? null : finalCents + discountCents,
			discountCents,
			finalLineAmountCents: finalCents,
			barcode: elementText(row, 'BARCODE'),
			sourceIdentifier: elementText(row, 'BARCODE'),
			merchantItemCode: elementText(row, 'CODE'),
			warnings
		})
	})
	const warnings = []
	const totalCents = decimalToCents(elementText(totalSection[2], 'SUM'))
	const validation = validationResult(items, totalCents, warnings)
	const receiptNumber = elementText(head[2], 'ORDERNUM')
	const timestamp = checkDateTimeToIso(elementText(head[2], 'ORDERDATE'), elementText(head[2], 'ORDERTIME'))
	return {
		sourceType: 'xml', sourceFormat: 'CHECK',
		merchant: {
			rawName: elementText(head[2], 'ORGNM'),
			legalName: elementText(head[2], 'ORGNM'),
			normalizedHint: elementText(head[2], 'ORGNM'),
			taxId: elementText(head[2], 'TIN') || elementText(head[2], 'IPN'),
			ipn: elementText(head[2], 'IPN'),
			address: elementText(head[2], 'POINTADDR'),
			pointName: elementText(head[2], 'POINTNM'),
			matchStatus: 'unmatched'
		},
		purchasedAt: {value: timestamp, source: 'fiscal'},
		fiscalIdentity: {fiscalRegisterNumber: elementText(head[2], 'CASHREGISTERNUM'), receiptNumber, timestamp, uid: elementText(head[2], 'UID')},
		items, discounts: [], total: {minorUnits: totalCents, value: totalCents === null ? null : totalCents / 100}, validation, warnings
	}
}

const validateXml = xml => {
	if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) fail('DOCTYPE and ENTITY declarations are not allowed.')
	const elementCount = (xml.match(/<[\w:.-]+\b/g) || []).length
	if (elementCount > MAX_XML_ELEMENTS) fail('XML receipt is too complex.')
	let depth = 0
	let maximumDepth = 0
	for (const match of xml.matchAll(/<\/?([\w:.-]+)\b[^>]*>/g)) {
		const token = match[0]
		if (token.startsWith('</')) depth--
		else if (!token.endsWith('/>')) maximumDepth = Math.max(maximumDepth, ++depth)
	}
	if (maximumDepth > 64) fail('XML receipt is too deeply nested.')
	if (typeof DOMParser !== 'undefined') {
		const document = new DOMParser().parseFromString(xml, 'application/xml')
		if (document.querySelector('parsererror')) fail('The selected file contains malformed XML.')
	} else {
		const stack = []
		for (const match of xml.matchAll(/<\/?([\w:.-]+)\b[^>]*>/g)) {
			const token = match[0]
			if (token.startsWith('</')) {
				if (stack.pop() !== match[1]) fail('The selected file contains malformed XML.')
			} else if (!token.endsWith('/>')) stack.push(match[1])
		}
		if (stack.length) fail('The selected file contains malformed XML.')
	}
}

const parseFiscalXmlText = (xml, metadata = {}) => {
	validateXml(xml)
	const root = xml.match(/<\s*(?:[\w.-]+:)?(RQ|CHECK)\b/i)?.[1]?.toUpperCase()
	const draft = root === 'RQ' ? parseRq(xml) : root === 'CHECK' ? parseCheck(xml) : fail('Unsupported fiscal XML format.')
	if (draft.items.length > MAX_PRODUCTS) fail('XML receipt contains too many products.')
	return {...draft, originalFilename: metadata.originalFilename || null, sourceHash: metadata.sourceHash || null, encoding: metadata.encoding || null}
}

const detectEncoding = bytes => {
	const prefix = new TextDecoder('ascii').decode(bytes.slice(0, 256))
	const declared = prefix.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() || 'utf-8'
	const encoding = SUPPORTED_ENCODINGS.get(declared)
	if (!encoding) fail(`Unsupported XML encoding: ${declared}.`)
	return encoding
}

const sha256 = async bytes => {
	if (!globalThis.crypto?.subtle) fail('SHA-256 is not available in this browser.')
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const parseFiscalXmlFile = async file => {
	if (!file) fail('Select an XML receipt file.')
	if (file.size > MAX_XML_BYTES) fail('XML receipt is larger than 2 MB.')
	if (!/\.xml$/i.test(file.name || '')) fail('Select a file with the .xml extension.')
	const bytes = new Uint8Array(await file.arrayBuffer())
	const encoding = detectEncoding(bytes)
	let xml
	try {
		xml = new TextDecoder(encoding, {fatal: true}).decode(bytes)
	} catch {
		fail(`Could not decode XML as ${encoding}.`)
	}
	const sourceHash = await sha256(bytes)
	return {draft: parseFiscalXmlText(xml, {originalFilename: file.name, sourceHash, encoding}), xml, sourceHash, encoding}
}

export {MAX_XML_BYTES, MAX_PRODUCTS, detectEncoding, parseFiscalXmlFile, parseFiscalXmlText}
