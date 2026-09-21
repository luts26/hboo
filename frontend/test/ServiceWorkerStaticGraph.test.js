import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(__dirname, '..')
const swPath = path.join(frontendRoot, 'sw.js')
const indexPath = path.join(frontendRoot, 'index.html')

const JS_STATIC_IMPORT_PATTERN = /(?:import\s+(?:[^'"]*?\s+from\s*)?|export\s+[^'"]*?\s+from\s*|import\s*\()\s*['"]([^'"]+)['"]/g
const CSS_URL_PATTERN = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g

function parseArrayConstant(source, name) {
	const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`))
	assert.ok(match, `${name} must be present`)
	return Array.from(match[1].matchAll(/'([^']+)'/g), item => item[1])
}

function stripSearch(asset) {
	return asset.replace(/[?#].*$/, '')
}

function readFrontendFile(asset) {
	return fs.readFileSync(path.join(frontendRoot, stripSearch(asset).replace(/^\//, '')), 'utf8')
}

function resolveStaticDependency(specifier, baseAsset) {
	if (!specifier || specifier.startsWith('data:') || specifier.startsWith('#')) return null
	const resolved = new URL(specifier, `https://dev.hboo.local${baseAsset}`)
	if (resolved.origin !== 'https://dev.hboo.local') return null
	if (resolved.pathname.startsWith('/api/')) return null
	return resolved.pathname
}

function extractDependencies(asset, pattern) {
	const text = readFrontendFile(asset)
	const dependencies = []
	let match

	pattern.lastIndex = 0
	while ((match = pattern.exec(text)) !== null) {
		const dependency = resolveStaticDependency(match[1], asset)
		if (dependency) dependencies.push(dependency)
	}

	return dependencies
}

function collectJavaScriptGraph(entryAssets) {
	const visited = new Set()
	const pending = entryAssets.map(stripSearch).filter(asset => asset.endsWith('.js'))

	while (pending.length > 0) {
		const asset = pending.pop()
		if (visited.has(asset)) continue
		visited.add(asset)

		for (const dependency of extractDependencies(asset, JS_STATIC_IMPORT_PATTERN)) {
			if (dependency.endsWith('.js') && !visited.has(dependency)) pending.push(dependency)
		}
	}

	return visited
}

test('service worker precaches the complete ES module graph from entry modules', () => {
	const swSource = fs.readFileSync(swPath, 'utf8')
	const requiredShellAssets = parseArrayConstant(swSource, 'REQUIRED_SHELL_ASSETS')
	const moduleGraph = collectJavaScriptGraph(requiredShellAssets)

	assert.ok(moduleGraph.has('/hbapp/index.js'))
	assert.ok(moduleGraph.has('/hbapp/services/TransactionDateRange.js'))

	for (const modulePath of moduleGraph) {
		assert.ok(fs.existsSync(path.join(frontendRoot, modulePath.replace(/^\//, ''))), `${modulePath} exists`)
	}
})

test('required shell CSS references local cacheable image assets', () => {
	const swSource = fs.readFileSync(swPath, 'utf8')
	const requiredShellAssets = parseArrayConstant(swSource, 'REQUIRED_SHELL_ASSETS')
	const cssAssets = requiredShellAssets.filter(asset => stripSearch(asset).endsWith('.css'))
	const cssDependencies = new Set(cssAssets.flatMap(asset => extractDependencies(asset, CSS_URL_PATTERN)))

	assert.ok(cssDependencies.has('/hbapp/assets/images/mblogo1.png'))
	assert.ok(cssDependencies.has('/hbapp/assets/images/category-icons/food-icon.png'))

	for (const asset of cssDependencies) {
		assert.ok(fs.existsSync(path.join(frontendRoot, asset.replace(/^\//, ''))), `${asset} exists`)
	}
})

test('index entry module version matches the service worker required shell asset', () => {
	const swSource = fs.readFileSync(swPath, 'utf8')
	const indexSource = fs.readFileSync(indexPath, 'utf8')
	const requiredShellAssets = parseArrayConstant(swSource, 'REQUIRED_SHELL_ASSETS')
	const indexModuleMatch = indexSource.match(/<script\s+type="module"\s+src="([^"]+)"/)

	assert.ok(indexModuleMatch, 'index.html must load a module entry point')
	assert.ok(requiredShellAssets.includes(indexModuleMatch[1]), `${indexModuleMatch[1]} is precached`)
})

test('service worker serves frontend static files without relying on an in-memory import list', () => {
	const swSource = fs.readFileSync(swPath, 'utf8')

	assert.match(swSource, /function\s+isFrontendStaticRequest/)
	assert.match(swSource, /url\.pathname\.startsWith\('\/hbapp\/'\)/)
	assert.match(swSource, /url\.pathname\.startsWith\('\/api\/'\)/)
})
