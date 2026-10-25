export const products = [
  {
    slug:"sticker-shoyru-di-lam",
    name:"Bộ sticker Shoyru Đi Làm",
    description:"Bộ 6 hình Shoyru về những ngày vừa ham ăn vừa chăm làm, dùng trong tin nhắn và bài đăng.",
    price:39000,
    format:"Gói 6 tệp PNG chất lượng cao",
  },
] as const;

export type StoreProduct=(typeof products)[number];

export function findProduct(slug:string){return products.find(product=>product.slug===slug)}

export function storeReady(){
  return Boolean(process.env.BANK_BIN&&process.env.BANK_ACCOUNT_NO&&process.env.BANK_ACCOUNT_NAME&&process.env.PRODUCT_STICKER_URL&&process.env.SEPAY_API_KEY);
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
