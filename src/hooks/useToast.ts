import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Toast, type ToastProps, type ToastAction } from '../components/Toast';

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const addToast = useCallback((
    type: 'success' | 'error' | 'warning',
    title: string,
    message?: string,
    duration?: number,
    action?: ToastAction
  ) => {
    const id = uuidv4();
    const newToast: ToastProps = {
      id,
      type,
      title,
      message,
      duration,
      action,
      onClose: removeToast
    };

    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const success = useCallback((title: string, message?: string, duration?: number, action?: ToastAction) => {
    return addToast('success', title, message, duration, action);
  }, [addToast]);

  const error = useCallback((title: string, message?: string, duration?: number, action?: ToastAction) => {
    return addToast('error', title, message, duration, action);
  }, [addToast]);

  const warning = useCallback((title: string, message?: string, duration?: number, action?: ToastAction) => {
    return addToast('warning', title, message, duration, action);
  }, [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning
  };
};