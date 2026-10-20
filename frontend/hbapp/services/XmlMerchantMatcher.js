const normalizeMerchantText = value => String(value || '')
	.normalize('NFKC')
	.toLocaleLowerCase('uk-UA')
	.replace(/[«»„“”"']/g, ' ')
	.replace(/[.,;:()\[\]{}\-–—]/g, ' ')
	.replace(/\s+/g, ' ')
	.trim()

const normalizeLegalName = value => normalizeMerchantText(value)
	.replace(/^(?:товариство з обмеженою відповідальністю|тов|пп|фоп)\s+/, '')
	.trim()

const getMerchantIdentityKeys = merchant => {
	const keys = []
	if (merchant?.taxId) keys.push(`tax:${String(merchant.taxId).replace(/\D/g, '')}`)
	if (merchant?.legalName || merchant?.rawName) {
		const legal = normalizeMerchantText(merchant.legalName || merchant.rawName)
		if (legal) keys.push(`name:${legal}`)
	}
	return [...new Set(keys.filter(key => !key.endsWith(':')))]
}

const tokenSimilarity = (left, right) => {
	const leftTokens = new Set(normalizeLegalName(left).split(' ').filter(token => token.length > 1))
	const rightTokens = new Set(normalizeLegalName(right).split(' ').filter(token => token.length > 1))
	if (!leftTokens.size || !rightTokens.size) return 0
	const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length
	return intersection / Math.max(leftTokens.size, rightTokens.size)
}

const matchXmlMerchant = ({merchant, merchants = [], mappings = []} = {}) => {
	const active = merchants.filter(item => item?.status !== 'disabled')
	const identityKeys = getMerchantIdentityKeys(merchant)
	const mapped = mappings.filter(mapping => identityKeys.includes(mapping.identityKey))
	const mappedIds = [...new Set(mapped.map(mapping => String(mapping.merchantId)))]
	if (mappedIds.length === 1) {
		const match = active.find(item => mappedIds.includes(String(item.id)) || mappedIds.includes(String(item.serverId)))
			|| active.find(item => mapped.some(mapping => normalizeMerchantText(mapping.merchantName) === normalizeMerchantText(item.name)))
		if (match) return {match, status: 'confirmed_mapping', suggestions: [], identityKeys}
	}

	const hints = [merchant?.rawName, merchant?.legalName, merchant?.normalizedHint]
		.map(normalizeMerchantText).filter(Boolean)
	const exact = active.filter(item => hints.includes(normalizeMerchantText(item.name)))
	if (exact.length === 1) return {match: exact[0], status: 'exact', suggestions: [], identityKeys}
	if (exact.length > 1) return {match: null, status: 'ambiguous', suggestions: exact, identityKeys}

	const legalHints = [merchant?.legalName, merchant?.rawName].map(normalizeLegalName).filter(Boolean)
	const legal = active.filter(item => legalHints.includes(normalizeLegalName(item.name)))
	if (legal.length === 1) return {match: legal[0], status: 'legal_exact', suggestions: [], identityKeys}
	if (legal.length > 1) return {match: null, status: 'ambiguous', suggestions: legal, identityKeys}

	const suggestions = active
		.map(item => ({item, score: Math.max(...legalHints.map(hint => tokenSimilarity(hint, item.name)), 0)}))
		.filter(candidate => candidate.score >= 0.5)
		.sort((a, b) => b.score - a.score)
		.slice(0, 3)
		.map(candidate => candidate.item)
	return {match: null, status: suggestions.length ? 'suggested' : 'unmatched', suggestions, identityKeys}
}

export {getMerchantIdentityKeys, matchXmlMerchant, normalizeLegalName, normalizeMerchantText}
