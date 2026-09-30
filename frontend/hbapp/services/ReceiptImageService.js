const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
const MAX_SOURCE_BYTES = 30 * 1024 * 1024
const NORMAL_MAX_LONG_EDGE = 3200
const NORMAL_MAX_PIXELS = 8_000_000
const TALL_ASPECT_RATIO = 3
const TALL_MAX_WIDTH = 1600
const TALL_MAX_HEIGHT = 12000
const TALL_MAX_PIXELS = 12_000_000
const JPEG_QUALITY = 0.86
const SUPPORTED_RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const sniffMimeType = async file => {
	const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
	if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg'
	if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => header[index] === value)) return 'image/png'
	if (String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP') return 'image/webp'
	return null
}

const loadImage = file => new Promise((resolve, reject) => {
	const url = URL.createObjectURL(file)
	const image = new Image()
	image.onload = () => {
		URL.revokeObjectURL(url)
		resolve(image)
	}
	image.onerror = () => {
		URL.revokeObjectURL(url)
		reject(new Error('Could not read receipt image'))
	}
	image.src = url
})

const canvasToBlob = (canvas, type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality))

const roundDimension = value => Math.max(1, Math.round(value))

const calculateScaledDimensions = ({sourceWidth, sourceHeight, maxLongEdge = null, maxWidth = null, maxHeight = null, maxPixels = null}) => {
	const scales = [1]
	const longEdge = Math.max(sourceWidth, sourceHeight)
	if (maxLongEdge && longEdge > maxLongEdge) scales.push(maxLongEdge / longEdge)
	if (maxWidth && sourceWidth > maxWidth) scales.push(maxWidth / sourceWidth)
	if (maxHeight && sourceHeight > maxHeight) scales.push(maxHeight / sourceHeight)
	if (maxPixels && sourceWidth * sourceHeight > maxPixels) scales.push(Math.sqrt(maxPixels / (sourceWidth * sourceHeight)))
	const scale = Math.min(...scales)
	return {
		scale,
		width: roundDimension(sourceWidth * scale),
		height: roundDimension(sourceHeight * scale)
	}
}

const classifyReceiptImage = ({width, height}) => {
	if (width > 0 && height / width >= TALL_ASPECT_RATIO) return 'tall'
	return 'normal'
}

const getReceiptImagePreparationPlan = ({width, height, mimeType, sourceBytes = 0}) => {
	const sourceWidth = Number(width)
	const sourceHeight = Number(height)
	if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
		throw new Error('Could not read receipt image dimensions')
	}
	const classification = classifyReceiptImage({width: sourceWidth, height: sourceHeight})
	const dimensions = classification === 'tall'
		? calculateScaledDimensions({
			sourceWidth,
			sourceHeight,
			maxWidth: TALL_MAX_WIDTH,
			maxHeight: TALL_MAX_HEIGHT,
			maxPixels: TALL_MAX_PIXELS
		})
		: calculateScaledDimensions({
			sourceWidth,
			sourceHeight,
			maxLongEdge: NORMAL_MAX_LONG_EDGE,
			maxPixels: NORMAL_MAX_PIXELS
		})
	const resized = dimensions.width !== sourceWidth || dimensions.height !== sourceHeight
	const requiresSizeReduction = Number(sourceBytes) > MAX_RECEIPT_BYTES
	const outputType = !resized && !requiresSizeReduction
		? mimeType
		: (mimeType === 'image/png' ? 'image/png' : 'image/jpeg')
	return {
		sourceWidth,
		sourceHeight,
		outputWidth: dimensions.width,
		outputHeight: dimensions.height,
		scale: dimensions.scale,
		classification,
		resized,
		requiresSizeReduction,
		sourceType: mimeType,
		outputType
	}
}

const createPreparationInfo = ({plan, file, blob}) => ({
	sourceWidth: plan.sourceWidth,
	sourceHeight: plan.sourceHeight,
	outputWidth: plan.outputWidth,
	outputHeight: plan.outputHeight,
	sourceType: plan.sourceType,
	outputType: plan.outputType,
	sourceBytes: file.size,
	outputBytes: blob.size,
	classification: plan.classification,
	resized: plan.resized,
	reencoded: blob !== file
})

const shouldLogReceiptImagePreparation = () => {
	try {
		return globalThis.__HBOO_RECEIPT_IMAGE_DEBUG__ === true
			|| globalThis.localStorage?.getItem('hbooReceiptImageDebug') === '1'
	} catch {
		return false
	}
}

const logReceiptImagePreparation = info => {
	if (!shouldLogReceiptImagePreparation()) return
	console.debug('Receipt image preparation:', {
		source: `${info.sourceWidth}x${info.sourceHeight} ${info.sourceType} ${info.sourceBytes} bytes`,
		output: `${info.outputWidth}x${info.outputHeight} ${info.outputType} ${info.outputBytes} bytes`,
		classification: info.classification,
		resized: info.resized,
		reencoded: info.reencoded
	})
}

async function prepareReceiptImage(file) {
	if (!file) throw new Error('Receipt image is required')
	if (file.size > MAX_SOURCE_BYTES) throw new Error('Receipt image is too large.')
	const sniffedType = await sniffMimeType(file)
	if (!sniffedType || !SUPPORTED_RECEIPT_TYPES.has(sniffedType)) throw new Error('Unsupported image format.')

	// Browser image decoding applies the orientation used for drawing into canvas in current supported browsers.
	const image = await loadImage(file)
	const plan = getReceiptImagePreparationPlan({
		width: image.naturalWidth,
		height: image.naturalHeight,
		mimeType: sniffedType,
		sourceBytes: file.size
	})
	if (!plan.resized && !plan.requiresSizeReduction) {
		const info = createPreparationInfo({plan, file, blob: file})
		logReceiptImagePreparation(info)
		return {
			blob: file,
			mimeType: sniffedType,
			originalFilename: file.name || null,
			size: file.size,
			preparationInfo: info
		}
	}

	const canvas = document.createElement('canvas')
	canvas.width = plan.outputWidth
	canvas.height = plan.outputHeight
	const context = canvas.getContext('2d', {alpha: false})
	context.fillStyle = '#ffffff'
	context.fillRect(0, 0, plan.outputWidth, plan.outputHeight)
	context.drawImage(image, 0, 0, plan.outputWidth, plan.outputHeight)
	const blob = await canvasToBlob(canvas, plan.outputType, plan.outputType === 'image/jpeg' ? JPEG_QUALITY : undefined)
	if (!blob) throw new Error('Could not prepare receipt image')
	if (blob.size > MAX_RECEIPT_BYTES) throw new Error('Receipt image is too large.')
	const info = createPreparationInfo({plan, file, blob})
	logReceiptImagePreparation(info)
	return {
		blob,
		mimeType: plan.outputType,
		originalFilename: file.name || null,
		size: blob.size,
		preparationInfo: info
	}
}

export {
	JPEG_QUALITY,
	MAX_SOURCE_BYTES,
	NORMAL_MAX_LONG_EDGE,
	NORMAL_MAX_PIXELS,
	TALL_ASPECT_RATIO,
	TALL_MAX_HEIGHT,
	TALL_MAX_PIXELS,
	TALL_MAX_WIDTH,
	MAX_RECEIPT_BYTES,
	SUPPORTED_RECEIPT_TYPES,
	getReceiptImagePreparationPlan,
	prepareReceiptImage,
	sniffMimeType
}
