import AuthForm from './AuthForm.js'

class AuthModal {

	constructor({documentRef = typeof document !== 'undefined' ? document : null} = {}) {
		this.documentRef = documentRef
		this.root = null
		this.form = null
		this.previousFocus = null
		this.handleKeydown = event => {
			if (event.key === 'Escape') this.close()
		}
	}

	isOpen() {
		return Boolean(this.root)
	}

	open() {
		if (!this.documentRef || this.isOpen()) {
			this.form?.focus()
			return
		}

		this.previousFocus = this.documentRef.activeElement
		this.root = this.documentRef.createElement('div')
		this.root.className = 'app-modal-backdrop auth-modal-backdrop'
		this.root.innerHTML = `<div class="app-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
			<div class="app-modal-header">
				<h4 id="auth-modal-title">Sign in</h4>
				<button class="app-modal-close auth-modal-close" type="button" title="Close" aria-label="Close">×</button>
			</div>
			<div class="app-modal-body auth-modal-body"></div>
		</div>`

		this.documentRef.body.append(this.root)
		this.documentRef.body.classList.add('hboo-auth-modal-open')
		this.root.querySelector('.auth-modal-close')?.addEventListener('click', () => this.close())
		this.documentRef.addEventListener('keydown', this.handleKeydown)

		this.form = new AuthForm({
			root: this.root.querySelector('.auth-modal-body'),
			onSuccess: () => this.close(),
			onCancel: () => this.close()
		})
		setTimeout(() => this.form?.focus(), 0)
	}

	close() {
		if (!this.root || !this.documentRef) return
		this.form?.destroy()
		this.form = null
		this.documentRef.removeEventListener('keydown', this.handleKeydown)
		this.documentRef.body.classList.remove('hboo-auth-modal-open')
		this.root.remove()
		this.root = null
		if (this.previousFocus?.focus) this.previousFocus.focus()
		this.previousFocus = null
	}
}

export {AuthModal}
export default new AuthModal()
