import React, { createContext, useContext, useState, useCallback } from "react";

const SnackbarContext = createContext();

export function SnackbarProvider({ children }) {
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    type: "info",
  });

  const showSnackbar = useCallback((message, type = "info") => {
    setSnackbar({ open: true, message, type });

    setTimeout(() => {
      setSnackbar((prev) => ({ ...prev, open: false }));
    }, 3000);
  }, []);

  const hideSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}

      {/* Snackbar UI lives HERE */}
      {snackbar.open && (
        <div
          className={`snackbar snackbar-${snackbar.type}`}
          role="status"
          aria-live="polite"
        >
          <span>{snackbar.message}</span>
          <button onClick={hideSnackbar}>×</button>
        </div>
      )}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  return useContext(SnackbarContext);
}