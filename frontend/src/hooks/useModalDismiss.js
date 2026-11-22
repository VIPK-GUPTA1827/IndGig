import { useEffect } from 'react';

/**
 * Custom hook to manage modal accessibility:
 * 1. Closes the modal on Escape key press.
 * 2. Locks body scroll while the modal is open.
 *
 * @param {boolean} isOpen - Whether the modal is currently open.
 * @param {Function} onClose - Callback to close the modal.
 */
export function useModalDismiss(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);
}
