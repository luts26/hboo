import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {parseFiscalXmlFile, parseFiscalXmlText} from '../hbapp/services/FiscalXmlReceiptParser.js'

if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto

const fixtureFile = async name => {
	const buffer = await fs.readFile(new URL(`../../docs/receipt_example/${name}`, import.meta.url))
	return {
		name,
		size: buffer.length,
		arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
	}
}

const parseFixture = async name => (await parseFiscalXmlFile(await fixtureFile(name))).draft

test('parses all supplied Windows-1251 RQ and CHECK examples with Ukrainian text', async () => {
	const expected = new Map([
		['188704.xml', ['RQ', 3]],
		['189277.xml', ['RQ', 3]],
		['342874.xml', ['RQ', 15]],
		['406965.xml', ['RQ', 3]],
		['562266.xml', ['RQ', 14]],
		['7820651158.xml', ['CHECK', 3]],
		['7820939871.xml', ['CHECK', 4]]
	])
	for (const [name, [format, itemCount]] of expected) {
		const draft = await parseFixture(name)
		assert.equal(draft.sourceFormat, format)
		assert.equal(draft.encoding, 'windows-1251')
		assert.equal(draft.items.length, itemCount)
		assert.equal(draft.validation.differenceCents, 0)
		assert.match(draft.items[0].originalName, /[А-ЯІЇЄа-яіїє]/u)
	}
})

test('extracts available Merchant metadata without guessing missing RQ names', async () => {
	const rq = await parseFixture('562266.xml')
	assert.equal(rq.merchant.rawName, null)
	assert.equal(rq.merchant.taxId, 'ПН 360036026593')
	assert.equal(rq.merchant.address, null)

	const check = await parseFixture('7820651158.xml')
	assert.equal(check.merchant.legalName, 'ТОВ "ТД "БРУСИЛІВСЬКІ КОВБАСИ"')
	assert.equal(check.merchant.taxId, '44696447')
	assert.match(check.merchant.address, /БУЧА/u)

	const utf8 = parseFiscalXmlText('<?xml version="1.0" encoding="UTF-8"?><CHECK><CHECKHEAD><ORGNM>ТОВ «Тест Маркет»</ORGNM><TIN>12345678</TIN><POINTADDR>м. Київ</POINTADDR></CHECKHEAD><CHECKTOTAL><SUM>1.00</SUM></CHECKTOTAL><CHECKBODY><ROW><NAME>Товар</NAME><AMOUNT>1</AMOUNT><COST>1.00</COST></ROW></CHECKBODY></CHECK>')
	assert.equal(utf8.merchant.rawName, 'ТОВ «Тест Маркет»')
	assert.equal(utf8.merchant.address, 'м. Київ')
})

test('normalizes weighted and packaged quantities safely', async () => {
	const rq = await parseFixture('562266.xml')
	assert.deepEqual(
		{quantity: rq.items[0].quantity, unit: rq.items[0].unit},
		{quantity: 966, unit: 'g'}
	)
	const check = await parseFixture('7820651158.xml')
	assert.deepEqual(
		{quantity: check.items[1].quantity, unit: check.items[1].unit, total: check.items[1].total},
		{quantity: 258, unit: 'g', total: 38.18}
	)

	const synthetic = parseFiscalXmlText(`<?xml version="1.0" encoding="UTF-8"?><CHECK><CHECKHEAD><ORDERDATE>19102026</ORDERDATE><ORDERTIME>120000</ORDERTIME></CHECKHEAD><CHECKTOTAL><SUM>196.20</SUM></CHECKTOTAL><CHECKBODY>
		<ROW ROWNUM="1"><NAME>Вівсянка 400 г</NAME><UNITNM>шт</UNITNM><AMOUNT>2</AMOUNT><PRICE>51.60</PRICE><COST>103.20</COST></ROW>
		<ROW ROWNUM="2"><NAME>Молоко 2.5% 900 мл</NAME><UNITNM>шт</UNITNM><AMOUNT>2</AMOUNT><PRICE>45.00</PRICE><COST>90.00</COST></ROW>
		<ROW ROWNUM="3"><NAME>Пакет</NAME><UNITNM>шт</UNITNM><AMOUNT>2</AMOUNT><PRICE>1.50</PRICE><COST>3.00</COST></ROW>
	</CHECKBODY></CHECK>`)
	assert.deepEqual(synthetic.items.map(item => [item.quantity, item.unit]), [[800, 'g'], [1800, 'ml'], [2, 'pcs']])
	assert.equal(synthetic.purchasedAt.value, '2026-10-19T12:00:00')
})

test('applies RQ discounts exactly once and preserves official total', async () => {
	const draft = await parseFixture('342874.xml')
	assert.equal(draft.items.reduce((sum, item) => sum + item.grossLineAmountCents, 0), 72070)
	assert.equal(draft.discounts.reduce((sum, discount) => sum + discount.amountCents, 0), 2869)
	assert.equal(draft.validation.itemsTotalCents, 69201)
	assert.equal(draft.total.minorUnits, 69201)
})

test('treats CHECK COST as the final line amount when a discount is present', () => {
	const draft = parseFiscalXmlText('<CHECK><CHECKHEAD></CHECKHEAD><CHECKTOTAL><SUM>9.00</SUM></CHECKTOTAL><CHECKBODY><ROW ROWNUM="1"><NAME>Товар</NAME><UNITNM>шт</UNITNM><AMOUNT>1</AMOUNT><PRICE>10.00</PRICE><DISCOUNTSUM>1.00</DISCOUNTSUM><COST>9.00</COST></ROW></CHECKBODY></CHECK>')
	assert.equal(draft.items[0].grossLineAmountCents, 1000)
	assert.equal(draft.items[0].discountCents, 100)
	assert.equal(draft.items[0].finalLineAmountCents, 900)
	assert.equal(draft.validation.differenceCents, 0)
})

test('keeps unknown optional monetary values as null', () => {
	const draft = parseFiscalXmlText('<RQ><DAT FN="1"><C><P N="1" NM="Товар"/><E FN="1" NO="2" SM="100" TS="20261019120000"/></C></DAT></RQ>')
	assert.equal(draft.purchasedAt.value, '2026-10-19T12:00:00')
	assert.equal(draft.items[0].unitPriceCents, null)
	assert.equal(draft.items[0].grossLineAmountCents, null)
	assert.equal(draft.items[0].total, null)
	assert.ok(draft.warnings.includes('ITEMS_TOTAL_MISMATCH'))
})

test('rejects malformed, unsupported and unsafe XML', () => {
	assert.throws(() => parseFiscalXmlText('<OTHER/>'), /Unsupported/)
	assert.throws(() => parseFiscalXmlText('<RQ><DAT></RQ>'), /malformed/)
	assert.throws(() => parseFiscalXmlText('<!DOCTYPE RQ [<!ENTITY x SYSTEM "file:///etc/passwd">]><RQ/>'), /DOCTYPE/)
})

test('rejects unsupported declared encodings', async () => {
	const bytes = new TextEncoder().encode('<?xml version="1.0" encoding="KOI8-U"?><RQ/>')
	await assert.rejects(() => parseFiscalXmlFile({name: 'bad.xml', size: bytes.length, arrayBuffer: async () => bytes.buffer}), /Unsupported XML encoding/)
})
