const _hbRangeStyle = () => {

	let hbRangeStyle = document.createElement('style')

	hbRangeStyle.innerText =  `
		.hboo-range {
			background: #ebf5fc;
			height: 300px;
			max-width: 300px;
			width: 100%;
			display: flex;
			justify-content: center;
			align-items: stretch;
			padding: 3rem 1rem 2rem;
			margin: 2rem 0;
			box-shadow: -1px -1px 10px #ffffff, 1px 1px 10px rgba(70,70,70,.15);
			border: 1px solid #f7f7f7;
			border-radius: 10px;
		}

		.dark-theme .hboo-range {
			background: #222;
			color: white;
		}

		.hb-range-container {
			rotate: 180deg;
			position: relative;
			width: 36px;

		}

		.hb-range-default {
			width: 40px;
			margin-left: 10px;
			border-color: grey;
			border-width: 0px 2px 0px 2px;
			border-style: solid;
			transform: rotate(180deg);
		}

		.hb-range-in {
			width: 40px;
			margin-right: 10px;
			border-color: green;
			border-width: 0px 2px 0px 2px;
			border-style: solid;
		}

		.hb-range-in span {
			background: green;
		}

		.hb-range-out {
			width: 40px;
			border-style: solid;
			border-color: red;
			border-width: 0px 2px 0px 2px;
		}

		.hb-range-out span {
			background: red;
		}


		.hb-range-container span {
			width: 36px;
			height: 2%;
			display: block;
			transition: all 1s linear;
		}

		.hb-range-count {
			position: absolute;
			font-size: 70%;
			transition: all 1s linear;
			rotate: 180deg;
			width: 120px;
			background: #ebf5fc;
			box-shadow: 0 0 10px rgba(0,0,0,.1);
			border-radius: 20px;
			text-align: center;
			line-height: 15px;
		}

		.dark-theme .hb-range-count {
			color: white;
			background: black;
		}

		.hb-range-in .hb-range-count {
			left: 10px;
			top: 10px;
		}

		.hb-range-in .hb-range-count:before {
			content: "\\2191";
			color: green;
			font-size: 14pt;
			font-weight: 600;
		}

		.hb-range-out .hb-range-count {
			right: 14px;
			top: 10px;
		}

		.hb-range-out .hb-range-count:after {
			content: "\\2193";
			color: red;
			font-size: 14pt;
			font-weight: 600;
		}
	`

	document.head.appendChild(hbRangeStyle)
}

const _parceNumber = n => {
	let num = `${n}`.split('.')
	let res = num[0].split('').reverse().map((i, index) => {
		if ((index !== 0) && ((index % 3) === 0)) {
			i += ' '
		}
		return i
	}).reverse().join('')
	if (num.length > 0) return `${res}.${num[1]}`
	return res
}

const hbRangeDefault = () => {

	_hbRangeStyle()

	let rangeTmpl = `<div class="hboo-range">
		<div class="hb-range-in hb-range-container">
			<span></span>
			<div class="hb-range-count">0</div>
		</div>
		<div class="hb-range-out hb-range-container">
			<span></span>
			<div class="hb-range-count">0</div>
		</div>
	</div>`

	return rangeTmpl
}

const hbRangeCreate = (rin = 0, rout = 0, rangesArr = []) => {

	const $hbooRange = document.querySelector('.hboo-range')
	const hbRangeIn = $hbooRange.querySelector('.hb-range-in span')
	const hbRangeOut = $hbooRange.querySelector('.hb-range-out span')
	const hbRangeInCount = $hbooRange.querySelector('.hb-range-in .hb-range-count')
	const hbRangeOutCount = $hbooRange.querySelector('.hb-range-out .hb-range-count')
	let procentx = 0
	if (rin) {
		hbRangeInCount.textContent = _parceNumber(rin)
		hbRangeOutCount.textContent = '-' + _parceNumber(rout)
	}
	// console.log(rangesArr.length)
	// if (rangesArr.length) {
		// console.log('asdf1234')
		let hbRangeHtml = ''

		// procentx = Number(((rin / 150000) * 100).toFixed(1))

		// if (procentx) {
		// 	hbRangeIn.style.height = procentx + '%'
		// 	hbRangeInCount.style.top = (procentx + 2) + '%'
		// }

		Object.keys(rangesArr).forEach((r, v) => {

			let procentx = Number(((rangesArr[r] / 10000) * 10).toFixed(1))
			console.log(procentx, v, r)

			// if (procentx > 100) procentx = 100

			hbRangeHtml += `<div class="hb-range-default" title="${r}"><span style="height:${procentx}%; width: 100%; display: block; background: gray;"></span><div class="hb-range-count">${rangesArr[r]}</div></div>`
		})
		// $hbooRange.insertAdjacentHTML('beforeend', hbRangeHtml)
		$hbooRange.innerHTML = hbRangeHtml
		// return
	// }

	if (rin) {
		procentx = Number(((rin / 150000) * 100).toFixed(1))

		if (procentx) {
			hbRangeIn.style.height = procentx + '%'
			hbRangeInCount.style.top = (procentx + 2) + '%'
		}
	} else {
		hbRangeIn.style.height = '2%'
		hbRangeInCount.style.top = '0'
	}

	if (rout) {

		rin = rin ?? 100000
		procentx = Number(((rout / rin) * 100).toFixed(1))
		if (procentx > 100) {
			hbRangeOut.style.height = '101%'
			hbRangeOutCount.style.top = '106%'
		}
		if (procentx < 100) {
			hbRangeOut.style.height = (procentx) + '%'
			hbRangeOutCount.style.top = (procentx + 2) + '%'
		}
		if (procentx < 1){
			hbRangeOut.style.height = '98%'
			hbRangeOutCount.style.top = '100%'
		}
	} else {
		hbRangeOut.style.height = '2%'
		hbRangeOutCount.style.top = '0'
	}
}

export { hbRangeDefault, hbRangeCreate }
