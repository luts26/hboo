import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')

const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')

test('sidebar does not render a separate conventional navigation block', () => {
	const sidebarSource = read('hbapp/components/sidebar.js')
	const appSource = read('hbapp/hbapp.js')

	assert.doesNotMatch(sidebarSource, /app-navigation-slot/)
	assert.doesNotMatch(appSource, /navigation\.setNavigation/)
})

test('financial summary cards remain the primary workspace navigation targets', () => {
	const summarySource = read('hbapp/components/FinancialSummary.js')
	const targets = Array.from(summarySource.matchAll(/data-summary-nav="([^"]+)"/g), match => match[1])

	assert.deepEqual(targets.sort(), ['balance', 'planing', 'transaction'])
})

test('active workspace state does not use an experimental shared silhouette', () => {
	const cssSource = read('hbapp/assets/styles/main.css')
	const appSource = read('hbapp/hbapp.js')

	assert.match(cssSource, /\.financial-summary-link-active/)
	assert.doesNotMatch(cssSource, /\.app-layout::before/)
	assert.doesNotMatch(cssSource, /workspace-connected-surface/)
	assert.doesNotMatch(cssSource, /\.financial-summary-link-active::before\s*\{/)
	assert.doesNotMatch(appSource, /getBoundingClientRect/)
	assert.doesNotMatch(appSource, /updateWorkspaceSilhouette/)
})

test('header brand is an accessible SPA Home action', () => {
	const headerSource = read('hbapp/components/header.js')
	const appSource = read('hbapp/hbapp.js')
	const homeHandler = appSource.match(/if \(e\.target\.closest\('\[data-action="header-home"\]'\)\) \{[\s\S]*?\n\t\t\t\}/)?.[0] || ''

	assert.match(headerSource, /<button class="app-name" type="button"/)
	assert.match(headerSource, /data-action="header-home"/)
	assert.match(headerSource, /aria-label="Go to Home"/)
	assert.match(homeHandler, /this\.navigateAppRoute\('home'\)/)
	assert.doesNotMatch(homeHandler, /window\.location|location\.href|location\.assign|location\.reload/)
	assert.doesNotMatch(homeHandler, /setMobileView/)
	assert.doesNotMatch(appSource, /e\.target\.closest\('\.app-name'\)[\s\S]{0,160}setMobileView/)
})

test('header brand Home handler runs before legacy label-header fallback', () => {
	const appSource = read('hbapp/hbapp.js')
	const homeIndex = appSource.indexOf('[data-action="header-home"]')
	const labelIndex = appSource.indexOf("e.target.closest('.label-header')")

	assert.ok(homeIndex > -1, 'header-home handler exists')
	assert.ok(labelIndex > -1, 'label-header fallback exists')
	assert.ok(homeIndex < labelIndex, 'header-home is handled before label-header')
})
