type Variant = {
  value: string
  options: string[]
}
type SKU = {
  value: string
  price: number
  stock: number
  image: string
}

type Data = {
  product: {
    publishedAt: string | null
    name: string
    basePrice: number
    virtualPrice: number
    brandId: number
    images: string[]
    variants: Variant[]
    categories: number[]
  }
  skus: SKU[]
}

const data: Data = {
  product: {
    publishedAt: null,
    name: 'Sản phẩm test',
    basePrice: 100000,
    virtualPrice: 100000,
    brandId: 1,
    images: ['https://via.placeholder.com/150'],
    variants: [],
    categories: [1],
  },
  skus: [
    { value: 'Đen-S', price: 0, stock: 100, image: '' },
    { value: 'Đen-M', price: 0, stock: 100, image: '' },
    { value: 'Đen-L', price: 0, stock: 100, image: '' },
    { value: 'Đen-XL', price: 0, stock: 100, image: '' },
    { value: 'Trắng-S', price: 0, stock: 100, image: '' },
    { value: 'Trắng-M', price: 0, stock: 100, image: '' },
    { value: 'Trắng-L', price: 0, stock: 100, image: '' },
    { value: 'Trắng-XL', price: 0, stock: 100, image: '' },
    { value: 'Xanh-S', price: 0, stock: 100, image: '' },
    { value: 'Xanh-M', price: 0, stock: 100, image: '' },
    { value: 'Xanh-L', price: 0, stock: 100, image: '' },
    { value: 'Xanh-XL', price: 0, stock: 100, image: '' },
    { value: 'Tím-S', price: 0, stock: 100, image: '' },
    { value: 'Tím-M', price: 0, stock: 100, image: '' },
    { value: 'Tím-L', price: 0, stock: 100, image: '' },
    { value: 'Tím-XL', price: 0, stock: 100, image: '' },
  ],
}

const variants: Variant[] = [
  {
    value: 'Màu sắc',
    options: ['Đen', 'Trắng', 'Xanh', 'Tím', 'Đỏ'],
  },
  {
    value: 'Kích thước',
    options: ['S', 'M', 'L', 'XL'],
  },
  // Bạn có thể thử thêm variant thứ 3 vào đây, ví dụ: 'Chất liệu'
  // { value: 'Chất liệu', options: ['Cotton', 'Lụa'] }
]

function generateSKUs(variants: Variant[]): SKU[] {
  // 1. Xử lý trường hợp mảng rỗng
  if (variants.length === 0) return []

  // 2. Tạo ra tất cả các tổ hợp string (Cartesian Product)
  const combinations = variants.reduce((acc: string[], currentVariant) => {
    // Nếu acc rỗng (vòng lặp đầu tiên), trả về options của variant đầu tiên
    if (acc.length === 0) {
      return currentVariant.options
    }

    // Nếu không, nhân các phần tử trong acc với options hiện tại
    return acc.flatMap((existingValue) => currentVariant.options.map((option) => `${existingValue}-${option}`))
  }, [])

  // 3. Map các tổ hợp string thành object SKU hoàn chỉnh
  return combinations.map((value) => ({
    value: value,
    price: 0,
    stock: 100,
    image: '',
  }))
}

// Update data to use the variants and generated SKUs
data.product.variants = variants
data.skus = generateSKUs(variants)

console.log(JSON.stringify(data, null, 2))
