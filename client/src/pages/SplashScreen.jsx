import React from "react";
import { Link } from "react-router-dom";
import "./SplashScreen.css";
import horseshoeImage from "./horseshoe_now.jpg";

function SplashScreen() {
  return (
    <div className="splash-page">
      <header className="app-header splash-header">
        <img
          src="/img/colaCan.png"
          alt="Cola Trails logo"
          className="splash-logo"
        />

        <div className="splash-header-inner">
          <h1>Cola Trails</h1>
          <p>Explore, record, review, and share trails around USC</p>
        </div>
      </header>

      <main className="splash-main">
        <div className="splash-card">
          <div className="splash-left">
            <p className="splash-tag">Welcome to Cola Trails</p>

            <h2 className="splash-title">
              Discover trails that match your route, terrain, and style.
            </h2>

            <p className="splash-description">
              Cola Trail helps users explore, create, save, and review trails
              around campus. Find routes based on terrain and accessibility,
              share public trails with others, and keep your favorite paths all
              in one place.
            </p>

            <div className="splash-button-group">
              <Link to="/login" className="splash-button splash-button-primary">
                Log In
              </Link>

              <Link
                to="/signup"
                className="splash-button splash-button-secondary"
              >
                Sign Up
              </Link>
            </div>
          </div>

          <div className="splash-right">
            <img
              src={horseshoeImage}
              alt="The Horseshoe at USC"
              className="splash-image"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default SplashScreen;