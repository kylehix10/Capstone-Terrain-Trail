// Login.test.jsx
// Unit and behavioral tests for the Login page.

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Login from "../pages/Login";

// Mock navigation so the test does not need the full router setup.
const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  mockNavigate.mockClear();
  global.fetch = jest.fn();
  localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("unit test: renders the Login page", () => {
  render(<Login />);

  expect(screen.getByText("LOG IN")).toBeInTheDocument();
  expect(screen.getByText("Login")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
});

test("unit test: renders main buttons", () => {
  render(<Login />);

  expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /show/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
});

test("behavioral test: user can type email and password", () => {
  render(<Login />);

  const emailInput = screen.getByPlaceholderText("Email");
  const passwordInput = screen.getByPlaceholderText("Password");

  fireEvent.change(emailInput, {
    target: { value: "student@email.com" },
  });

  fireEvent.change(passwordInput, {
    target: { value: "password123" },
  });

  expect(emailInput).toHaveValue("student@email.com");
  expect(passwordInput).toHaveValue("password123");
});

test("behavioral test: clicking Show changes password input to text", () => {
  render(<Login />);

  const passwordInput = screen.getByPlaceholderText("Password");
  const showButton = screen.getByRole("button", { name: /show/i });

  expect(passwordInput).toHaveAttribute("type", "password");

  fireEvent.click(showButton);

  expect(passwordInput).toHaveAttribute("type", "text");
  expect(screen.getByRole("button", { name: /hide/i })).toBeInTheDocument();
});

test("behavioral test: clicking Sign Up navigates to signup page", () => {
  render(<Login />);

  const signUpButton = screen.getByRole("button", { name: /sign up/i });

  fireEvent.click(signUpButton);

  expect(mockNavigate).toHaveBeenCalledWith("/signup");
});

test("behavioral test: submitting empty form shows required message", () => {
  render(<Login />);

  const loginButton = screen.getByRole("button", { name: /log in/i });

  fireEvent.click(loginButton);

  expect(
    screen.getByText("Email and password are required.")
  ).toBeInTheDocument();
});

test("behavioral test: successful login saves token and navigates to explore page", async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      token: "fake-test-token",
    }),
  });

  render(<Login />);

  fireEvent.change(screen.getByPlaceholderText("Email"), {
    target: { value: "student@email.com" },
  });

  fireEvent.change(screen.getByPlaceholderText("Password"), {
    target: { value: "password123" },
  });

  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() => {
    expect(localStorage.getItem("token")).toBe("fake-test-token");
    expect(mockNavigate).toHaveBeenCalledWith("/app/explore");
  });
});

test("behavioral test: failed login shows error message", async () => {
  global.fetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({
      message: "Invalid email or password",
    }),
  });

  render(<Login />);

  fireEvent.change(screen.getByPlaceholderText("Email"), {
    target: { value: "wrong@email.com" },
  });

  fireEvent.change(screen.getByPlaceholderText("Password"), {
    target: { value: "wrongpassword" },
  });

  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() => {
    expect(screen.getByText("Invalid email or password")).toBeInTheDocument();
  });
});