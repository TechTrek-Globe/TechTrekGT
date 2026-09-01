/**
 * SKU Generation Utility for TechTrek Outpost
 * Generates unique, structured, human-readable SKUs formatted as OP-YYMMDD-XXXX
 * (e.g. OP-260901-A4F2)
 */

export function generateSku(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  
  // 4-character random alphanumeric suffix (avoiding confusing chars like O/0, I/1)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `OP-${yy}${mm}${dd}-${rand}`;
}
