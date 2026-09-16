const planningCategories = [
	{key: 'products', name: 'Продукти'},
	{key: 'restaurant', name: 'Кафе та ресторани'},
	{key: 'health', name: 'Краса та здоровя'},
	{key: 'transport', name: 'Транспорт'},
	{key: 'home', name: 'Товари для дому'},
	{key: 'savings', name: 'Заощадження'},
	{key: 'cards', name: 'Переказ на карту'},
	{key: 'charity', name: 'Благодійність'},
	{key: 'other', name: 'Інше'}
]

const getPlanningCategoryNameByKey = key => {
	const category = planningCategories.find(item => item.key === key)
	return category ? category.name : key
}

export {getPlanningCategoryNameByKey, planningCategories}
