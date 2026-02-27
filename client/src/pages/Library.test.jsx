import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import Library from "./Library";

const LOCAL_STORAGE_KEY = "savedRoutes_v1";

let mockLoaderState = { isLoaded: true, loadError: null };
const mockRoute = jest.fn();
const mockMapInstance = {
  fitBounds: jest.fn(),
  panTo: jest.fn(),
  setZoom: jest.fn(),
};

jest.mock("@react-google-maps/api", () => {
  const React = require("react");
  return {
    useJsApiLoader: () => mockLoaderState,
    GoogleMap: ({ children, onLoad }) => {
      React.useEffect(() => {
        onLoad?.(mockMapInstance);
      }, [onLoad]);
      return <div data-testid="google-map">{children}</div>;
    },
    DirectionsRenderer: () => <div data-testid="directions-renderer" />,
  };
});

function buildDirectionsResult({ distance = "1 mi", duration = "10 mins", lat = 33.9, lng = -81.0 } = {}) {
  return {
    routes: [
      {
        legs: [
          {
            distance: { text: distance },
            duration: { text: duration },
            start_location: {
              lat: () => lat,
              lng: () => lng,
            },
          },
        ],
        bounds: { north: 1, south: 0, east: 1, west: 0 },
      },
    ],
  };
}

function seedRoutes(routes) {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(routes));
}

beforeEach(() => {
  window.localStorage.clear();
  mockLoaderState = { isLoaded: true, loadError: null };
  mockRoute.mockReset().mockResolvedValue(buildDirectionsResult());

  mockMapInstance.fitBounds.mockReset();
  mockMapInstance.panTo.mockReset();
  mockMapInstance.setZoom.mockReset();

  global.google = {
    maps: {
      DirectionsService: function DirectionsService() {
        this.route = mockRoute;
      },
      TravelMode: {
        WALKING: "WALKING",
        BICYCLING: "BICYCLING",
        DRIVING: "DRIVING",
      },
      UnitSystem: {
        IMPERIAL: "IMPERIAL",
      },
    },
  };
  global.window.google = global.google;

  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
});

afterEach(() => {
  delete global.google;
  delete global.window.google;
  jest.restoreAllMocks();
});

test("shows loading UI when maps script is not loaded", () => {
  mockLoaderState = { isLoaded: false, loadError: null };
  render(<Library />);
  expect(screen.getByText("Loading map...")).toBeInTheDocument();
});

test("shows load error UI when maps script fails", () => {
  mockLoaderState = { isLoaded: true, loadError: new Error("boom") };
  render(<Library />);
  expect(screen.getByText("Error loading Google Maps")).toBeInTheDocument();
});

test("shows empty state when no routes match", async () => {
  render(<Library />);
  expect(screen.getByText(/Saved Routes \(0\)/i)).toBeInTheDocument();
  expect(screen.getByText(/No routes match your search and filters\./i)).toBeInTheDocument();

  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Search saved routes..."), "anything");
  expect(screen.getByText(/No routes match your search and filters\./i)).toBeInTheDocument();
});

test("search and filters work together, and clear filters resets", async () => {
  const routes = [
    {
      id: "r1",
      title: "Walk Fast Short",
      origin: "Main St",
      destination: "Riverfront",
      distance: ".8 mi",
      duration: "19 mins",
      type: "?",
    },
    {
      id: "r2",
      title: "Bike Slow",
      origin: "Elm",
      destination: "Park",
      distance: "1.2 mi",
      duration: "25 mins",
      type: "??",
    },
    {
      id: "r3",
      title: "Walk Long",
      origin: "Oak",
      destination: "Museum",
      distance: "2.1 mi",
      duration: "30 mins",
      type: "?",
    },
  ];

  seedRoutes(routes);
  render(<Library />);
  const user = userEvent.setup();

  await user.type(screen.getByPlaceholderText("Search saved routes..."), "walk");
  expect(screen.getByText("Walk Fast Short ?")).toBeInTheDocument();
  expect(screen.getByText("Walk Long ?")).toBeInTheDocument();
  expect(screen.queryByText("Bike Slow ??")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.selectOptions(screen.getByLabelText("Route Type"), "?");
  await user.type(screen.getByLabelText("Max Distance (mi)"), "1");
  await user.type(screen.getByLabelText("Max Time (min)"), "20");

  expect(screen.getByRole("button", { name: "Hide Filters (3)" })).toBeInTheDocument();
  expect(screen.getByText("Walk Fast Short ?")).toBeInTheDocument();
  expect(screen.queryByText("Walk Long ?")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Clear Filters" }));
  expect(screen.getByRole("button", { name: "Hide Filters" })).toBeInTheDocument();
  expect(screen.getByText("Walk Fast Short ?")).toBeInTheDocument();
  expect(screen.getByText("Walk Long ?")).toBeInTheDocument();
});

test("load renders directions, sets stats, shows saved review, and recenter uses route origin", async () => {
  seedRoutes([
    {
      id: "route-1",
      title: "River Loop",
      origin: "A",
      destination: "B",
      distance: "0.8 mi",
      duration: "19 mins",
      type: "??",
      review: { stars: 4, terrain: 7, comment: "Smooth and shaded." },
    },
  ]);

  mockRoute.mockResolvedValueOnce(
    buildDirectionsResult({ distance: "2 mi", duration: "12 mins", lat: 34.1, lng: -81.2 })
  );

  render(<Library />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Load" }));

  await waitFor(() => {
    expect(screen.getByText(/Distance:/i)).toBeInTheDocument();
    expect(screen.getByText(/ETA:/i)).toBeInTheDocument();
  });

  expect(screen.getByTestId("directions-renderer")).toBeInTheDocument();
  expect(mockRoute).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: "A",
      destination: "B",
      unitSystem: "IMPERIAL",
    })
  );
  expect(mockMapInstance.fitBounds).toHaveBeenCalled();

  expect(screen.getByText("Saved Review")).toBeInTheDocument();
  expect(screen.getByText("4/5")).toBeInTheDocument();
  expect(screen.getByText(/Terrain:/i)).toBeInTheDocument();
  expect(screen.getByText("Smooth and shaded.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Recenter" }));
  expect(mockMapInstance.panTo).toHaveBeenCalledWith({ lat: 34.1, lng: -81.2 });
  expect(mockMapInstance.setZoom).toHaveBeenCalledWith(14);
});

