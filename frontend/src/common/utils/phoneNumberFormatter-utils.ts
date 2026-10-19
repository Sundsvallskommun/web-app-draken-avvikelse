export function phoneNumberFormatter(phoneNumber: string | undefined): string {
  if (!phoneNumber) return '';

  let formatted = phoneNumber.trim().replaceAll('-', '').replaceAll(' ', '');

  formatted = formatted.replace(/^0{3,}/, '00');

  if (formatted.startsWith('00')) {
    return formatted.replace(/^00/, '+');
  }

  if (formatted.startsWith('0')) {
    return formatted.replace(/^0/, '+46');
  }

  return formatted;
}
