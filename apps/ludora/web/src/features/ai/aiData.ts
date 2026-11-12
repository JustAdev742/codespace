import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiAllowance, AiRunResponse, AiStatus } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';

/*
 * What the AI helpers need from the server: whether this person may use them
 * (and which), the models on offer, the allowance, and running one task. The
 * server decides all of it; this only avoids showing what would be refused.
 */

export const AI_STATUS_KEY = ['ai-status'] as const;

export function useAiStatus() {
  const me = useMe().data;
  const signedIn = Boolean(me?.user && !me.user.isGuest);
  return useQuery({
    queryKey: AI_STATUS_KEY,
    queryFn: () => api.get<AiStatus>('/api/ai/status'),
    enabled: signedIn,
    staleTime: 60_000,
    retry: false,
  });
}

/** Whether a helper may be shown: the server said this person may use this task. */
export function useAiTask(task: string): AiStatus | null {
  const status = useAiStatus().data;
  return status?.available && status.tasks.includes(task) ? status : null;
}

/* ---------------------- The model the person picked, remembered in this browser ---------------------- */

const MODEL_KEY = 'ludora.ai.model';
const FALLBACK_KEY = 'ludora.ai.fallback';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

export interface ModelChoice {
  model: string | null;
  fallback: boolean;
}

export function readModelChoice(): ModelChoice {
  return { model: read(MODEL_KEY), fallback: read(FALLBACK_KEY) !== 'no' };
}
export function saveModelChoice(c: ModelChoice) {
  if (c.model) write(MODEL_KEY, c.model);
  write(FALLBACK_KEY, c.fallback ? 'yes' : 'no');
}

/** The picked model if it is still on offer; otherwise none, and the server uses the first. */
export function chosenModel(status: Pick<AiStatus, 'models'>, choice: ModelChoice): string | undefined {
  return choice.model && status.models.some((m) => m.id === choice.model) ? choice.model : undefined;
}

/** Runs one task. Updates the allowance shown everywhere from the answer. */
export function useRunAiTask() {
  const qc = useQueryClient();
  return async <T>(task: string, input: unknown, choice: ModelChoice): Promise<AiRunResponse<T>> => {
    const status = qc.getQueryData<AiStatus>(AI_STATUS_KEY);
    const model = status ? chosenModel(status, choice) : undefined;
    try {
      const res = await api.post<AiRunResponse<T>>(`/api/ai/tasks/${task}`, {
        input,
        ...(model ? { model } : {}),
        fallback: choice.fallback,
      });
      qc.setQueryData<AiStatus>(AI_STATUS_KEY, (s) => (s ? { ...s, allowance: res.allowance } : s));
      return res;
    } catch (err) {
      // A refusal can mean the allowance ran out or a model was switched off: read the status again.
      void qc.invalidateQueries({ queryKey: AI_STATUS_KEY });
      throw err;
    }
  };
}

const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
});

/** "14 of 20 helper requests left. One more at 15:40." in plain words. */
export function allowanceText(a: AiAllowance): string {
  const left = a.remaining === 1 ? '1 helper request' : `${a.remaining} helper requests`;
  const more = a.nextAt ? ` One more at ${clock.format(new Date(a.nextAt))}.` : '';
  if (a.remaining <= 0) return `You have used your ${a.limit} helper requests for now.${more}`;
  return `${left} left of ${a.limit} every ${a.windowHours === 1 ? 'hour' : `${a.windowHours} hours`}.${more}`;
}
