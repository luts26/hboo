import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')

test('Forecast page is registered as a route and reachable from Available Today summary', () => {
	const router = read('hbapp/router/router.js')
	const summary = read('hbapp/components/FinancialSummary.js')
	const app = read('hbapp/hbapp.js')

	assert.match(router, /import ForecastPage/)
	assert.match(router, /'forecast': ForecastPage/)
	assert.match(summary, /View financial forecast/)
	assert.match(summary, /data-summary-nav="forecast"/)
	assert.match(app, /data-summary-nav/)
})

test('Forecast page uses existing local-first stores and hydrates link details separately', () => {
	const source = read('hbapp/pages/ForecastPage.js')

	assert.match(source, /import balanceStore/)
	assert.match(source, /import planningStore/)
	assert.match(source, /buildForecastFromStates/)
	assert.match(source, /balanceStore\.hydrateFromCache\(\)/)
	assert.match(source, /planningStore\.load\(\)/)
	assert.match(source, /planningStore\.loadPlanningItemTransactions\(id\)/)
	assert.doesNotMatch(source, /PlanningApiRepository|FinancialForecastApi|fetch\(/)
})

test('Forecast page exposes all v1.2 sections and conservative incomplete-data copy', () => {
	const source = read('hbapp/pages/ForecastPage.js')

	assert.match(source, /Financial forecast overview/)
	assert.match(source, /Projected balance chart/)
	assert.match(source, /Upcoming expenses/)
	assert.match(source, /Ambiguous and excluded items/)
	assert.match(source, /current-period/)
	assert.match(source, /next-7/)
	assert.match(source, /next-14/)
	assert.match(source, /next-30/)
	assert.match(source, /could not be safely included/)
	assert.match(source, /Linked transaction state is not loaded yet/)
	assert.match(source, /Offline mode: linked transaction details may be incomplete/)
})

test('Forecast page follows lifecycle cleanup for subscriptions and document listeners', () => {
	const source = read('hbapp/pages/ForecastPage.js')

	assert.match(source, /this\.unsubscribePlanning = planningStore\.subscribe/)
	assert.match(source, /this\.unsubscribeBalance = balanceStore\.subscribe/)
	assert.match(source, /this\.unsubscribeNetwork = networkStatusService\.subscribe/)
	assert.match(source, /destroy\(\)[\s\S]*this\.unsubscribePlanning\(\)/)
	assert.match(source, /destroy\(\)[\s\S]*this\.unsubscribeBalance\(\)/)
	assert.match(source, /destroy\(\)[\s\S]*this\.unsubscribeNetwork\(\)/)
	assert.match(source, /document\.removeEventListener\('pointerdown', this\.handleOutsidePointer\)/)
})

test('Forecast CSS provides responsive layout without horizontal fixed-width rows', () => {
	const css = read('hbapp/assets/styles/main.css')

	assert.match(css, /\.forecast-dashboard\s*\{[\s\S]*min-width: 0/)
	assert.match(css, /\.forecast-segmented-control\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
	assert.match(css, /\.forecast-expense-row\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(116px, auto\) auto/)
	assert.match(css, /@media screen and \(max-width: 600px\)[\s\S]*\.forecast-segmented-control\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
	assert.match(css, /@media screen and \(max-width: 600px\)[\s\S]*\.forecast-expense-row\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
})
