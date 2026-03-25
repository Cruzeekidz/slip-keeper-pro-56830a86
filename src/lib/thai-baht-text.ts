const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

const intToText = (n: number): string => {
  if (n === 0) return "";
  if (n > 9999999) {
    const millions = Math.floor(n / 1000000);
    const remainder = n % 1000000;
    return intToText(millions) + "ล้าน" + intToText(remainder);
  }
  const s = String(n);
  let result = "";
  for (let i = 0; i < s.length; i++) {
    const d = parseInt(s[i]);
    const pos = s.length - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && s.length > 1) { result += "เอ็ด"; continue; }
    if (pos === 1 && d === 1) { result += "สิบ"; continue; }
    if (pos === 1 && d === 2) { result += "ยี่สิบ"; continue; }
    result += DIGITS[d] + POSITIONS[pos];
  }
  return result;
};

export const numberToThaiText = (num: number): string => {
  if (num === 0) return "ศูนย์บาทถ้วน";
  const intPart = Math.floor(Math.abs(num));
  const decPart = Math.round((Math.abs(num) - intPart) * 100);

  let text = intToText(intPart) + "บาท";
  if (decPart > 0) {
    text += intToText(decPart) + "สตางค์";
  } else {
    text += "ถ้วน";
  }
  return text;
};
