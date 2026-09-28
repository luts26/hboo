const MONTHS = [
	'January', 
	'February', 
	'March', 
	'April', 
	'May', 
	'June', 
	'July', 
	'August', 
	'September', 
	'October', 
	'November', 
	'December'
]
let inputDatePicker = null
let inputDatePickerFrom = null
let inputDatePickerTo = null
let datePickerStyleMounted = false

const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const isValidDateValue = value => DATE_VALUE_PATTERN.test(String(value || ''))

const parseDateValue = value => {
	const match = String(value || '').match(DATE_VALUE_PATTERN)
	if (!match) return null
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
	return Number.isNaN(date.getTime()) ? null : date
}

const formatDateValue = date => {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-')
}

const getCurrentDateValue = () => formatDateValue(new Date())

const _setDatePickerStyle = () => {
	if (datePickerStyleMounted) return
	datePickerStyleMounted = true

	let datePickerStyle = document.createElement('style')
	datePickerStyle.innerText =  `
		.date-picker-group {
			position: relative;
		}
		.input-date-picker-container,
		.select-date-picker-container {
			display: flex;
		}
		.date-picker-hide .select-date-picker-container,
		.date-picker-hide table {
			display: none;
			opacity: 0;
		}
		.filter-by-date {
			height: 46px;
			position: relative;
		}
		date-picker input {
			width: 100%;
			padding: 0 2rem;
			border: none;
			outline: none;
			display: inline-block;
			font-size: 13pt;
			border-radius: 1rem;
		}
		date-picker input + label {
			position: absolute;
			opacity: 1;
		}
		date-picker input + label,
		date-picker input:focus + label {
			top: -15px;
			left: 2rem;
			font-size: 70%;
		}
		#date select {
			border: none;
			padding: 1rem;
			width: 50%;
		}
		date-picker {
			width: 90%;
			display: block;
			border-radius: 1rem;
			background: white;
			position: absolute;
			top: 0;
			padding: 1.5rem 0 1rem;
		}
		date-picker table {
			padding: 10px 15px;
			opacity: 1;
			transition: all 1s linear;
			width: 100%;
		}
		date-picker th,
		date-picker td {
			padding: 5px;
		}
		date-picker td {
			text-align: right;
			cursor: pointer;
		}
		date-picker  td:hover {
			box-shadow: 0 0 10px rgba(0, 0, 0, .3);
		}
		date-picker  td.active {
			color: red;
		}`
	document.head.appendChild(datePickerStyle)
}

const _getCalendarFilters = (monthNumber = new Date().getMonth(), year = new Date().getFullYear()) => {
	const currentYear = new Date().getFullYear()
	const years = new Set([year, currentYear, currentYear - 1, currentYear + 1, 2023, 2024, 2025, 2026])
	let calendarTemplate = `
		<div id="date">
			<div class="input-date-picker-container">
				<div class="date-picker-group">
					<input class="input-date-picker-from" id="input-date-picker-from" type="text" placehoder="from">
					<label for="input-date-picker-from">From: </label>
				</div>
				<div class="date-picker-group">
					<input class="input-date-picker-to" id="input-date-picker-to" type="text" placehoder="to">
					<label for="input-date-picker-to">To: </label>
				</div>
			</div>
			<div class="select-date-picker-container">
				<select name="smonth" id="smonth">`

					MONTHS.forEach((m, index) => {
						calendarTemplate += `<option ${index === monthNumber ? 'selected ' : ''}value="${index}">
							${MONTHS[index]}
						</option>`
					})
				calendarTemplate += `</select>
				<select name="syear" id="syear">
					${Array.from(years).sort((a, b) => a - b).map(item => {
						return `<option ${item === year ? 'selected ' : ''}value="${item}">${item}</option>`
					}).join('')}
				</select>
			</div>
		</div>
		<div class="calendar-table"></div>`
	return calendarTemplate
}

const createCalendar = (selectDate = new Date(), selectedRange = null) => {

	let currentDate = new Date()
	let dateFromSelect = selectDate instanceof Date ? new Date(selectDate.getTime()) : new Date(selectDate)
	if (Number.isNaN(dateFromSelect.getTime())) dateFromSelect = currentDate

	let year = dateFromSelect.getFullYear()
	let month = String(dateFromSelect.getMonth() + 1).padStart(2, '0')
	let selectedTo = selectedRange?.to ? parseDateValue(selectedRange.to) : null
	let day = selectedTo && !Number.isNaN(selectedTo.getTime()) ? selectedTo.getDate() : currentDate.getDate()
	let dayOfWeek = new Date(year, dateFromSelect.getMonth()).getDay()
	let curentDay = 1
	const selectedMonth = `${year}-${month}`
	inputDatePicker = selectedRange?.to || `${selectedMonth}-${String(day).padStart(2, '0')}`
	inputDatePickerFrom = selectedRange?.from || `${selectedMonth}-01`
	let monthDays = 32 - new Date(year, dateFromSelect.getMonth(), 32).getDate()
	let calendarTemplate = `
	<table>
		<tr>
			<th>Sun</th>
			<th>Mon</th>
			<th>Tue</th>
			<th>Wed</th>
			<th>Thu</th>
			<th>Fri</th>
			<th>Sat</th>
		</tr>`
	for (let i = 0; i < 6; i++) {
		calendarTemplate += '<tr>'
		for (let j = 0; j < 7; j++) {
			if (curentDay > monthDays) break;
			if (i === 0 && j < dayOfWeek) {
				calendarTemplate += `<td></td>`
			} else {
				calendarTemplate += `<td class="${day === curentDay ? 'active' : ''}">${curentDay}</td>`
				curentDay++
			}
		}
		calendarTemplate += '</tr>'
	}
	calendarTemplate += `</table>`

	return calendarTemplate
}

