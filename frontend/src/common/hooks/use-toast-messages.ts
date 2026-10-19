import { getToastOptions } from '@common/utils/toast-message-settings';
import { useSnackbar } from '@sk-web-gui/react';
import { useMemo } from 'react';

/**
 * Toast helpers that route every message through getToastOptions, so position, duration and
 * dismissability are decided in one place instead of being repeated at each call site.
 */
export function useToastMessages() {
  const toastMessage = useSnackbar();

  return useMemo(
    () => ({
      showSuccess: (message: string) => toastMessage(getToastOptions({ message, status: 'success' })),
      showError: (message: string) => toastMessage(getToastOptions({ message, status: 'error' })),
      showWarning: (message: string) => toastMessage(getToastOptions({ message, status: 'warning' })),
      showInfo: (message: string) => toastMessage(getToastOptions({ message, status: 'info' })),
    }),
    [toastMessage]
  );
}
