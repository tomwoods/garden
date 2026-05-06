import dayjs from 'dayjs';
import i18n from './i18n';

export function formatDate(timestamp: number, format?: string): string {
  const fmt = format ?? i18n.t('dateTimeFormat', { ns: 'common' });
  return dayjs(timestamp).format(fmt);
}

export function formatRelativeTime(timestamp: number): string {
  return dayjs(timestamp).fromNow();
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(i18n.language).format(value);
}

export function formatFileSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(mb);
}
