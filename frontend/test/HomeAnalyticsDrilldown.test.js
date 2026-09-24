import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {
	buildTransactionDrilldownPath,
	getCategoryFilterFromQuery
} from '../hbapp/services/HomeAnalyticsNavigation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')

test('category drill-down transfers category id and exact date range', () => {
	const from = new Date(2026, 7, 15, 0, 0, 0, 0).getTime()
	const to = new Date(2026, 8, 24, 23, 59, 59, 999).getTime()
	const pathValue = buildTransactionDrilldownPath({
		dateFrom: from,
		dateTo: to,
		categoryId: '3'
	})
	const url = new URL(pathValue, 'https://hboo.local')

	assert.equal(url.pathname, '/transaction')
	assert.equal(Number(url.searchParams.get('date_from')), from)
	assert.equal(Number(url.searchParams.get('date_to')), to)
	assert.equal(url.searchParams.get('category_id'), '3')
})

test('category display name is not used as filter identity', () => {
	const pathValue = buildTransactionDrilldownPath({
		dateFrom: 1,
		dateTo: 2,
		categoryId: '3'
	})

	assert.doesNotMatch(pathValue, /Продукти|Food|category_name|name=/)
})

test('uncategorized drill-down is not generated for unsupported synthetic id', () => {
	const pathValue = buildTransactionDrilldownPath({
		dateFrom: 1,
		dateTo: 2,
		categoryId: 'uncategorized'
	})

	assert.equal(pathValue, null)
})

test('Transaction page initializes category filter from drill-down query', () => {
	assert.equal(getCategoryFilterFromQuery('?date_from=1&date_to=2&category_id=3'), '3')
	assert.equal(getCategoryFilterFromQuery('?date_from=1&date_to=2'), null)
})

test('drill-down navigation does not call transaction bank refresh actions directly', () => {
	const homeSource = fs.readFileSync(path.join(frontendRoot, 'hbapp/pages/HomePage.js'), 'utf8')
	const drilldownMethod = homeSource.match(/openTransactionsForCategory\(categoryId\)\s*\{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(drilldownMethod, /router\.redirectRouter/)
	assert.doesNotMatch(drilldownMethod, /refresh\(|updateTransaction|confirmRefresh|TransactionApiService/)
})
