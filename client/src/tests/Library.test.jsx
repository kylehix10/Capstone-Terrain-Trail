import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import Library from "../pages/Library";
import { SnackbarProvider } from "../components/Snackbar";

jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => jest.fn(),
    useLocation: () => ({ state: null }),
  }),
  { virtual: true }
);

jest.mock("../theme/ThemeContext.js", () => ({
  useTheme: () => ({ darkMode: false }),
}));

let mockRoute = jest.fn();
const mockMapInstance = {
  fitBounds: jest.fn(),
  panTo: jest.fn(),
  setZoom: jest.fn(),
};

jest.mock("@react-google-maps/api", () => {
  const React = require("react");
  return {
    GoogleMap: ({ children, onLoad }) => {
      React.useEffect(() => {
        onLoad?.(mockMapInstance);
      }, [onLoad]);
      return <div data-testid="google-map">{children}</div>;
    },
    DirectionsRenderer: () => <div data-testid="directions-renderer" />,
    Marker: () => <div data-testid="map-marker" />,
    Polyline: () => <div data-testid="map-polyline" />,
  };
});

function buildDirectionsResult({
  distance = "1 mi",
  duration = "10 mins",
  lat = 33.9,
  lng = -81.0,
} = {}) {
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

function createJsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => data,
  };
}

function renderLibrary() {
  return render(
    <SnackbarProvider>
      <Library />
    </SnackbarProvider>
  );
}

function mockFetchWithRoutes(routes, overrides = {}) {
  const routeList = [...routes];
  const deleteHandler =
    overrides.deleteHandler ||
    ((url) => {
      const routeId = url.split("/").pop();
      const index = routeList.findIndex((route) => route.id === routeId);
      if (index >= 0) routeList.splice(index, 1);
      return createJsonResponse({});
    });

  const putHandler =
    overrides.putHandler ||
    (async (_url, options) => {
      const body = JSON.parse(options.body);
      const routeId = body.id;
      const updatedRoute = { ...body, id: routeId };
      const index = routeList.findIndex((route) => route.id === routeId);
      if (index >= 0) routeList[index] = updatedRoute;
      return createJsonResponse({ route: updatedRoute });
    });

  global.fetch = jest.fn(async (url, options = {}) => {
    const method = options.method || "GET";

    if (method === "GET" && String(url).endsWith("/api/routes")) {
      return createJsonResponse({ routes: routeList });
    }

    if (method === "DELETE") {
      return deleteHandler(url, options, routeList);
    }

    if (method === "PUT") {
      return putHandler(url, options, routeList);
    }

    return createJsonResponse({}, { ok: false, status: 404 });
  });

  return routeList;
}

beforeEach(() => {
  window.localStorage.clear();
  mockRoute = jest.fn().mockResolvedValue(buildDirectionsResult());

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
      Size: function Size(width, height) {
        this.width = width;
        this.height = height;
      },
      LatLngBounds: function LatLngBounds() {
        this.extend = jest.fn();
      },
      Geocoder: function Geocoder() {
        this.geocode = jest.fn((_request, callback) => callback([{}], "OK"));
      },
    },
  };
  window.google = global.google;

  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: false,
    media: "(max-width: 768px)",
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));

  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete global.google;
  delete window.google;
  delete global.fetch;
  jest.restoreAllMocks();
});

test("shows empty state when no routes match", async () => {
  mockFetchWithRoutes([]);
  renderLibrary();

  expect(await screen.findByText(/Saved Routes \(0\)/i)).toBeInTheDocument();
  expect(
    await screen.findByText(/No routes match your search and filters\./i)
  ).toBeInTheDocument();

  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Search saved routes..."), "anything");
  expect(screen.getByText(/No routes match your search and filters\./i)).toBeInTheDocument();
});

test("search and filters work together, and clear filters resets", async () => {
  mockFetchWithRoutes([
    {
      id: "r1",
      title: "Walk Fast Short",
      origin: "Main St",
      destination: "Riverfront",
      distance: "0.8 mi",
      duration: "19 mins",
      type: "👣",
      tags: ["USC"],
    },
    {
      id: "r2",
      title: "Bike Slow",
      origin: "Elm",
      destination: "Park",
      distance: "1.2 mi",
      duration: "25 mins",
      type: "🚲",
      tags: [],
    },
    {
      id: "r3",
      title: "Walk Long",
      origin: "Oak",
      destination: "Museum",
      distance: "2.1 mi",
      duration: "30 mins",
      type: "👣",
      tags: [],
    },
  ]);

  renderLibrary();
  expect(await screen.findByText(/Saved Routes \(3\)/i)).toBeInTheDocument();

  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Search saved routes..."), "walk");

  expect(screen.getByText("Walk Fast Short 👣")).toBeInTheDocument();
  expect(screen.getByText("Walk Long 👣")).toBeInTheDocument();
  expect(screen.queryByText("Bike Slow 🚲")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Filter" }));
  await user.selectOptions(screen.getByLabelText("Route Type"), "👣");
  await user.selectOptions(screen.getByLabelText("USC Tag"), "usc");
  await user.type(screen.getByLabelText("Max Distance (mi)"), "1");
  await user.type(screen.getByLabelText("Max Time (min)"), "20");

  expect(screen.getByRole("button", { name: "Hide Filters (4)" })).toBeInTheDocument();
  expect(screen.getByText("Walk Fast Short 👣")).toBeInTheDocument();
  expect(screen.queryByText("Walk Long 👣")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Clear Filters" }));
  expect(screen.getByRole("button", { name: "Hide Filters" })).toBeInTheDocument();
  expect(screen.getByText("Walk Fast Short 👣")).toBeInTheDocument();
  expect(screen.getByText("Walk Long 👣")).toBeInTheDocument();
});

test("load renders directions, sets stats, and shows saved route details", async () => {
  mockFetchWithRoutes([
    {
      id: "route-1",
      title: "River Loop",
      origin: "A",
      destination: "B",
      distance: "0.8 mi",
      duration: "19 mins",
      type: "🚲",
      review: { stars: 4, terrain: 7, comment: "Smooth and shaded." },
      hazards: [{ type: "construction", lat: 34.0, lng: -81.01 }],
      photos: [{ url: "https://example.com/photo.jpg", caption: "Bridge view" }],
    },
  ]);

  mockRoute.mockResolvedValueOnce(
    buildDirectionsResult({ distance: "2 mi", duration: "12 mins", lat: 34.1, lng: -81.2 })
  );

  renderLibrary();
  const user = userEvent.setup();

  await screen.findByText("River Loop 🚲");
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
      travelMode: "BICYCLING",
      unitSystem: "IMPERIAL",
    })
  );
  expect(mockMapInstance.fitBounds).toHaveBeenCalled();

  expect(screen.getByText("Saved Review")).toBeInTheDocument();
  expect(screen.getByText("4/5")).toBeInTheDocument();
  expect(screen.getByText(/Terrain:/i)).toBeInTheDocument();
  expect(screen.getByText("Smooth and shaded.")).toBeInTheDocument();
  expect(screen.getByText(/Hazards \(1\)/i)).toBeInTheDocument();
  expect(screen.getByText("Trail Photos")).toBeInTheDocument();

  expect(mockMapInstance.fitBounds).toHaveBeenCalled();
});

