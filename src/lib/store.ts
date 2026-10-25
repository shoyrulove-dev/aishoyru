export const products = [
  {
    slug:"sticker-shoyru-di-lam",
    name:"Bộ sticker Shoyru Đi Làm",
    description:"Bộ 6 hình Shoyru về những ngày vừa ham ăn vừa chăm làm, dùng trong tin nhắn và bài đăng.",
    price:39000,
    format:"Gói 6 tệp PNG chất lượng cao",
  },
  {
    slug:"moi-shoyru-mot-bua",
    name:"Mời Shoyru một bữa",
    description:"Khoản ủng hộ tự nguyện cho chi phí vận hành. Đây không phải quyên góp từ thiện và không kèm cam kết lợi ích.",
    price:20000,
    format:"Ủng hộ tự nguyện · có ghi nhận vào sổ công khai",
  },
] as const;

export type StoreProduct=(typeof products)[number];

export function findProduct(slug:string){return products.find(product=>product.slug===slug)}

function paymentReady(){
  return Boolean(process.env.BANK_BIN&&process.env.BANK_ACCOUNT_NO&&process.env.BANK_ACCOUNT_NAME&&process.env.SEPAY_API_KEY);
}

export function productReady(slug:string){
  if(!paymentReady())return false;
  if(slug==="moi-shoyru-mot-bua")return true;
  return Boolean(deliveryUrl(slug));
}

export function productPrepared(slug:string){return ["moi-shoyru-mot-bua","sticker-shoyru-di-lam"].includes(slug)}

export function affiliateOffers(){
 const offers=[
  {name:process.env.AFFILIATE_1_NAME||"PureStore · công cụ số cho người sáng tạo",url:process.env.AFFILIATE_1_URL||"https://shop.blissbiovn.com/",commission:"20% trên đơn mua thật"},
  {name:process.env.AFFILIATE_2_NAME,url:process.env.AFFILIATE_2_URL,commission:"Hoa hồng theo chương trình đối tác"},
 ];
 return offers.filter((offer):offer is {name:string;url:string;commission:string}=>Boolean(offer.name&&offer.url));
}

export function deliveryUrl(slug:string){
  if(slug==="sticker-shoyru-di-lam")return process.env.PRODUCT_STICKER_URL||"";
  return "";
}

export function createQrUrl(amount:number,orderCode:string){
  const bin=process.env.BANK_BIN;
  const account=process.env.BANK_ACCOUNT_NO;
  const name=process.env.BANK_ACCOUNT_NAME;
  if(!bin||!account||!name)return "";
  const query=new URLSearchParams({amount:String(amount),addInfo:orderCode,accountName:name});
  return `https://img.vietqr.io/image/${encodeURIComponent(bin)}-${encodeURIComponent(account)}-compact2.png?${query}`;
}
