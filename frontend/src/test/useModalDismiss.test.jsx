import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useModalDismiss } from '../hooks/useModalDismiss';

function TestModalComponent({ isOpen, onClose }) {
  useModalDismiss(isOpen, onClose);
  if (!isOpen) return null;
  return <div data-testid="modal-content">Modal Content</div>;
}

describe('useModalDismiss', () => {
  beforeEach(() => {
    document.body.style.overflow = 'visible';
  });

  it('locks body scroll when modal opens and restores on unmount/close', () => {
    const handleClose = vi.fn();
    const { rerender } = render(<TestModalComponent isOpen={true} onClose={handleClose} />);

    expect(document.body.style.overflow).toBe('hidden');

    rerender(<TestModalComponent isOpen={false} onClose={handleClose} />);
    expect(document.body.style.overflow).toBe('visible');
  });

  it('triggers onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(<TestModalComponent isOpen={true} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not trigger onClose when other keys are pressed', () => {
    const handleClose = vi.fn();
    render(<TestModalComponent isOpen={true} onClose={handleClose} />);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(handleClose).not.toHaveBeenCalled();
  });
});
