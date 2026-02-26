import React, {createContext, useContext, useEffect, useMemo, useState} from "react";

const ThemeContext = createContext(null);

export function ThemeProvider( { children }) {
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem("darkMode") === "1");

    useEffect(() => {
        localStorage.setItem("darkMode", darkMode ? "1" : "0" );
        document.documentElement.classList.toggle("dark", darkMode);
    }, [darkMode]);

    const value = useMemo(
        () => ({ darkMode, toggleDarkMode: () => setDarkMode((d) => !d) }),
        [darkMode]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}