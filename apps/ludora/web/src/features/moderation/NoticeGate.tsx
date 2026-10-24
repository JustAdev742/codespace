import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/primitives.tsx';

interface Notice {
  id: number;
  action: 'warn' | 'mute' | 'unmute' | 'reset_name' | 'teacher_recovery_code';
  reason: string;
  until: string | null;
  createdAt: string;
}

const TITLES: Record<Notice['action'], string> = {
  warn: 'A message from Ludora\'s moderators',
  mute: 'Your account is muted for now',
  unmute: 'Your mute has been lifted',
  reset_name: 'Your display name was changed',
  teacher_recovery_code: 'Your teacher made you a new recovery code',
};

function body(n: Notice): string {
  const until = n.until ? new Date(n.until).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null;
  switch (n.action) {
    case 'mute':
      return `You cannot send reactions in games or change your name${until ? ` until ${until}` : ''}. You can still play.`;
    case 'reset_name':
      return 'A moderator replaced your display name with a neutral one. You can pick a new, friendly name in Settings.';
    case 'unmute':
      return 'Reactions and name changes are back on.';
    case 'teacher_recovery_code':
      // The reason names the teacher and the class.
      return `${n.reason} made a new recovery code for your account, so you can set a new password if you cannot sign in. Your old code no longer works. If you did not ask for this, tell your teacher.`;
    default:
      return 'Read it, and keep Ludora friendly for everyone.';
  }
}

/** Shows moderation notices (warnings, mutes, name resets), and a teacher's new recovery code, until the player dismisses each one. */
export function NoticeGate() {
  const me = useMe();
  const qc = useQueryClient();
  const signedIn = Boolean(me.data?.user);
  const notices = useQuery({ queryKey: ['notices'], queryFn: () => api.get<{ notices: Notice[] }>('/api/me/notices'), enabled: signedIn, staleTime: 60_000 });
  const [busy, setBusy] = useState(false);
  const current = notices.data?.notices[0];
  if (!current) return null;
  const dismiss = async () => {
    setBusy(true);
    try {
      await api.post(`/api/me/notices/${current.id}/ack`);
      await qc.invalidateQueries({ queryKey: ['notices'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      // Closing the dialog counts as reading it, so the close button never does nothing.
      onOpenChange={(v) => !v && !busy && void dismiss()}
      title={TITLES[current.action]}
      description={body(current)}
      footer={
        <Button variant="primary" onClick={() => void dismiss()} loading={busy}>
          I understand
        </Button>
      }
    >
      {/* A moderator's reason is quoted; the teacher and class are already in the text of a recovery code notice. */}
      {current.action !== 'unmute' && current.action !== 'teacher_recovery_code' ? (
        <blockquote className="rounded-[var(--radius-m)] border-l-4 border-lantern bg-surface-2 px-4 py-3 text-text whitespace-pre-wrap">{current.reason}</blockquote>
      ) : null}
    </Dialog>
  );
}
