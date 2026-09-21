// Retail barcodes are GTINs: 8, 12 (UPC-A), 13 (EAN-13) or 14 digits, the last
// being a check digit. Verifying it costs nothing and catches most misreads
// before they become a pointless upstream request.

/** True for a well-formed GTIN-8/12/13/14 with a correct check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  // From the right, weights alternate 3, 1, 3, 1 ...
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * One spelling per product. A 12-digit UPC-A and the same number with a
 * leading zero (EAN-13) are the same barcode; scanners report either.
 */
export function canonicalBarcode(code: string): string {
  return code.length === 12 ? `0${code}` : code;
}
