import React from "react";
import { Link } from "react-router-dom";
import "./SplashScreen.css";
import horseshoeImage from "./horseshoe_now.jpg";
import explorePageImage from "./explorepage.png";
import createPageImage from "./create.png";
import libraryPageImage from "./library.png";
import votePageImage from "./vote.png";

const teamMembers = [
  {
    name: "Madeleine McBride",
    linkedin: "https://www.linkedin.com/in/madeleine-mcbride/",
    personalSite: "https://mcmad1325.github.io/",
  },
  {
    name: "Gavin Orme",
    linkedin: "https://www.linkedin.com/in/gavin-orme-2863b8286/",
    personalSite: "",
  },
  {
    name: "Kyle Hix",
    linkedin: "https://www.linkedin.com/in/kyle-hix19/",
    personalSite: "",
  },
  {
    name: "Meet Patel",
    linkedin: "",
    personalSite: "",
  },
  {
    name: "Donovan Williams",
    linkedin: "",
    personalSite: "",
  },
];

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
        <section className="splash-card">
          <div className="splash-left">
            <p className="splash-tag">Built for getting around USC</p>

            <h2 className="splash-title">Find the best way around campus.</h2>

            <p className="splash-description">
              Cola Trails helps students discover, create, save, and share
              routes around USC. Users can explore public trails, compare route
              details like terrain and accessibility, save useful paths, and
              leave reviews to help others find the route that fits them best.
            </p>

            <div className="splash-feature-list">
              <div className="splash-feature-pill">Explore public trails</div>
              <div className="splash-feature-pill">Create your own routes</div>
              <div className="splash-feature-pill">Save and review favorites</div>
            </div>

            <div className="splash-button-group">
              <Link to="/login" className="splash-button splash-button-primary">
                Log In
              </Link>

              <Link
                to="/signup"
                className="splash-button splash-button-secondary"
              >
                Create Account
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
        </section>

        <section className="splash-info-card">
          <div className="splash-section-heading">
            <p className="splash-section-label">Final Demo</p>
            <h3>Video walkthrough</h3>
            <p>
              This is a placeholder for the final demo video. Replace the file
              later with your completed demo video and the same section will
              still work.
            </p>
          </div>

          <div className="splash-video-wrapper">
            <video
              className="splash-video"
              controls
              preload="metadata"
              poster="/img/colaCan.png"
            >
              <source
                src="/videos/final-demo-placeholder.mp4"
                type="video/mp4"
              />
              Your browser does not support the video tag.
            </video>
          </div>
        </section>

        <section className="splash-info-card splash-how-card">
          <div className="splash-section-heading">
            <p className="splash-section-label">How and why to use the app</p>
            <h3>Designed to make navigating USC easier</h3>
            <p>
              Cola Trails is for students who want a better way to get around
              campus. Instead of guessing which path is easiest, fastest, or
              most accessible, users can browse shared routes, compare trail
              details, and learn from other students&apos; experiences before
              choosing where to go.
            </p>
          </div>

          <div className="splash-steps-grid">
            <div className="splash-step-card">
              <div className="splash-step-image-wrapper">
                <img
                  src={explorePageImage}
                  alt="Explore page screenshot"
                  className="splash-step-image"
                />
              </div>
              <h4>1. Explore routes</h4>
              <p>
                Search public trails around USC and compare them by location,
                route type, terrain, and accessibility.
              </p>
            </div>

            <div className="splash-step-card">
              <div className="splash-step-image-wrapper">
                <img
                  src={createPageImage}
                  alt="Create page screenshot"
                  className="splash-step-image"
                />
              </div>
              <h4>2. Choose what fits you</h4>
              <p>
                Use trail details and reviews to find the route that best matches
                your needs and destination.
              </p>
            </div>

            <div className="splash-step-card">
              <div className="splash-step-image-wrapper">
                <img
                  src={libraryPageImage}
                  alt="Library page screenshot"
                  className="splash-step-image"
                />
              </div>
              <h4>3. Create and save</h4>
              <p>
                Build your own trails, save favorite routes, and keep useful
                paths organized in one place.
              </p>
            </div>

            <div className="splash-step-card">
              <div className="splash-step-image-wrapper">
                <img
                  src={votePageImage}
                  alt="Voting and review screenshot"
                  className="splash-step-image"
                />
              </div>
              <h4>4. Help other students</h4>
              <p>
                Leave reviews and share trails so other users can make better
                decisions about how they move across campus.
              </p>
            </div>
          </div>
        </section>

        <section className="splash-info-card">
          <div className="splash-section-heading">
            <p className="splash-section-label">About the team</p>
            <h3>Meet the developers behind Cola Trails</h3>
            <p>
              Cola Trails was built as a capstone project focused on improving
              campus navigation through shared route information, student
              reviews, and accessibility-aware trail exploration.
            </p>
          </div>

          <div className="splash-team-grid">
            {teamMembers.map((member) => (
              <div className="splash-team-card" key={member.name}>
                <h4>{member.name}</h4>

                {(member.linkedin || member.personalSite) && (
                  <div className="splash-team-links">
                    {member.linkedin && (
                      <a
                        href={member.linkedin}
                        target="_blank"
                        rel="noreferrer"
                        className="splash-team-link"
                      >
                        LinkedIn
                      </a>
                    )}

                    {member.personalSite && (
                      <a
                        href={member.personalSite}
                        target="_blank"
                        rel="noreferrer"
                        className="splash-team-link"
                      >
                        Personal Site
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="splash-repo-section">
            <p className="splash-repo-description">
              This link goes to the project repository for Cola Trails, where
              you can view the source code and development work for the app.
            </p>

            <div className="splash-repo-row">
              <a
                href="https://github.com/SCCapstone/Capstone-Terrain-Trail"
                target="_blank"
                rel="noreferrer"
                className="splash-button splash-button-tertiary"
              >
                View GitHub Repo
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default SplashScreen;