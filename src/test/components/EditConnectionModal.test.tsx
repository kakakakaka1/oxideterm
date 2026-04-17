import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}));

vi.mock('@/components/ui/radio-group', () => ({
  RadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadioGroupItem: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type="radio" {...props} />,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}));

vi.mock('@/store/appStore', () => ({
  useAppStore: () => ({
    groups: [],
    loadGroups: vi.fn(),
  }),
}));

vi.mock('@/store/sessionTreeStore', () => ({
  useSessionTreeStore: () => ({
    connectNodeWithAncestors: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    markConnectionUsed: vi.fn(),
  },
}));

import { EditConnectionModal } from '@/components/modals/EditConnectionModal';

describe('EditConnectionModal', () => {
  it('allows submitting password auth with an explicitly empty password', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <EditConnectionModal
        open={true}
        onOpenChange={vi.fn()}
        action="connect"
        connection={{
          id: 'conn-1',
          name: 'Empty Password Host',
          host: 'example.com',
          port: 22,
          username: 'tester',
          auth_type: 'password',
        } as never}
        onSubmit={onSubmit}
      />,
    );

    const button = screen.getByRole('button', { name: 'modals.edit_connection.connect' });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        authType: 'password',
        password: '',
      }));
    });
  });
});