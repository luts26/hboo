const listeners = new Set()

let state = {
	syncStatus: 'idle',
	pendingCount: 0,
	syncError: null,
	lastSuccessfulSyncAt: null
}

const getState = () => ({...state})

const setState = patch => {
	const next = {...state, ...patch}
	if (JSON.stringify(next) === JSON.stringify(state)) return getState()
	state = next
	listeners.forEach(listener => listener(getState()))
	return getState()
}

const subscribe = listener => {
	if (typeof listener !== 'function') return () => {}
	listeners.add(listener)
	listener(getState())
	return () => listeners.delete(listener)
}

export {getState, setState, subscribe}
