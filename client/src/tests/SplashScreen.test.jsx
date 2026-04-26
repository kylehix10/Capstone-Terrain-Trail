// SplashScreen.test.jsx
// Unit and behavioral tests for the SplashScreen page.

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import SplashScreen from "../pages/SplashScreen";

function renderSplashScreen() {
  render(
    <MemoryRouter>
      <SplashScreen />
    </MemoryRouter>
  );
}

test("unit test: renders the SplashScreen page title and description", () => {
  renderSplashScreen();

  expect(screen.getByText("Cola Trails")).toBeInTheDocument();
  expect(
    screen.getByText(/Explore, record, review, and share trails around USC/i)
  ).toBeInTheDocument();
});

test("unit test: renders the main splash screen sections", () => {
  renderSplashScreen();

  expect(screen.getByText(/Final Demo/i)).toBeInTheDocument();
  expect(screen.getByText(/How and why to use the app/i)).toBeInTheDocument();
  expect(screen.getByText(/About the team/i)).toBeInTheDocument();
});

test("unit test: renders the login and create account links", () => {
  renderSplashScreen();

  expect(screen.getByRole("link", { name: /log in/i })).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /create account/i })
  ).toBeInTheDocument();
});

test("behavioral test: Log In link points to the login page", () => {
  renderSplashScreen();

  const loginLink = screen.getByRole("link", { name: /log in/i });

  expect(loginLink).toHaveAttribute("href", "/login");
});

test("behavioral test: Create Account link points to the signup page", () => {
  renderSplashScreen();

  const createAccountLink = screen.getByRole("link", {
    name: /create account/i,
  });

  expect(createAccountLink).toHaveAttribute("href", "/signup");
});

test("unit test: renders the GitHub repository link", () => {
  renderSplashScreen();

  const repoLink = screen.getByRole("link", { name: /view github repo/i });

  expect(repoLink).toBeInTheDocument();
  expect(repoLink).toHaveAttribute(
    "href",
    "https://github.com/SCCapstone/Capstone-Terrain-Trail"
  );
});