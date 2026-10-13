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
	assert.match(css, /\.forecast-card-grid\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
	assert.match(css, /\.forecast-chart-shell\s*\{[\s\S]*height: 200px/)
	assert.match(css, /\.forecast-chart-target:after\s*\{[\s\S]*opacity: 0/)
	assert.match(css, /\.forecast-chart-target:hover:after,[\s\S]*\.forecast-chart-target:focus-visible:after,[\s\S]*\.forecast-chart-target.active:after\s*\{[\s\S]*opacity: 1/)
	assert.match(css, /@media screen and \(max-width: 600px\)[\s\S]*\.forecast-segmented-control\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
	assert.match(css, /@media screen and \(max-width: 600px\)[\s\S]*\.forecast-card-grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
	assert.match(css, /@media screen and \(max-width: 600px\)[\s\S]*\.forecast-expense-row\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
})

test('Forecast chart uses dynamic scale and compact constant-balance state', () => {
	const source = read('hbapp/pages/ForecastPage.js')

	assert.match(source, /getChartDomain\(values = \[\]\)/)
	assert.match(source, /actualMin = Math\.min\(\.\.\.values\)/)
	assert.match(source, /minimumSpan = Math\.max\(100, magnitude \* 0\.03\)/)
	assert.match(source, /actualMin < 0 && actualMax > 0/)
	assert.match(source, /renderConstantBalanceChart/)
	assert.match(source, /No scheduled future expenses are available/)
	assert.doesNotMatch(source, /points\.map\(point => `<circle class="forecast-chart-marker/)
	assert.match(source, /activePoint \? `<circle class="forecast-chart-marker/)
})

test('Forecast issue summary and collapse keep ambiguous totals informational', () => {
	const source = read('hbapp/pages/ForecastPage.js')

	assert.match(source, /getAmbiguousSummary\(ambiguous = \[\]\)/)
	assert.match(source, /getAmbiguousSummary\(ambiguous\)/)
	assert.match(source, /not included in forecast/)
	assert.match(source, /These expenses are not included in the projected balance/)
	assert.match(source, /ambiguous\.slice\(0, 5\)/)
	assert.match(source, /completedExcluded = \(forecast\.excluded \|\| \[\]\)\.filter/)
	assert.match(source, /data-forecast-toggle-issues/)
	assert.match(source, /aria-expanded/)
	assert.match(source, /data-forecast-planning-id/)
	assert.doesNotMatch(source, /projectedEndingBalance\s*[-+]=|scheduledExpenses\s*[-+]=/)
})

test('Forecast warning and list styles are compact and accessible', () => {
	const css = read('hbapp/assets/styles/main.css')

	assert.match(css, /\.forecast-warning\s*\{[\s\S]*padding-left: \.8rem/)
	assert.match(css, /\.forecast-warning:before\s*\{[\s\S]*content: ''/)
	assert.match(css, /\.forecast-show-more:focus-visible\s*\{[\s\S]*outline/)
	assert.match(css, /\.forecast-overview-card strong\s*\{[\s\S]*white-space: normal/)
	assert.match(css, /\.forecast-expense-main strong,[\s\S]*\.forecast-issue-row strong\s*\{[\s\S]*overflow-wrap: anywhere/)
})
