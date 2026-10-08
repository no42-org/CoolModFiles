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

  it("keeps the fallback when the feed fails and retries after a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockRejectedValueOnce(new Error("down"));
    fetchMock.mockResolvedValueOnce(new Response(rss(300)));
    const getLatestId = await load();
    getLatestId(42);
    await new Promise((r) => setTimeout(r, 10));
    expect(getLatestId(42)).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 61 * 1000);
    getLatestId(42);
    await vi.waitFor(() => expect(getLatestId(42)).toBe(300));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the fallback on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response(rss(500), { status: 503 }));
    const getLatestId = await load();
    getLatestId(42);
    await new Promise((r) => setTimeout(r, 10));
    expect(getLatestId(42)).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers when fetch throws synchronously", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockImplementationOnce(() => {
      throw new Error("sync");
    });
    fetchMock.mockResolvedValueOnce(new Response(rss(400)));
    const getLatestId = await load();
    getLatestId(42);
    await new Promise((r) => setTimeout(r, 10));
    vi.setSystemTime(Date.now() + 61 * 1000);
    getLatestId(42);
    await vi.waitFor(() => expect(getLatestId(42)).toBe(400));
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
