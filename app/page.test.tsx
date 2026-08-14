// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function askQuestion() {
  const user = userEvent.setup();
  render(<Home />);
  await user.type(screen.getByPlaceholderText(/Ask a fiqh question/), "যাকাত");
  await user.click(screen.getByRole("button", { name: "Ask" }));
  return user;
}

describe("Home chat error handling", () => {
  it("shows an internal-server message on HTTP 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Internal Server Error", { status: 500 })),
    );

    await askQuestion();

    expect(await screen.findByText(/server is having trouble/)).toBeInTheDocument();
  });

  it("shows a rate-limit message on HTTP 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));

    await askQuestion();

    expect(await screen.findByText(/requests too quickly/)).toBeInTheDocument();
  });

  it("shows a generic message on other HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));

    await askQuestion();

    expect(await screen.findByText(/could not be completed/)).toBeInTheDocument();
  });

  it("shows an unreachable-server message on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await askQuestion();

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
  });
});
