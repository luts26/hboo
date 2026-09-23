import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')
const extractRule = (source, selector) => {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))
	return match?.[1] || ''
}

test('mobile header is mounted outside transformed app-main-column', () => {
	const containerSource = read('hbapp/components/container.js')
	const headerSource = read('hbapp/components/header.js')
	const cssSource = read('hbapp/assets/styles/main.css')

	assert.match(containerSource, /<div class="app-header-slot"><\/div>[\s\S]*<div class="app-main-column">/)
	assert.doesNotMatch(containerSource, /<div class="app-main-column">\s*<div class="app-header-slot"><\/div>/)
	assert.match(headerSource, /hbapp\.querySelector\('\.app-header-slot'\)/)
	assert.match(cssSource, /\.mobile-summary-open \.app-main-column\s*\{[\s\S]*transform:\s*translateX/)
	assert.match(cssSource, /\.mobile-summary-open \.app-main-column\s*\{[\s\S]*will-change:\s*transform/)
	assert.doesNotMatch(extractRule(cssSource, '.app-main-column'), /will-change:\s*transform/)
})

test('viewport overlay root is a sibling of app layout, not inside app-main-column', () => {
	const containerSource = read('hbapp/components/container.js')
	const overlaySource = read('hbapp/services/OverlayHost.js')

	assert.match(containerSource, /<\/section>\s*<div id="hboo-overlay-root"><\/div>/)
	assert.doesNotMatch(containerSource, /app-main-column[\s\S]*hboo-overlay-root[\s\S]*<\/div>\s*\$\{sidebar/)
	assert.match(overlaySource, /querySelector\('hb-app'\)/)
	assert.doesNotMatch(overlaySource, /querySelector\('\.app-main-column'\)/)
})

test('Planning modal uses viewport overlay host instead of page-local modal markup', () => {
	const source = read('hbapp/pages/PlaningPage.js')

	assert.match(source, /import overlayHost from '\.\.\/services\/OverlayHost\.js'/)
	assert.match(source, /renderModal\(\)/)
	assert.match(source, /overlayHost\.render\('planning-modal'/)
	assert.doesNotMatch(source, /getItemsTemplate\(\)\}\s*<\/div>\s*\$\{this\.getModalTemplate\(\)\}/)
})

test('Transaction detail and filter modals use viewport overlay host', () => {
	const source = read('hbapp/pages/TransactionPage.js')

	assert.match(source, /import overlayHost from '\.\.\/services\/OverlayHost\.js'/)
	assert.match(source, /renderOverlay\('transaction-filter-modal', this\.getFilterModalTemplate\(\)\)/)
	assert.match(source, /renderOverlay\('transaction-refresh-modal', this\.getRefreshConfirmTemplate\(\)\)/)
	assert.match(source, /renderOverlay\('transaction-day-modal', this\.getDayModalTemplate\(\)\)/)
	assert.doesNotMatch(source, /\$\{this\.getDayModalTemplate\(\)\}/)
})

test('long modal content scrolls internally and AppLock remains above overlays', () => {
	const cssSource = read('hbapp/assets/styles/main.css')
	const modalBackdropZIndex = Number(cssSource.match(/\.app-modal-backdrop\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1])
	const appLockZIndex = Number(cssSource.match(/\.app-lock-screen\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1])

	assert.match(cssSource, /\.app-modal\s*\{[\s\S]*max-height:\s*calc\(100dvh - 32px\)/)
	assert.match(cssSource, /\.app-modal-body\s*\{[\s\S]*overflow-y:\s*auto/)
	assert.ok(appLockZIndex > modalBackdropZIndex)
})
