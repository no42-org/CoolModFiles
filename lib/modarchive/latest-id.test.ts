/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rss = (id: number) =>
  `<item><link>https://modarchive.org/index.php?request=view_by_moduleid&amp;query=${id}</link>` +
  `<enclosure url="https://api.modarchive.org/downloads.php?moduleid=${id}#x.mod"/></item>`;

async function load() {
  vi.resetModules();
  return (await import("./latest-id")).getLatestId;
}

describe("getLatestId", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns the fallback without waiting for the feed", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const getLatestId = await load();
    expect(getLatestId(42)).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves the fetched id once the refresh lands, without refetching", async () => {
    fetchMock.mockResolvedValue(new Response(rss(200123)));
    const getLatestId = await load();
    getLatestId(42);
    await vi.waitFor(() => expect(getLatestId(42)).toBe(200123));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts only one refresh while one is in flight", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const getLatestId = await load();
    getLatestId(42);
    getLatestId(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the fallback when the feed fails", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const getLatestId = await load();
    getLatestId(42);
    await new Promise((r) => setTimeout(r, 0));
    expect(getLatestId(42)).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes again after the TTL expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockResolvedValueOnce(new Response(rss(100)));
    fetchMock.mockResolvedValueOnce(new Response(rss(101)));
    const getLatestId = await load();
    getLatestId(42);
    await vi.waitFor(() => expect(getLatestId(42)).toBe(100));
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    getLatestId(42);
    await vi.waitFor(() => expect(getLatestId(42)).toBe(101));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
