import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import "./Snackbar.css";

const SnackbarContext = createContext(null);

export function SnackbarProvider({ children }) {
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    type: "info",
    actions: [],
  });

  const timerRef = useRef(null);

  const hideSnackbar = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, []);

  const showSnackbar = useCallback((message, type = "info", actions = [], duration = 3000) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setSnackbar({
      open: true,
      message,
      type,
      actions,
    });

    if (duration !== null) {
      timerRef.current = setTimeout(() => {
        setSnackbar((prev) => ({ ...prev, open: false }));
        timerRef.current = null;
      }, duration);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar, hideSnackbar }}>
      {children}

      {snackbar.open && (
        <div
          className={`snackbar snackbar-${snackbar.type}${
            snackbar.actions?.length ? " snackbar-has-actions" : ""
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="snackbar-content">
            <span className="snackbar-message">{snackbar.message}</span>

            <div className="snackbar-actions">
              {Array.isArray(snackbar.actions) &&
                snackbar.actions.map((action) => (
                  <button
                    key={action.label}
                    className={`snackbar-action-btn${
                      action.variant ? ` snackbar-action-${action.variant}` : ""
                    }`}
                    onClick={() => {
                      if (typeof action.onClick === "function") {
                        action.onClick();
                      }
                      if (action.closeOnClick !== false) {
                        hideSnackbar();
                      }
                    }}
                  >
                    {action.label}
                  </button>
                ))}
            </div>
          </div>

          <button className="snackbar-close" onClick={hideSnackbar} aria-label="Close notification">
            &times;
          </button>
        </div>
      )}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error("useSnackbar must be used inside SnackbarProvider");
  }
  return ctx;
}
