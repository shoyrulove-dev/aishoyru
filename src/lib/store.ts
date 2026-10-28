export const products = [
  {
    slug: "bo-khoi-tao-ai-shoyru",
    name: "Bộ khởi tạo AI sinh tồn Shoyru",
    description:
      "Quy trình từng bước để dựng một nhân vật AI có trí nhớ, lịch làm việc, nhật ký công khai, cửa hàng số và thanh toán tự động. Tặng kèm bộ 6 sticker Shoyru PNG.",
    price: 79000,
    format: "Bộ thực hành 12 bước + file mẫu + quà tặng 6 sticker PNG",
  },
  {
    slug: "moi-shoyru-mot-bua",
    name: "Mời Shoyru một bữa",
    description:
      "Khoản ủng hộ tự nguyện cho chi phí vận hành. Đây không phải quyên góp từ thiện và không kèm cam kết lợi ích.",
    price: 20000,
    format: "Ủng hộ tự nguyện · có ghi nhận vào sổ công khai",
  },
] as const;

const legacyProducts = [
  {
    slug: "sticker-shoyru-di-lam",
    name: "Bộ sticker Shoyru Đi Làm",
    description: "Quà tặng kèm Bộ khởi tạo AI sinh tồn; không bán riêng.",
    price: 39000,
    format: "Gói 6 tệp PNG chất lượng cao",
  },
] as const;

const allProducts = [...products, ...legacyProducts] as const;
export type StoreProduct = (typeof allProducts)[number];

export function findProduct(slug: string) {
  return allProducts.find((product) => product.slug === slug);
}

function paymentReady() {
  return Boolean(
    process.env.BANK_BIN &&
    process.env.BANK_ACCOUNT_NO &&
    process.env.BANK_ACCOUNT_NAME &&
    process.env.SEPAY_API_KEY,
  );
}

export function productReady(slug: string) {
  if (!paymentReady()) return false;
  if (slug === "moi-shoyru-mot-bua") return true;
  if (slug === "bo-khoi-tao-ai-shoyru")
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || deliveryUrl(slug));
}

export function productPrepared(slug: string) {
  return [
    "moi-shoyru-mot-bua",
    "sticker-shoyru-di-lam",
    "bo-khoi-tao-ai-shoyru",
  ].includes(slug);
}

export function affiliateOffers() {
  const offers = [
    {
      name:
        process.env.AFFILIATE_1_NAME ||
        "PureStore · công cụ số cho người sáng tạo",
      url: process.env.AFFILIATE_1_URL || "https://shop.blissbiovn.com/",
      commission: "20% trên đơn mua thật",
    },
    {
      name: process.env.AFFILIATE_2_NAME,
      url: process.env.AFFILIATE_2_URL,
      commission: "Hoa hồng theo chương trình đối tác",
    },
  ];
  return offers.filter(
    (offer): offer is { name: string; url: string; commission: string } =>
      Boolean(offer.name && offer.url),
  );
}

export function deliveryUrl(slug: string) {
  if (slug === "sticker-shoyru-di-lam")
    return process.env.PRODUCT_STICKER_URL || "";
  return "";
}

export function createQrUrl(amount: number, orderCode: string) {
  const bin = process.env.BANK_BIN;
  const account = process.env.BANK_ACCOUNT_NO;
  const name = process.env.BANK_ACCOUNT_NAME;
  if (!bin || !account || !name) return "";
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo: orderCode,
  });
  return `https://img.vietqr.io/image/${encodeURIComponent(bin)}-${encodeURIComponent(account)}-qr_only.png?${query}`;
}
