import test from 'node:test'
import assert from 'node:assert/strict'
import {
	getEdgeSwipeWidth,
	isLeftEdgeSwipeStart,
	resolveWorkspaceSwipe
} from '../hbapp/services/WorkspaceNavigationGesture.js'

test('left edge swipe width scales within a small bounded area', () => {
	assert.equal(getEdgeSwipeWidth(320), 28)
	assert.equal(getEdgeSwipeWidth(600), 44)
	assert.equal(getEdgeSwipeWidth(1200), 44)
})

test('content view opens only from a right swipe that starts near the left edge', () => {
	const state = {mobileView: 'content', viewportWidth: 390}

	assert.equal(resolveWorkspaceSwipe({x: 8, y: 120}, {x: 112, y: 128}, state), 'open')
	assert.equal(resolveWorkspaceSwipe({x: 80, y: 120}, {x: 190, y: 128}, state), null)
	assert.equal(resolveWorkspaceSwipe({x: 8, y: 120}, {x: -92, y: 128}, state), null)
})

test('sidebar view closes on an intentional left swipe', () => {
	const state = {mobileView: 'sidebar', viewportWidth: 390}

	assert.equal(resolveWorkspaceSwipe({x: 260, y: 120}, {x: 150, y: 126}, state), 'close')
	assert.equal(resolveWorkspaceSwipe({x: 260, y: 120}, {x: 340, y: 126}, state), null)
})

test('mostly vertical or short gestures do not toggle workspace navigation', () => {
	assert.equal(resolveWorkspaceSwipe(
		{x: 8, y: 80},
		{x: 90, y: 170},
		{mobileView: 'content', viewportWidth: 390}
	), null)
	assert.equal(resolveWorkspaceSwipe(
		{x: 8, y: 80},
		{x: 60, y: 86},
		{mobileView: 'content', viewportWidth: 390}
	), null)
	assert.equal(isLeftEdgeSwipeStart(30, 320), false)
})
