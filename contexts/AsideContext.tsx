'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { usePathname } from 'next/navigation';

type AsideContextType = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  content: ReactNode;
  setContent: (content: ReactNode) => void;
  title: string;
  setTitle: (title: string) => void;
};

const AsideContext = createContext<AsideContextType | null>(null);

export function AsideProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode>(null);
  const [title, setTitle] = useState('');
  const pathname = usePathname();

  // Clear aside when navigating to a new page
  useEffect(() => {
    setIsOpen(false);
    setContent(null);
    setTitle('');
  }, [pathname]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <AsideContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        content,
        setContent,
        title,
        setTitle,
      }}
    >
      {children}
    </AsideContext.Provider>
  );
}

export function useAside() {
  const context = useContext(AsideContext);
  if (!context) {
    throw new Error('useAside must be used within an AsideProvider');
  }
  return context;
}
