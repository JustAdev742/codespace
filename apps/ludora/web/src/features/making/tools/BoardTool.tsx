import type { LessonSlideTool } from '@ludora/shared';
import { CheckInTool, CountdownTool, GroupsTool, PickerTool, ScoreboardTool, StopwatchTool, type Person } from './Tools.tsx';

/*
 * A classroom tool as a step of a lesson: on the host's big screen, with the players in the room
 * as the class list. Nothing is remembered between lessons here (the class tools page does that).
 */
export default function BoardTool({ tool, people }: { tool: LessonSlideTool; people: Person[] }) {
  switch (tool.kind) {
    case 'timer':
      return <CountdownTool startMs={tool.seconds * 1000} />;
    case 'stopwatch':
      return <StopwatchTool />;
    case 'picker':
      return <PickerTool people={people} />;
    case 'groups':
      return <GroupsTool people={people} />;
    case 'checkin':
      return <CheckInTool size={people.length} />;
    case 'scoreboard':
      return <ScoreboardTool />;
  }
}
