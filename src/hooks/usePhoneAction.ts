export type PhoneAction = 'whatsapp' | 'sms' | 'call';

const STORAGE_KEY = 'phone_action';
const DEFAULT: PhoneAction = 'whatsapp';

export function getPhoneAction(): PhoneAction {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'whatsapp' || stored === 'sms' || stored === 'call') return stored;
  return DEFAULT;
}

export function setPhoneAction(action: PhoneAction): void {
  localStorage.setItem(STORAGE_KEY, action);
}

export function getPhoneHref(phone: string, action: PhoneAction): string {
  const digitsOnly = phone.replace(/\D/g, '');
  switch (action) {
    case 'whatsapp':
      return `https://wa.me/${digitsOnly}`;
    case 'sms':
      return `sms:${phone}`;
    case 'call':
      return `tel:${phone}`;
  }
}
