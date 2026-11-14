import { createContext, useContext } from 'react';

export const DrawerContext = createContext({ open: () => {}, close: () => {}, toggle: () => {} });
export const useDrawer = () => useContext(DrawerContext);
