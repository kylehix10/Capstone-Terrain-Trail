import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./theme/ThemeContext";
import Layout from "./components/Layout";
import MapProvider from "./components/MapProvider";
import CreateTrail from "./pages/CreateTrail";
import Explore from "./pages/Explore";
import Settings from "./pages/Settings";
import Library from "./pages/Library";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import CompletedTrail from "./pages/CompletedTrail";
import { SnackbarProvider } from "./components/Snackbar";


function App() {
  return (
    <ThemeProvider>
      <SnackbarProvider>
      <Router>
        <Routes>
          {/* Public auth pages */}
          <Route path="/" element={<SignUp />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />

          {/* Main app shell under /app */}
          <Route path="/app" element={<Layout />}>
            {/* Map-loaded routes */}
            <Route element={<MapProvider />}>
              <Route index element={<Explore />} />
              <Route path="create" element={<CreateTrail />} />
              <Route path="explore" element={<Explore />} />
              <Route path="library" element={<Library />} />
              <Route path="completed/:id" element={<CompletedTrail />} />
            </Route>

            {/* Non-map route */}
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<div>Page not found</div>} />
        </Routes>
      </Router>
      </SnackbarProvider>
    </ThemeProvider>
  );
}


export default App;