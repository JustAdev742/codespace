import { createContext, useContext } from 'react';

/** Whether the game connection is up. Answer controls wait while it is down, rather than letting taps vanish. */
export const Online = createContext(true);
export const useOnline = () => useContext(Online);
