const _setCalcStyle = () => {

	let yCalcStyle = document.createElement('style')

	yCalcStyle.innerText = `
		.ycalculate {
			margin: 2rem auto 0;
			border-radius: 20px;
			box-shadow: 0 0 10px rgba(0, 0, 0, .5);
			padding: 1rem;
			max-width: 360px;
			width: 90%;
		}

		.ycalc-helpsbtn {
			display: flex;
			align-items: center;
			justify-content: space-between;
		}

		.ycalc-buttons {
			display: flex;
			padding-top: .5rem;
			text-align: center;
		}

		.ycalc-display {
			box-shadow: 0 0 10px rgba(0, 0, 0, .2);
			outline: none;
			margin: .5rem auto 1rem;
			padding: .5rem 1rem;
			width: 90%;
			box-sizing: border-box;
			border-radius: 12px;
			text-align: right;
		}
		.ycalculate button {
			border: none;
			padding: .4rem 1.5rem;
			margin: .1rem;
		}
	`
	document.head.appendChild(yCalcStyle)
}

const yCalc = () => {

	_setCalcStyle()

	let yCalcTemplate = `
		<div class="ycalculate">
			<div class="ycalc-display" contenteditable>0</div>
			<div class="ycalc-helpsbtn">
				<button data-ycalc="clr">C</button>
				<button data-ycalc="del">DEL</button>
			</div>
			<div class="ycalc-buttons">
				<div>
					<button data-ycalc="num">7</button>
					<button data-ycalc="num">4</button>
					<button data-ycalc="num">1</button>
					<button data-ycalc="num">.</button>
				</div>
				<div>
					<button data-ycalc="num">8</button>
					<button data-ycalc="num">5</button>
					<button data-ycalc="num">2</button>
					<button data-ycalc="num">0</button>
				</div>
				<div>
					<button data-ycalc="num">9</button>
					<button data-ycalc="num">6</button>
					<button data-ycalc="num">3</button>
					<button data-ycalc="equals">=</button>
				</div>
				<div>
					<button data-ycalc="delimeter">/</button>
					<button data-ycalc="delimeter">*</button>
					<button data-ycalc="delimeter">-</button>
					<button data-ycalc="delimeter">+</button>
				</div>
			</div>
		</div>
	`
	document.querySelector('.sidebar').insertAdjacentHTML('beforeend', yCalcTemplate)
	const $calc = document.querySelector('.ycalculate')
	const $display = $calc.querySelector('.ycalc-display')
	const delimeters = ['*', '/', '+', '-']
	let delimeter = null
	let displayRow = ''

	const getCalcResult = () => {
		let arr = displayRow.split(delimeter)
		let [num1, num2] = arr
		num1 = Number(num1)
		num2 = Number(num2)
		let res = 0
		switch(delimeter) {

			case '*':
				res = num1 * num2
				break

			case '/':
				if (num2 === 0) res = 0
				else res = num1 / num2
				break

			case '+':
				res = num1 + num2
				break

			case '-':
				res = num1 - num2
		}
		displayRow = res
		delimeter = null
	}

	$calc.addEventListener('click', e => {
		if (e.target.closest('button')) {

			const {ycalc} = e.target.dataset

			switch(ycalc) {

				case 'num':
					displayRow += e.target.textContent
					break

				case 'delimeter':
					if (delimeter) getCalcResult()
					displayRow += e.target.textContent
					delimeter = e.target.textContent
					break

				case 'equals':
					getCalcResult()
					break

				case 'del':
					let lengthStr = displayRow.length - 1
					let tmpDelimeter = displayRow.charAt(lengthStr)
					if (delimeters.indexOf(tmpDelimeter) !== -1) delimeter = null
					displayRow = displayRow.substring(0, lengthStr)
					break

				default: 
					displayRow = ''
					$calc.querySelector('.ycalc-display').textContent = 0
			}

			if (displayRow !== '') $calc.querySelector('.ycalc-display').textContent = displayRow
		}
	})
}

export {yCalc}
