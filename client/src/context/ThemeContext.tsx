import React, { createContext, useContext, useEffect } from 'react';

interface ThemeContextType {
  accentClasses: {
    bg: string;
    hoverBg: string;
    text: string;
    border: string;
    shadow: string;
    gradient: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.setAttribute('data-theme', 'logixt');
    root.setAttribute('data-accent', 'blue');
    body.setAttribute('data-theme', 'logixt');
    body.setAttribute('data-accent', 'blue');
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        accentClasses: {
          bg: 'bg-slate-600',
          hoverBg: 'hover:bg-slate-500',
          text: 'text-slate-300',
          border: 'border-slate-500/40',
          shadow: 'shadow-slate-500/20',
          gradient: 'from-slate-600 to-slate-400'
        }
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe ser usado dentro de un ThemeProvider');
  }
  return context;
};