test("load failure shows snackbar and clears any stale review", async () => {
  mockFetchWithRoutes([
    {
      id: "route-fail",
      title: "Broken Route",
      origin: "X",
      destination: "Y",
      distance: "1 mi",
      duration: "10 mins",
      type: "🚲",
      review: { stars: 5, terrain: 9, comment: "Old review" },
    },
  ]);

  mockRoute.mockRejectedValueOnce(new Error("network"));

  renderLibrary();
  const user = userEvent.setup();

  await screen.findByText("Broken Route 🚲");
  await user.click(screen.getByRole("button", { name: "Load" }));

  expect(await screen.findByText("Could not load route.")).toBeInTheDocument();
  expect(screen.queryByTestId("directions-renderer")).not.toBeInTheDocument();
  expect(screen.getByText(/No review saved for this route\./i)).toBeInTheDocument();
});

test("delete route removes selected route state after snackbar confirmation", async () => {
  mockFetchWithRoutes([
    {
      id: "delete-me",
      title: "Delete target route",
      origin: "301 Main St",
      destination: "1523 Greene St",
      distance: "0.8 mi",
      duration: "19 mins",
      type: "👣",
      review: { stars: 3, terrain: 5, comment: "ok" },
    },
  ]);

  renderLibrary();
  const user = userEvent.setup();

  await screen.findByText("Delete target route 👣");
  await user.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByText("Saved Review");

  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(await screen.findByText("Delete this saved route?")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Delete target route 👣")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Delete" }));
  await user.click(screen.getAllByRole("button", { name: "Delete" })[1]);

  await waitFor(() => {
    expect(screen.queryByText("Delete target route 👣")).not.toBeInTheDocument();
  });
  expect(screen.queryByText("Saved Review")).not.toBeInTheDocument();
  expect(screen.queryByText(/Distance:/i)).not.toBeInTheDocument();
});

test("edit can be canceled and save validates required origin and destination", async () => {
  mockFetchWithRoutes([
    {
      id: "edit-1",
      title: "Editable",
      origin: "Start",
      destination: "End",
      distance: "1 mi",
      duration: "10 mins",
      type: "👣",
    },
  ]);

  renderLibrary();
  const user = userEvent.setup();

  await screen.findByText("Editable 👣");
  await user.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByDisplayValue("Editable")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByDisplayValue("Editable")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Edit" }));
  const originInput = screen.getByPlaceholderText("Origin");
  await user.clear(originInput);
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Origin and destination are required.")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Origin")).toBeInTheDocument();
});

test("save edit updates route card through the API response", async () => {
  mockFetchWithRoutes([
    {
      id: "edit-2",
      title: "Old Title",
      origin: "Old Origin",
      destination: "Old Dest",
      distance: "1 mi",
      duration: "10 mins",
      type: "👣",
      tags: [],
      public: false,
    },
  ]);

  renderLibrary();
  const user = userEvent.setup();

  await screen.findByText("Old Title 👣");
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
    expect(screen.getByText("Updated Route 👣")).toBeInTheDocument();
  });
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/routes/edit-2"),
    expect.objectContaining({
      method: "PUT",
      body: expect.any(String),
    })
  );
});

test("saving an edited selected route reloads it", async () => {
  mockFetchWithRoutes([
    {
      id: "edit-selected",
      title: "Reloadable",
      origin: "A",
      destination: "B",
      distance: "1 mi",
      duration: "10 mins",
      type: "🚲",
      tags: [],
      public: false,
    },
  ]);

  renderLibrary();
  const user = userEvent.setup();

  await screen.findByText("Reloadable 🚲");
  await user.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByText(/Distance:/i);

  await user.click(screen.getByRole("button", { name: "Edit" }));
  const titleInput = screen.getByPlaceholderText("Route title");
  await user.clear(titleInput);
  await user.type(titleInput, "Reloaded Route");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => {
    expect(mockRoute).toHaveBeenCalledTimes(2);
  });
  expect(screen.getByText("Reloaded Route 🚲")).toBeInTheDocument();
  expect(mockRoute).toHaveBeenLastCalledWith(
    expect.objectContaining({ origin: "A", destination: "B" })
  );
});
