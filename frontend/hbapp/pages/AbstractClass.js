import api from '../mixins/apiQueriesHelper.js'
import router from '../router/router.js'

export default class AbstractClass {

	constructor(hbapp) {
		this.$hbapp = hbapp
		this.apiServer = api
		this.router = router
		this.createdApp()
	}

	addZero(num) {
		return (num < 10) ? `0${num}` : num
	}

	createdApp() {
		document.querySelector('.transactions-today-date').innerHTML = `
			<div>
				${this.timeStampToStringDate()}
			</div>
			<div class="time-some-time">
				${this.timeStampToStringTime()}
			</div>
		`
	}

	addPointToFixed(num) {
		num = Math.abs(num).toString()
		if (num.length <= 2) num = `0${num}`
		let result = (num.slice(0, num.length - 2) + '.' + num.slice(num.length - 2))
		return Number(result).toFixed(2)
	}

	timeStampToStringDate(timeStamp = null, delimeter = '.') {
		let d = new Date()
		if (timeStamp) {
			d = new Date(Number(timeStamp))
		}
		return (delimeter === '.') 
			? `${this.addZero(d.getDate())}.${this.addZero(d.getMonth() + 1)}.${d.getFullYear()}`
			: `${d.getFullYear()}-${this.addZero(d.getMonth() + 1)}-${this.addZero(d.getDate())}`
	}

	timeStampToStringTime(timeStamp = null, sec = true) {
		let d = new Date()
		if (timeStamp) {
			d = new Date(Number(timeStamp))
		}
		let time = `${this.addZero(d.getHours())}:${this.addZero(d.getMinutes())}`
		if (sec) {
			time += `:${this.addZero(d.getSeconds())}`
		}
		return time
	}

	timeStampToStringDateTime(timeStamp) {
		return this.timeStampToStringDate(timeStamp) + ' ' + this.timeStampToStringTime(timeStamp)
	}

	getTimeStampStartCurrentDay() {
		let currentDate = this.timeStampToStringDate(null, '-')
		return new Date(currentDate + ' 00:00:01').getTime()
	}

	getTimeStampFromDiapasone(d1 = '', d2 = '') {
		let d1Arr = d1.split('.')
		let d2Arr = d2.split('.')
		let date1 = new Date(`${d1Arr[2]}-${d1Arr[1]}-${d1Arr[0]} 00:00:01`)
		let date2 = new Date(`${d2Arr[2]}-${d2Arr[1]}-${d2Arr[0]} 23:59:59`)
		return date1.getTime() + ':' + date2.getTime()
	}

	getTimeStamp() {
		return {
			addZero: function(num) {
				return (num < 10) ? `0${num}` : num
			},

			yesterDay: function() {
				let d = new Date()
				return new Date(`${d.getFullYear()}-${this.addZero(d.getMonth() + 1)}-${this.addZero(d.getDate())} 00:00:01`).getTime() - (60*60*24*1000)
			},
			past1Week: function() {
				let d = new Date()
				return new Date(`${d.getFullYear()}-${this.addZero(d.getMonth() + 1)}-${this.addZero(d.getDate())} 00:00:01`).getTime() - (60*60*24*7*1000)
			},
			past1Month: function() {
				let d = new Date()
				return new Date(`${d.getFullYear()}-${this.addZero(d.getMonth())}-${this.addZero(d.getDate())} 00:00:01`).getTime()
			},
			past3Months: function() {
				let d = new Date()
				return new Date(`${d.getFullYear()}-${this.addZero(d.getMonth() - 2)}-${this.addZero(d.getDate())} 00:00:01`).getTime()
			},
			past6Months: function() {
				let d = new Date()
				return new Date(`${d.getFullYear()}-${this.addZero(d.getMonth() - 5)}-${this.addZero(d.getDate())} 00:00:01`).getTime()
			},
			past1Year: function() {
				let d = new Date()
				return new Date(`${d.getFullYear() - 1}-${this.addZero(d.getMonth() + 1)}-${this.addZero(d.getDate())} 00:00:01`).getTime()
			}
		}
	}
}
