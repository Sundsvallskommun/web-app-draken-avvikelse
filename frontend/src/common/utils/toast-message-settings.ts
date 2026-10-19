type ToastStatus = 'success' | 'error' | 'info' | 'warning';

interface ToastOverrides {
  duration?: number;
  position?: 'top' | 'bottom';
  closeable?: boolean;
}

const statusOverrides: Partial<Record<ToastStatus, ToastOverrides>> = {
  success: {
    duration: 2000,
    closeable: true,
    position: 'bottom',
  },
  error: {
    // No duration: an error stays until the snackbar retires it, rather than disappearing as
    // quickly as a success does. Matches how error toasts are raised throughout the app.
    closeable: false,
    position: 'bottom',
  },
  warning: {
    // A warning normally means the user has something left to do, so it can be dismissed.
    closeable: true,
    position: 'bottom',
  },
  info: {
    closeable: true,
    position: 'bottom',
  },
};

interface ToastInput {
  status: ToastStatus;
  message: string;
}

export function getToastOptions({ status, message }: ToastInput) {
  const overrides = statusOverrides[status] ?? {};
  return {
    status,
    message,
    ...overrides,
  };
}
