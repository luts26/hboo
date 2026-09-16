const categoriesLinks = {
	'8': 0,
	'4829': 0,
	'5': 1,
	'5814': 1,
	'5462': 1,
	'5812': 1,
	'5441': 1,
	'10': 2,
	'5499': 2,
	'5411': 2,
	'5399': 2,
	'5912': 3,
	'8071': 3,
	'5976': 3,
	'8021': 3,
	'8099': 3,
	'8062': 3,
	'5945': 4,
	'12': 5,
	'7996': 5,
	'7216': 6,
	'7211': 6,
	'13': 7,
	'7542': 7,
	'5541': 7,
	'11': 8,
	'5944': 8,
	'4812': 8,
	'9399': 8,
	'6012': 8,
	'9402': 9,
	'4214': 9,
	'7399': 9,
	'7299': 9,
	'2': 10,
	'6011': 10,
	'15': 11,
	'4111': 11,
	'4112': 11,
	'1000000000054736': 12,
	'6': 13,
	'4215': 13,
	'5942': 13,
	'5999': 13,
	'7999': 13,
	'5992': 14,
	'9': 15,
	'4900': 15,
	'4814': 15,
	'5977': 16,
	'7230': 16,
	'7011': 17,
	'100000000000896': 18,
	'1000000000054739': 19
}

const categories = [
	{
	    id: 0,
	    category: ['8', '4829'],
	    description: ['Перекази'],
	    icon: 'transfer-money-icon'
	},
	{
	    id: 1,
	    category: ['5', '5814', '5462', '5812', '5441'],
	    description: ['Кафе та ресторани', 'Ресторани та бари'],
	    icon: 'restoran-icon'
	},
	{
	    id: 2,
	    category: ['10', '5499', '5411', '5399'],
	    description: ['Продукти та супермаркети', 'Продукти'],
	    icon: 'food-icon'
	},
	{
	    id: 3,
	    category: ['5912', '8071', '5976', '8021', '8099', '8062'],
	    description: ['Медицина', 'Аназізи', 'Ортопедія', 'Стоматологія', 'Медичне обслуговування'],
	    icon: 'medicine-icon'
	},
	{
	    id: 4,
	    category: ['5945'],
	    description: ['Товари для дітей'],
	    icon: 'toy-icon'
	},
	{
	    id: 5,
	    category: ['7996'],
	    description: ['Розваги'],
	    icon: 'fun-icon'
	},
	{
	    id: 6,
	    category: ['7216', '7211'],
	    description: ['Хімчистка та шиття'],
	    icon: 'cleaning-clothing-icon'
	},
	{
	    id: 7,
	    category: ['13', '7542', '5541'],
	    description: ['Авто'],
	    icon: 'car-icon'
	},
	{
	    id: 8,
	    category: ['11', '5944', '4812', '9399', '6012'],
	    description: ['Інше'],
	    icon: 'other-icon'
	},
	{
	    id: 9,
	    category: ['9402', '4214', '7399', '7299'],
	    description: ['Послуги доставки', 'Укрпошта', 'Нова пошта'],
	    icon: 'delivery-icon'
	},
	{
	    id: 10,
	    category: ['2', '6011'],
	    description: ['Зняття готівки'],
	    icon: 'atm-icon'
	},
	{
	    id: 11,
	    category: ['15', '4111', '4112'],
	    description: ['Подорожі', 'Mетро', 'Дитяча залізниця'],
	    icon: 'travel-icon'
	},
	{
	    id: 12,
	    category: ['1000000000054736'],
	    description: ['Банківські послуги'],
	    icon: ''
	},
	{
	    id: 13,
	    category: ['6', '4215', '5942', '5999', '7999'],
	    description: ['Платежі'],
	    icon: ''
	},
	{
	    id: 14,
	    category: ['5992'],
	    description: ['Квіти'],
	    icon: 'flover-icon'
	},
	{
	    id: 15,
	    category: ['9', '4900', '4814'],
	    description: ['Звязок', 'Поповнення мобільного', 'Iнтернет'],
	    icon: 'mobile-icon'
	},
	{
	    id: 16,
	    category: ['5977', '7230'],
	    description: ['Краса та здоровя'],
	    icon: 'beauty-icon'
	},
	{
	    id: 17,
	    category: ['7011'],
	    description: ['Готелі'],
	    icon: 'hotel-icon'
	},
	{
	    id: 18,
	    category: ['100000000000896'],
	    description: ['Заощадження'],
	    icon: 'savemoney-icon'
	},
	{ 
		id: 19,
		category: ['1000000000054739'],
		description: ['Послуги'],
		icon: ''
	}
]

const getCategoryNameById = id => {
	return categoriesLinks[id] !== undefined ? categories[categoriesLinks[id]].description[0] : ''
}

const getCategoryIconById = id => {
	return categoriesLinks[id] !== undefined ? categories[categoriesLinks[id]].icon : ''
}

export { categories, getCategoryNameById, getCategoryIconById }
