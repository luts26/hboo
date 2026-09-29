import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const read = filePath => fs.readFileSync(path.join(frontendRoot, filePath), 'utf8')

test('Purchases sidebar summary is the navigation entry and uses local catalog data', () => {
	const sidebarSource = read('hbapp/components/sidebar.js')
	const appSource = read('hbapp/hbapp.js')
	const summarySource = read('hbapp/components/PurchaseSummary.js')

	assert.match(sidebarSource, /purchase-summary-root/)
	assert.match(summarySource, /data-summary-nav="purchases"/)
	assert.match(appSource, /purchaseSummaryRepository: new ProductCatalogLocalRepository\(\)/)
	assert.match(appSource, /getPurchasesByRange\(getAuthenticatedUserId\(\), range\.dateFrom, range\.dateTo\)/)
	assert.match(appSource, /getProducts\(\{includeDisabled: true\}\)/)
	assert.match(appSource, /getCategories\(\{includeDisabled: true\}\)/)
})

test('Purchases domain keeps Products out of primary tabs and exposes Manage products through three-dots context', () => {
	const purchaseSource = read('hbapp/pages/PurchasePage.js')
	const analyticsSource = read('hbapp/pages/ProductAnalyticsPage.js')
	const appSource = read('hbapp/hbapp.js')
	const routeHandler = appSource.match(/if \(e\.target\.closest\('\[data-action="header-menu-route"\]'\)\) \{[\s\S]*?\n\t\t\t\}/)?.[0] || ''

	assert.match(purchaseSource, /hboo-segmented-control purchase-domain-switch/)
	assert.match(purchaseSource, />Purchases<\/button>/)
	assert.match(purchaseSource, />Analytics<\/button>/)
	assert.match(analyticsSource, />Purchases<\/button>/)
	assert.match(analyticsSource, />Analytics<\/button>/)
	assert.doesNotMatch(purchaseSource, />Products<\/button>[\s\S]*>Analytics<\/button>|>Purchases<\/button>[\s\S]*>Products<\/button>[\s\S]*>Analytics<\/button>/)
	assert.doesNotMatch(analyticsSource, />Products<\/button>[\s\S]*>Analytics<\/button>|>Purchases<\/button>[\s\S]*>Products<\/button>[\s\S]*>Analytics<\/button>/)
	assert.match(appSource, /data-header-context-menu/)
	assert.match(appSource, /Manage products/)
	assert.match(appSource, /activePath === 'purchases\/analytics'/)
	assert.match(appSource, /data-route="products"/)
	assert.match(routeHandler, /this\.navigateAppRoute\(item\.dataset\.route, item\.dataset\.hash\)/)
	assert.doesNotMatch(routeHandler, /window\.location|location\.href|location\.assign|location\.reload/)
})

