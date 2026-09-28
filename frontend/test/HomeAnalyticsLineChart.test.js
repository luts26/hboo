import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')

test('Income vs Expenses renders as a responsive SVG line chart', () => {
	const source = read('hbapp/pages/HomePage.js')

	assert.match(source, /<svg class="home-income-line-svg" viewBox="0 0 \$\{width\} \$\{height\}" preserveAspectRatio="none"/)
	assert.match(source, /home-line-series-income/)
	assert.match(source, /home-line-series-expense/)
	assert.match(source, /home-income-targets/)
})

test('legacy monthly income and expense bars are no longer rendered', () => {
	const source = read('hbapp/pages/HomePage.js')
	const css = read('hbapp/assets/styles/main.css')

	assert.doesNotMatch(source, /home-income-bars|home-income-bar-in|home-income-bar-out/)
	assert.doesNotMatch(css, /\.home-income-bars|\.home-income-bar-in|\.home-income-bar-out/)
})

test('missing months are excluded from factual line segments and kept interactive', () => {
	const source = read('hbapp/pages/HomePage.js')

	assert.match(source, /if \(point\.coverage === 'missing'\) return segments/)
	assert.match(source, /home-line-marker-missing/)
	assert.match(source, /data-home-month=/)
	assert.match(source, /Local history unavailable/)
})

test('partial months remain visually identifiable without recalculating values', () => {
	const source = read('hbapp/pages/HomePage.js')

	assert.match(source, /point\.coverage === 'partial' \? ' home-line-marker-partial'/)
	assert.match(source, /getMonthDetailViewModel\(item\)/)
})

test('Home analytics still reads cached local ranges and does not trigger bank refresh', () => {
	const source = read('hbapp/pages/HomePage.js')
	const loadAnalytics = source.match(/async loadAnalytics\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(loadAnalytics, /this\.transactionRepository\.getRange/)
	assert.match(loadAnalytics, /this\.transactionRepository\.getCoverage/)
	assert.doesNotMatch(loadAnalytics, /updateTransaction|confirmRefresh|TransactionApiService|transactionStore\.refresh/)
})

test('Financial Position exposes independent provider and period segmented controls', () => {
	const source = read('hbapp/pages/HomePage.js')

	assert.match(source, /data-financial-provider="mono"/)
	assert.match(source, /data-financial-provider="privat"/)
	assert.match(source, /data-financial-period="6"/)
	assert.match(source, /data-financial-period="12"/)
	assert.match(source, /setFinancialProvider/)
	assert.match(source, /setFinancialPeriod/)
	assert.doesNotMatch(source, /Overall|Total banks|Combined Financial Position/)
})

test('Financial Position uses local-first balance history flow without balance refresh', () => {
	const source = read('hbapp/pages/HomePage.js')
	const apiSource = read('hbapp/services/BalanceApiService.js')

	assert.match(source, /this\.balanceHistoryRepository\.getHistory/)
	assert.match(source, /this\.balanceApiService\.getBalanceHistory/)
	assert.match(source, /this\.balanceHistoryRepository\.saveHistory/)
	assert.match(apiSource, /\/hbv2\/balance\/history\?/)
	assert.doesNotMatch(source, /updateBalance|confirmRefresh|refresh\(/)
})

test('Financial Position chart renders zero line, states, sparse and one-point capable targets', () => {
	const source = read('hbapp/pages/HomePage.js')
	const css = read('hbapp/assets/styles/main.css')

	assert.match(source, /home-financial-zero-line/)
	assert.match(source, /getFinancialScale/)
	assert.match(source, /home-financial-marker-own/)
	assert.match(source, /home-financial-marker-credit/)
	assert.match(source, /home-financial-marker-zero/)
	assert.match(source, /home-financial-point/)
	assert.match(source, /No balance observations for this period/)
	assert.match(source, /Last snapshot before selected period/)
	assert.match(css, /\.home-financial-zero-line/)
	assert.match(css, /\.home-financial-point/)
})

test('Financial Position tooltip uses snapshot position semantics', () => {
	const source = read('hbapp/pages/HomePage.js')

	assert.match(source, /Credit funds used/)
	assert.match(source, /Own funds/)
	assert.match(source, /Own \/ credit boundary/)
	assert.match(source, /this\.getSignedAmount\(item\.position\)/)
})

test('IndexedDB has dedicated balanceHistory store and Service Worker avoids API caching', () => {
	const indexedDb = read('hbapp/services/IndexedDbClient.js')
	const sw = read('sw.js')

	assert.match(indexedDb, /balanceHistory/)
	assert.match(indexedDb, /userProvider/)
	assert.match(indexedDb, /const DATABASE_VERSION = 3/)
	assert.match(indexedDb, /3: ensureStoreDefinitions/)
	assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/)
})

test('Home analytics preserves Financial Position state while loading other analytics', () => {
	const source = read('hbapp/pages/HomePage.js')

	assert.match(source, /this\.state = \{\n\t\t\t\t\.\.\.this\.state,\n\t\t\t\tloading: false,/)
})

test('Home render lifecycle isolates Financial Position render failures from transaction analytics', () => {
	const source = read('hbapp/pages/HomePage.js')
	const renderAnalytics = source.match(/renderAnalytics\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const safeRenderer = source.match(/renderFinancialPositionSafely\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(renderAnalytics, /this\.renderIncomeChart\(\)[\s\S]*this\.renderFinancialPositionSafely\(\)[\s\S]*this\.renderCategorySpending\(\)/)
	assert.match(safeRenderer, /catch \(error\)/)
	assert.match(safeRenderer, /this\.state\.financialPosition = \{/)
	assert.doesNotMatch(safeRenderer, /this\.state\.error\s*=/)
})
