import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import { ThemeProvider } from "./theme/ThemeContext";

import Layout from "./components/Layout";
import CreateTrail from "./pages/CreateTrail";
import Explore from "./pages/Explore";
import Settings from "./pages/Settings";
import Library from "./pages/Library";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import CompletedTrail from "./pages/CompletedTrail";

function App() {
  return (
    <ThemeProvider>
    <Router>
      <Routes>
        {/* Public auth pages */}
        <Route path="/" element={<SignUp />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />

        {/* Main app shell under /app */}
        <Route path="/app" element={<Layout />}>
          {/* default page when you visit /app */}
          <Route index element={<Explore />} />

          {/* sidebar pages */}
          <Route path="create" element={<CreateTrail />} />
          <Route path="explore" element={<Explore />} />
          <Route path="library" element={<Library />} />
          <Route path="settings" element={<Settings />} />
          <Route path="completed/:id" element={<CompletedTrail />} />
        </Route>

        {/*404 */}
        <Route path="*" element={<div>Page not found</div>} />
      </Routes>
    </Router>
    </ThemeProvider>
  );
}

export default App;