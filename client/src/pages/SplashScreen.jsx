import React from "react";
import { Link } from "react-router-dom";

function SplashScreen() {
  return (
    <main className="splash-page">
      <section className="splash-hero">
        <div className="splash-hero-content">
          <p className="splash-eyebrow">Terrain Trail</p>

          <h1>Find better routes around campus.</h1>

          <p className="splash-hero-text">
            Terrain Trail helps students discover, create, save, and review
            accessible campus routes based on terrain, travel method, and
            student feedback.
          </p>

          <div className="splash-hero-actions">
            <Link to="/signup" className="splash-primary-button">
              Get Started
            </Link>

            <Link to="/login" className="splash-secondary-button">
              Log In
            </Link>
          </div>
        </div>
      </section>

      <section className="splash-info-card">
        <div className="splash-section-heading">
          <p className="splash-section-label">Project Goal</p>
          <h2>Making campus navigation easier</h2>
          <p>
            Students often run into unexpected obstacles while navigating
            campus, including steep hills, rough terrain, construction, stairs,
            and routes that are not ideal for their transportation needs.
            Terrain Trail gives students a way to share useful route
            information and make smarter navigation choices.
          </p>
        </div>
      </section>

      <section className="splash-info-card">
        <div className="splash-section-heading">
          <p className="splash-section-label">Final Demo</p>
          <h3>Video walkthrough</h3>
          <p>
            Watch our final demo video to see how Terrain Trail helps students
            find, create, save, and review accessible routes around campus.
          </p>
        </div>

        <div className="splash-video-wrapper">
          <iframe
            className="splash-video"
            src="https://www.youtube.com/embed/ySdk2vFVs8E"
            title="Terrain Trail Final Demo Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          ></iframe>
        </div>
      </section>

      <section className="splash-info-card splash-how-card">
        <div className="splash-section-heading">
          <p className="splash-section-label">How and why to use the app</p>
          <h3>Designed to make navigating USC easier</h3>
          <p>
            Terrain Trail gives students a place to explore existing routes,
            create new routes, save helpful routes, and vote on routes that
            worked well for them.
          </p>
        </div>

        <div className="splash-feature-grid">
          <article className="splash-feature-card">
            <div className="splash-feature-text">
              <p className="splash-feature-number">01</p>
              <h4>Explore routes</h4>
              <p>
                View public campus routes and filter by travel method to find
                paths that fit your needs.
              </p>
            </div>
            <img
              src="/pages/explorepage.png"
              alt="Explore page showing available campus routes"
              className="splash-feature-image"
            />
          </article>

          <article className="splash-feature-card">
            <div className="splash-feature-text">
              <p className="splash-feature-number">02</p>
              <h4>Create a route</h4>
              <p>
                Add your own route by selecting points on the map and saving
                useful details for other students.
              </p>
            </div>
            <img
              src="/pages/create.png"
              alt="Create route page showing route creation tools"
              className="splash-feature-image"
            />
          </article>

          <article className="splash-feature-card">
            <div className="splash-feature-text">
              <p className="splash-feature-number">03</p>
              <h4>Save routes</h4>
              <p>
                Keep track of routes you use often so you can return to them
                later from your library.
              </p>
            </div>
            <img
              src="/pages/library.png"
              alt="Library page showing saved routes"
              className="splash-feature-image"
            />
          </article>

          <article className="splash-feature-card">
            <div className="splash-feature-text">
              <p className="splash-feature-number">04</p>
              <h4>Vote and review</h4>
              <p>
                Upvote, downvote, and review public routes so students can see
                which paths are most useful.
              </p>
            </div>
            <img
              src="/pages/vote.png"
              alt="Voting feature on public routes"
              className="splash-feature-image"
            />
          </article>
        </div>
      </section>

      <section className="splash-info-card">
        <div className="splash-section-heading">
          <p className="splash-section-label">Repository</p>
          <h3>Project source code</h3>
          <p>
            The link below opens the GitHub repository for the Terrain Trail
            project.
          </p>
        </div>

        <a
          className="splash-repo-link"
          href="https://github.com/SCCapstone/Capstone-Terrain-Trail"
          target="_blank"
          rel="noreferrer"
        >
          View the Terrain Trail GitHub Repository
        </a>
      </section>
    </main>
  );
}

export default SplashScreen;