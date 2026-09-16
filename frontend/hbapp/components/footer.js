const getStringDate = (str = null) => {
	
	let date = str ? new Date(Number(str)) : new Date()
	return `${date.getDate() < 10 ? '0' + date.getDate() : date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`
}

const footer = {

	setContent: (hbapp, config) => {
		let footerHtml = `<footer class="footer">
			<div class="text-center">
				${config.appAlias}
				${config.version}  
				${config.author}
				${config.ftdata}
			</div>
			<!-- div class="text-center copy-date">
				${getStringDate(config.startDevTime)} - ${getStringDate()}
			</div -->
		</footer>`
		hbapp.insertAdjacentHTML('beforeend', footerHtml)
	}
}

export default footer
