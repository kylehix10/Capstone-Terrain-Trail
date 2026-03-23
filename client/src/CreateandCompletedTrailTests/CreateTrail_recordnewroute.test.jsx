// npm install react-router-dom@6  version needed to run
// to run:  npm test -- CreateTrail_recordnewroute.test.jsx  in client folder


import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreateTrail from "../pages/CreateTrail";

const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock("@react-google-maps/api", () => ({
  useJsApiLoader: () => ({ isLoaded: true, loadError: null }),
  GoogleMap: ({ children }) => <div data-testid="google-map">{children}</div>,
  DirectionsRenderer: () => null,
  Polyline: () => null,
  Marker: () => null,
}));

describe("CreateTrail - Record New Route", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    localStorage.clear();

    global.google = {
      maps: {
        MapTypeId: { ROADMAP: "ROADMAP", TERRAIN: "TERRAIN" },
        UnitSystem: { IMPERIAL: "IMPERIAL" },
        TravelMode: {
          DRIVING: "DRIVING",
          BICYCLING: "BICYCLING",
          WALKING: "WALKING",
        },
        Size: function Size(width, height) {
          this.width = width;
          this.height = height;
        },
        Geocoder: jest.fn(() => ({
          geocode: jest.fn(),
        })),
        DirectionsService: jest.fn(() => ({
          route: jest.fn(),
        })),
        places: {
          Autocomplete: jest.fn(() => ({
            addListener: jest.fn(),
            getPlace: jest.fn(() => ({})),
          })),
        },
      },
    };

    Object.defineProperty(window.navigator, "geolocation", {
      value: {
        getCurrentPosition: jest.fn((success) => {
          success({
            coords: {
              latitude: 34.0001,
              longitude: -81.0001,
            },
          });
        }),
        watchPosition: jest.fn(() => 1),
        clearWatch: jest.fn(),
      },
      configurable: true,
    });
  });

  // if the user fills in an origin and clicks Record New Route, 
  // the app should start tracking their GPS location and show a Stop button
  it("starts GPS tracking when Record New Route is clicked", async () => {
  render(<CreateTrail />);

  // Fill in the origin field first
  fireEvent.change(screen.getByPlaceholderText("Origin"), {
    target: { value: "Columbia, SC" },
  });

  fireEvent.click(screen.getByRole("button", { name: /record new route/i }));

  await waitFor(() => {
    expect(window.navigator.geolocation.watchPosition).toHaveBeenCalled();
  });

  expect(screen.getByRole("button", { name: /^Stop$/i })).toBeInTheDocument();
  });


  // pretends to be a user who walked around, 
  // then stopped recording, and verified the app correctly 
  // tracked and then stopped tracking their location.
  it("tracks user location and stops recording when Stop is clicked", async () => {
  render(<CreateTrail />);

  // Fill in origin first
  fireEvent.change(screen.getByPlaceholderText("Origin"), {
    target: { value: "Columbia, SC" },
  });

  // Start recording
  fireEvent.click(screen.getByRole("button", { name: /record new route/i }));

  // Simulate GPS giving a first location
  const watchCallback = window.navigator.geolocation.watchPosition.mock.calls[0][0];
  watchCallback({ coords: { latitude: 34.0001, longitude: -81.0001 } });

  // Simulate GPS giving a second location (user moved)
  watchCallback({ coords: { latitude: 34.0050, longitude: -81.0050 } });

  // Simulate GPS giving a third location (user moved again)
  watchCallback({ coords: { latitude: 34.0100, longitude: -81.0100 } });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^Stop$/i })).toBeInTheDocument();
  });

  // Click stop
  fireEvent.click(screen.getByRole("button", { name: /^Stop$/i }));

  // GPS tracking should have been cleared
  await waitFor(() => {
    expect(window.navigator.geolocation.clearWatch).toHaveBeenCalled();
  });

  // Stop button should be gone
  expect(screen.queryByRole("button", { name: /^Stop$/i })).not.toBeInTheDocument();
  });

});