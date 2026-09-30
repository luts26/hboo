const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
const MAX_LONG_EDGE = 2400
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

async function prepareReceiptImage(file) {
	if (!file) throw new Error('Receipt image is required')
	if (file.size > MAX_RECEIPT_BYTES) throw new Error('Receipt image is too large.')
	const sniffedType = await sniffMimeType(file)
	if (!sniffedType || !SUPPORTED_RECEIPT_TYPES.has(sniffedType)) throw new Error('Unsupported image format.')

	const image = await loadImage(file)
	const longEdge = Math.max(image.naturalWidth, image.naturalHeight)
	if (!longEdge || longEdge <= MAX_LONG_EDGE && sniffedType !== 'image/png') {
		return {
			blob: file,
			mimeType: sniffedType,
			originalFilename: file.name || null,
			size: file.size
		}
	}

	const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1
	const width = Math.max(1, Math.round(image.naturalWidth * scale))
	const height = Math.max(1, Math.round(image.naturalHeight * scale))
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	const context = canvas.getContext('2d', {alpha: false})
	context.fillStyle = '#ffffff'
	context.fillRect(0, 0, width, height)
	context.drawImage(image, 0, 0, width, height)
	const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
	if (!blob) throw new Error('Could not prepare receipt image')
	if (blob.size > MAX_RECEIPT_BYTES) throw new Error('Receipt image is too large.')
	return {
		blob,
		mimeType: 'image/jpeg',
		originalFilename: file.name || null,
		size: blob.size
	}
}

export {
	JPEG_QUALITY,
	MAX_LONG_EDGE,
	MAX_RECEIPT_BYTES,
	SUPPORTED_RECEIPT_TYPES,
	prepareReceiptImage,
	sniffMimeType
}
