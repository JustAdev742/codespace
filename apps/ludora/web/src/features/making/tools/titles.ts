/** The classroom tools' names, without importing the shared schema (the room screens stay small). Matches LESSON_TOOL_TITLES. */
export const TOOL_TITLES = { timer: 'Countdown', stopwatch: 'Stopwatch', picker: 'Random picker', groups: 'Team maker', checkin: 'Check-in', scoreboard: 'Scoreboard' } as const;
export type ToolKind = keyof typeof TOOL_TITLES;
