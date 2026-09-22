const DEFAULT_EDGE_WIDTH = 28
const MIN_HORIZONTAL_DISTANCE = 72
const DIRECTION_RATIO = 1.35

export function getEdgeSwipeWidth(viewportWidth = 0) {
	const viewport = Number(viewportWidth) || 0
	if (!viewport) return DEFAULT_EDGE_WIDTH
	return Math.max(DEFAULT_EDGE_WIDTH, Math.min(44, viewport * 0.08))
}

export function isLeftEdgeSwipeStart(clientX, viewportWidth = 0) {
	return Number(clientX) <= getEdgeSwipeWidth(viewportWidth)
}

export function resolveWorkspaceSwipe(start, end, state = {}) {
	if (!start || !end) return null
	const deltaX = Number(end.x) - Number(start.x)
	const deltaY = Number(end.y) - Number(start.y)
	const mobileView = state.mobileView === 'sidebar' ? 'sidebar' : 'content'
	const viewportWidth = state.viewportWidth || 0

	if (Math.abs(deltaX) < MIN_HORIZONTAL_DISTANCE) return null
	if (Math.abs(deltaX) <= Math.abs(deltaY) * DIRECTION_RATIO) return null

	if (mobileView === 'content') {
		if (deltaX > 0 && isLeftEdgeSwipeStart(start.x, viewportWidth)) return 'open'
		return null
	}

	if (deltaX < 0) return 'close'
	return null
}