test("load failure alerts and clears any stale review", async () => {
  seedRoutes([
    {
      id: "route-fail",
      title: "Broken Route",
      origin: "X",
      destination: "Y",
      distance: "1 mi",
      duration: "10 mins",
      type: "??",
      review: { stars: 5, terrain: 9, comment: "Old review" },
    },
  ]);

  mockRoute.mockRejectedValueOnce(new Error("network"));

  render(<Library />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Load" }));

  await waitFor(() => {
    expect(window.alert).toHaveBeenCalledWith("Could not load route.");
  });

  expect(screen.queryByTestId("directions-renderer")).not.toBeInTheDocument();
  expect(screen.getByText(/No review saved for this route\./i)).toBeInTheDocument();
});

test("delete route respects confirm and removes selected route state", async () => {
  seedRoutes([
    {
      id: "delete-me",
      title: "Delete target route",
      origin: "301 Main St",
      destination: "1523 Greene St",
      distance: ".8 mi",
      duration: "19 mins",
      type: "?",
      review: { stars: 3, terrain: 5, comment: "ok" },
    },
  ]);

  render(<Library />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByText("Saved Review");

  window.confirm = jest.fn(() => false);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(screen.getByText("Delete target route ?")).toBeInTheDocument();

  window.confirm = jest.fn(() => true);
  await user.click(screen.getByRole("button", { name: "Delete" }));

  await waitFor(() => {
    expect(screen.queryByText("Delete target route ?")).not.toBeInTheDocument();
  });
  expect(screen.queryByText("Saved Review")).not.toBeInTheDocument();
  expect(screen.queryByText(/Distance:/i)).not.toBeInTheDocument();
});

test("edit can be canceled and save validates required origin/destination", async () => {
  seedRoutes([
    {
      id: "edit-1",
      title: "Editable",
      origin: "Start",
      destination: "End",
      distance: "1 mi",
      duration: "10 mins",
      type: "?",
    },
  ]);

  render(<Library />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByDisplayValue("Editable")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByDisplayValue("Editable")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit" }));
  const originInput = screen.getByPlaceholderText("Origin");
  await user.clear(originInput);
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(window.alert).toHaveBeenCalledWith("Origin and destination are required.");
  expect(screen.getByPlaceholderText("Origin")).toBeInTheDocument();
});

test("save edit updates route card and persists to localStorage", async () => {
  seedRoutes([
    {
      id: "edit-2",
      title: "Old Title",
      origin: "Old Origin",
      destination: "Old Dest",
      distance: "1 mi",
      duration: "10 mins",
      type: "?",
    },
  ]);

  render(<Library />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Edit" }));

  const titleInput = screen.getByPlaceholderText("Route title");
  const originInput = screen.getByPlaceholderText("Origin");
  const destinationInput = screen.getByPlaceholderText("Destination");

  await user.clear(titleInput);
  await user.type(titleInput, "Updated Route");
  await user.clear(originInput);
  await user.type(originInput, "New Origin");
  await user.clear(destinationInput);
  await user.type(destinationInput, "New Destination");

  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(screen.getByText("Updated Route ?")).toBeInTheDocument();
  });

  const persisted = JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEY));
  expect(persisted[0]).toEqual(
    expect.objectContaining({
      id: "edit-2",
      title: "Updated Route",
      origin: "New Origin",
      destination: "New Destination",
    })
  );
});

test("saving an edited selected route reloads it", async () => {
  seedRoutes([
    {
      id: "edit-selected",
      title: "Reloadable",
      origin: "A",
      destination: "B",
      distance: "1 mi",
      duration: "10 mins",
      type: "??",
    },
  ]);

  render(<Library />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByText(/Distance:/i);

  await user.click(screen.getByRole("button", { name: "Edit" }));
  const destinationInput = screen.getByPlaceholderText("Destination");
  await user.clear(destinationInput);
  await user.type(destinationInput, "C");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(mockRoute).toHaveBeenCalledTimes(2);
  });
  expect(mockRoute).toHaveBeenLastCalledWith(
    expect.objectContaining({ destination: "C" })
  );
});