const datePickerDefault = (selectedRange = null) => {

	_setDatePickerStyle()

	const $datePicker = document.querySelector('date-picker')
	if (!$datePicker) return
	const currentFrom = $datePicker.querySelector('.input-date-picker-from')?.value || ''
	const currentTo = $datePicker.querySelector('.input-date-picker-to')?.value || ''
	const explicitRange = selectedRange?.from && selectedRange?.to
		? selectedRange
		: (isValidDateValue(currentFrom) && isValidDateValue(currentTo) ? {from: currentFrom, to: currentTo} : null)
	const fallbackTo = getCurrentDateValue()
	const fallbackFrom = `${fallbackTo.slice(0, 8)}01`
	const pickerRange = {
		from: explicitRange?.from || inputDatePickerFrom || fallbackFrom,
		to: explicitRange?.to || inputDatePickerTo || inputDatePicker || fallbackTo
	}
	const selectedDate = parseDateValue(pickerRange.from) || new Date()
	$datePicker.classList.add('date-picker-hide')
	$datePicker.innerHTML = _getCalendarFilters(selectedDate.getMonth(), selectedDate.getFullYear())
	$datePicker.querySelector('.calendar-table').innerHTML = createCalendar(selectedDate, pickerRange)
	$datePicker.querySelector('.input-date-picker-from').value = pickerRange.from
	$datePicker.querySelector('.input-date-picker-to').value = pickerRange.to
	inputDatePickerFrom = pickerRange.from
	inputDatePickerTo = pickerRange.to
	inputDatePicker = pickerRange.to

	const renderSelectedMonth = () => {
		const year = Number($datePicker.querySelector('#syear')?.value) || new Date().getFullYear()
		const month = Number($datePicker.querySelector('#smonth')?.value) || 0
		const selectedMonth = new Date(year, month, 1)
		$datePicker.querySelector('.calendar-table').innerHTML = createCalendar(selectedMonth, {
			from: $datePicker.querySelector('.input-date-picker-from')?.value,
			to: $datePicker.querySelector('.input-date-picker-to')?.value
		})
	}

	$datePicker.querySelector('#smonth').addEventListener('change', renderSelectedMonth)
	$datePicker.querySelector('#syear').addEventListener('change', renderSelectedMonth)

	$datePicker.addEventListener('click', e => {

		if (e.target.closest('.input-date-picker-from')) {
			if ($datePicker.querySelector('.active-input')) $datePicker.querySelector('.active-input').classList.remove('active-input')
			$datePicker.classList.toggle('date-picker-hide')
			e.target.classList.add('active-input')
			return
		}
		if (e.target.closest('.input-date-picker-to')) {
			if ($datePicker.querySelector('.active-input')) $datePicker.querySelector('.active-input').classList.remove('active-input')
			$datePicker.classList.toggle('date-picker-hide')
			e.target.classList.add('active-input')
			return
		}
		if (e.target.closest('td')) {
			let selectedDay = e.target.closest('td')
			if (!selectedDay.textContent) return
			$datePicker.querySelector('td.active')?.classList.remove('active')
			selectedDay.classList.add('active')
			$datePicker.classList.add('date-picker-hide')
			const activeInput = $datePicker.querySelector('.active-input')
			if (!activeInput) return
			const year = Number($datePicker.querySelector('#syear')?.value) || new Date().getFullYear()
			const month = String((Number($datePicker.querySelector('#smonth')?.value) || 0) + 1).padStart(2, '0')
			activeInput.value = `${year}-${month}-${selectedDay.textContent.padStart(2, '0')}`
			inputDatePickerFrom = $datePicker.querySelector('.input-date-picker-from')?.value || inputDatePickerFrom
			inputDatePickerTo = $datePicker.querySelector('.input-date-picker-to')?.value || inputDatePickerTo
			inputDatePicker = activeInput.value
		}
	})
	
}

export {datePickerDefault}
