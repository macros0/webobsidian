import { create } from 'zustand';

/**
 * In-app replacement for window.confirm(). Native dialogs are blocked or silently
 * auto-cancelled in embedded/preview browsers (the click then appears to do nothing),
 * so destructive actions use this promise-based dialog instead. Rendered by ConfirmDialog.
 */
export interface ConfirmRequest {
  message: string;
  /** Optional secondary line (e.g. a warning about what else is affected). */
  detail?: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

export const useConfirm = create<{ req: ConfirmRequest | null }>(() => ({ req: null }));

export function confirmDialog(
  message: string,
  opts: { confirmLabel?: string; danger?: boolean; detail?: string } = {},
): Promise<boolean> {
  // A second request while one is open cancels the first.
  useConfirm.getState().req?.resolve(false);
  return new Promise<boolean>((resolve) => {
    useConfirm.setState({
      req: {
        message,
        detail: opts.detail,
        confirmLabel: opts.confirmLabel ?? 'OK',
        danger: opts.danger ?? false,
        resolve: (ok) => {
          useConfirm.setState({ req: null });
          resolve(ok);
        },
      },
    });
  });
}
