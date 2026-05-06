import 'i18next';
import type common from '../../public/locales/en/common.json';
import type garden from '../../public/locales/en/garden.json';
import type modals from '../../public/locales/en/modals.json';
import type settings from '../../public/locales/en/settings.json';
import type notifications from '../../public/locales/en/notifications.json';
import type harvest from '../../public/locales/en/harvest.json';
import type onboarding from '../../public/locales/en/onboarding.json';
import type garden_shared from '../../public/locales/en/garden_shared.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      garden: typeof garden;
      modals: typeof modals;
      settings: typeof settings;
      notifications: typeof notifications;
      harvest: typeof harvest;
      onboarding: typeof onboarding;
      garden_shared: typeof garden_shared;
    };
  }
}