test('Product Analytics has a purchase-domain SPA route and read-only local-first flow', () => {
	const routerSource = read('hbapp/router/router.js')
	const analyticsSource = read('hbapp/pages/ProductAnalyticsPage.js')

	assert.match(routerSource, /'purchases\/analytics': ProductAnalyticsPage/)
	assert.match(analyticsSource, /loadPurchasesByRange\(\{refresh: true, range: period\}\)/)
	assert.match(analyticsSource, /localRepository\.getPurchasesByRange/)
	assert.match(analyticsSource, /calculateProductAnalytics/)
	assert.match(analyticsSource, /subscribeProductCatalogChanges/)
	assert.doesNotMatch(analyticsSource, /setTimeout|setInterval/)
	assert.doesNotMatch(analyticsSource, /api\.get\(|fetch\(/)
})

test('Product catalog page has an SPA route back to Purchases', () => {
	const source = read('hbapp/pages/ProductCatalogPage.js')

	assert.match(source, /import router from '\.\.\/router\/router\.js'/)
	assert.match(source, /data-product-action="back-purchases"/)
	assert.match(source, /router\.redirectRouter\('\/purchases'\)/)
})

test('Save Purchase resets form after successful local persistence and preserves it on failure', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const saveMethod = source.match(/async savePurchase\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const resetMethod = source.match(/resetForm\(\{render = true\} = \{\}\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(saveMethod, /await this\.apiService\.savePurchase\(payload\)/)
	assert.match(saveMethod, /this\.resetForm\(\{render: false\}\)/)
	assert.match(saveMethod, /this\.closeEditor\(\{render: false\}\)/)
	assert.match(saveMethod, /catch \(error\)/)
	assert.doesNotMatch(saveMethod, /this\.loadPurchaseIntoForm\(saved\)/)
	assert.match(resetMethod, /id: null/)
	assert.match(resetMethod, /paymentType: 'bank'/)
	assert.match(resetMethod, /items: \[createItem\(\)\]/)
	assert.match(resetMethod, /createProductForRowId = null/)
	assert.match(resetMethod, /createProductForm = null/)
	assert.match(resetMethod, /selectedPurchase = null/)
})

test('Purchase editor uses viewport overlay modal instead of permanent page form', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const templateMethod = source.match(/getTemplate\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(source, /import overlayHost from '\.\.\/services\/OverlayHost\.js'/)
	assert.match(source, /renderEditorModal\(\)/)
	assert.match(source, /overlayHost\.render\('purchase-editor-modal'/)
	assert.match(source, /class="app-modal purchase-editor-modal"/)
	assert.match(source, /data-purchase-action="new-purchase">\+ Add purchase<\/button>/)
	assert.doesNotMatch(templateMethod, /getFormTemplate\(\)/)
	assert.doesNotMatch(templateMethod, /purchase-layout/)
})

test('Purchase modal supports create edit cancel and local failure behavior', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const openPurchaseMethod = source.match(/async openPurchase\(purchaseId\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const openNewMethod = source.match(/openNewPurchase\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const closeEditorMethod = source.match(/closeEditor\(\{render = true\} = \{\}\) \{[\s\S]*?\n\t\}/)?.[0] || ''
	const saveMethod = source.match(/async savePurchase\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(openNewMethod, /this\.resetForm\(\{render: false\}\)/)
	assert.match(openNewMethod, /this\.state\.editorOpen = true/)
	assert.match(openPurchaseMethod, /this\.loadPurchaseIntoForm\(purchase\)/)
	assert.match(openPurchaseMethod, /this\.state\.editorOpen = true/)
	assert.match(closeEditorMethod, /if \(this\.state\.saving\) return/)
	assert.match(closeEditorMethod, /this\.state\.editorOpen = false/)
	assert.match(closeEditorMethod, /overlayHost\.clear\('purchase-editor-modal'\)/)
	assert.match(saveMethod, /catch \(error\)[\s\S]*this\.state\.saveError/)
	assert.doesNotMatch(saveMethod.match(/catch \(error\)[\s\S]*?\n\t\t\}/)?.[0] || '', /closeEditor/)
})

test('local catalog changes notify sidebar refresh after create update delete and sync reconciliation', () => {
	const repositorySource = read('hbapp/services/ProductCatalogLocalRepository.js')
	const appSource = read('hbapp/hbapp.js')
	const purchasePageSource = read('hbapp/pages/PurchasePage.js')

	assert.match(repositorySource, /notifyProductCatalogChanged\(\{entityType: 'purchase', action: 'save'\}\)/)
	assert.match(repositorySource, /notifyProductCatalogChanged\(\{entityType: 'purchase', action: 'mark-synced'\}\)/)
	assert.match(repositorySource, /notifyProductCatalogChanged\(\{entityType: 'purchase', action: 'delete'\}\)/)
	assert.match(repositorySource, /notifyProductCatalogChanged\(\{entityType: 'product', action: 'save'\}\)/)
	assert.match(appSource, /subscribeProductCatalogChanges\(\(\) => this\.refreshPurchaseSummary\(\)\)/)
	assert.match(purchasePageSource, /subscribeProductCatalogChanges/)
	assert.match(purchasePageSource, /refreshSelectedRangeFromLocal/)
	assert.match(purchasePageSource, /getPurchasesByRange/)
})

test('Purchase inline create product flow still writes local product and selects it', () => {
	const source = read('hbapp/pages/PurchasePage.js')
	const saveNewProductMethod = source.match(/async saveNewProduct\(\) \{[\s\S]*?\n\t\}/)?.[0] || ''

	assert.match(saveNewProductMethod, /await this\.apiService\.createProduct/)
	assert.match(saveNewProductMethod, /this\.selectProduct\(this\.state\.createProductForRowId, product\.id\)/)
	assert.match(saveNewProductMethod, /this\.state\.createProductForm = null/)
})
