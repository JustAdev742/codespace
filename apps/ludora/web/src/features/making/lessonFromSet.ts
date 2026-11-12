import type { LessonBody, LessonStep } from '@ludora/shared';
import { api } from '../../lib/api.ts';

/** Every game step still waiting for a set gets this one. Pure. */
export function fillSet(steps: readonly LessonStep[], setId: string): LessonStep[] {
  return steps.map((s) => (s.kind === 'game' && !s.setId ? { ...s, setId } : s));
}

/**
 * A lesson from a set in one press: the starter, main and exit ticket template with the set in
 * each of its games, named after the set. Three ordinary lesson requests; the server checks each.
 */
export async function lessonFromSet(setId: string, setTitle: string): Promise<string> {
  const { id } = await api.post<{ id: string }>('/api/lessons', { template: 'starter-main-exit', title: `Lesson: ${setTitle}`.slice(0, 80) });
  const { lesson } = await api.get<{ lesson: LessonBody & { id: string } }>(`/api/lessons/${id}`);
  await api.put(`/api/lessons/${id}`, { title: lesson.title, goals: lesson.goals, standings: lesson.standings, steps: fillSet(lesson.steps, setId) });
  return id;
}
