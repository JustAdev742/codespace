import type { ReactNode } from 'react';
import { BookOpen, Brush, ClipboardList, Gamepad2, Hammer, ListOrdered, Palette, School, Sparkles, Timer, Wand2 } from 'lucide-react';

/*
 * Everything a person can make, for the Make page (/make). One entry each: its title, one line
 * of what it is, an icon, where it starts, and who can use it. The server still decides whether
 * an account may make each thing; `who` only keeps the page from offering what would be refused.
 *
 * Adding a new kind of thing to make is one line here.
 */

export type MakeWho = 'signedIn' | 'teacher' | { permission: string };

export interface MakeEntry {
  id: string;
  title: string;
  text: string;
  icon: ReactNode;
  /** Where making it starts. */
  to: string;
  who: MakeWho;
  /** Groups the list: things to play, and things for running a class. */
  group: 'play' | 'class';
}

const icon = (node: ReactNode) => node;

export const MAKE_REGISTRY: MakeEntry[] = [
  { id: 'quick', title: 'A set from your notes', text: 'Paste notes, a word list or a table. Questions come back for you to keep or change.', icon: icon(<Sparkles className="size-6" />), to: '/make/quick', who: 'signedIn', group: 'play' },
  { id: 'set', title: 'A question set', text: 'Write questions one by one, use quick add, or import a spreadsheet.', icon: icon(<BookOpen className="size-6" />), to: '/sets/new', who: 'signedIn', group: 'play' },
  { id: 'game', title: 'A saved game', text: 'A mode, its settings and a set, ready to host again or share.', icon: icon(<Wand2 className="size-6" />), to: '/games', who: 'signedIn', group: 'play' },
  { id: 'mode', title: 'A game mode', text: 'Design how a game works and looks, in 2D or 3D, and test it against bots as you build.', icon: icon(<Hammer className="size-6" />), to: '/mode-studio', who: 'signedIn', group: 'play' },
  { id: 'design', title: 'Your own Glim', text: 'Shape, colour and paint a Glim and things for it to wear. Free, and yours alone.', icon: icon(<Brush className="size-6" />), to: '/designs', who: 'signedIn', group: 'play' },
  { id: 'glim', title: 'A Glim for the shop', text: 'Design characters and items for everyone, in the Creator Studio.', icon: icon(<Palette className="size-6" />), to: '/studio', who: { permission: 'studio.use' }, group: 'play' },
  { id: 'lesson', title: 'A lesson', text: 'Games, slides, discussions and classroom tools in order, in one room.', icon: icon(<ListOrdered className="size-6" />), to: '/lessons', who: 'teacher', group: 'class' },
  { id: 'class', title: 'A class', text: 'Students join with a code. No email addresses needed.', icon: icon(<School className="size-6" />), to: '/classes?new=1', who: 'teacher', group: 'class' },
  { id: 'homework', title: 'Homework', text: 'A game students play on their own, with a report for you.', icon: icon(<ClipboardList className="size-6" />), to: '/make/organise?tab=homework', who: 'teacher', group: 'class' },
  { id: 'tools', title: 'Classroom tools', text: 'A fair picker, groups, a timer, a check-in and a scoreboard for the big screen.', icon: icon(<Timer className="size-6" />), to: '/classes', who: 'teacher', group: 'class' },
  { id: 'play', title: 'A game to play now', text: 'Pick a set and a mode and put the code on the board.', icon: icon(<Gamepad2 className="size-6" />), to: '/host', who: 'signedIn', group: 'play' },
];

export function canMake(who: MakeWho, me: { accountType?: string; signedIn: boolean; permissions: readonly string[] }): boolean {
  if (!me.signedIn) return false;
  if (who === 'signedIn') return true;
  if (who === 'teacher') return me.accountType === 'teacher';
  return me.permissions.includes(who.permission);
}
