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

const _setDatePickerStyle = () => {

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

const _getCalendarFilters = (monthNumber = new Date().getMonth()) => {
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
					<option value="2023">2023</option>
				</select>
			</div>
		</div>
		<div class="calendar-table"></div>`
	return calendarTemplate
}

const createCalendar = (selectDate = new Date(), selectedRange = null) => {

	let currentDate = new Date()
	let dateFromSelect = new Date(selectDate)

	let year = dateFromSelect.getFullYear()
	let month = (dateFromSelect.getMonth() < 10) ? '0' + (dateFromSelect.getMonth() + 1) : dateFromSelect.getMonth() + 1
	let selectedTo = selectedRange?.to ? new Date(selectedRange.to) : null
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
	$datePicker.classList.add('date-picker-hide')
	const selectedDate = selectedRange?.from ? new Date(selectedRange.from) : new Date()
	$datePicker.innerHTML = _getCalendarFilters(selectedDate.getMonth())
	$datePicker.querySelector('.calendar-table').innerHTML = createCalendar(selectedDate, selectedRange)
	$datePicker.querySelector('.input-date-picker-from').value = selectedRange?.from || inputDatePickerFrom || inputDatePicker
	$datePicker.querySelector('.input-date-picker-to').value = selectedRange?.to || inputDatePickerTo || inputDatePicker

	$datePicker.querySelector('#smonth').addEventListener('change', e => {
		let month = Number(e.target.value) + 1
		inputDatePicker = `2023-${(month) < 10 ? '0' + month : month}`
		document.querySelector('.calendar-table').innerHTML = createCalendar(inputDatePicker)
		document.querySelector('.active-input').value = inputDatePicker
	})

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
			$datePicker.querySelector('td.active').classList.remove('active')
			selectedDay.classList.add('active')
			$datePicker.classList.add('date-picker-hide')
			let dateArr = $datePicker.querySelector('.active-input').value.split('-')
			$datePicker.querySelector('.active-input').value = dateArr[0] + '-' + dateArr[1] + '-' + selectedDay.textContent
		}
	})
	
}

export {datePickerDefault}
