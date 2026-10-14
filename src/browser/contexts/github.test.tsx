import { expect, spyOn, test } from "bun:test";
import { createGitHubStore, type PRSearchResult } from "./github";

test("switching to Open clears closed results even when the new search fails", async () => {
  const closedPR: PRSearchResult = {
    id: 1,
    number: 1,
    title: "Closed PR",
    state: "closed",
    draft: false,
    html_url: "https://github.com/test/repo/pull/1",
    repository_url: "https://api.github.com/repos/test/repo",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    user: null,
    labels: [],
  };
  const queries: string[] = [];
  const upstream = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(String(input));
        if (url.pathname === "/graphql") {
          return Response.json({ data: { pr0: { pullRequest: null } } });
        }
        const query = url.searchParams.get("q")!;
        queries.push(query);
        if (query.includes("is:closed")) {
          return Response.json({ items: [closedPR], total_count: 1 });
        }
        return Response.json(
          { message: "Resource not accessible by integration" },
          { status: 403 }
        );
      },
      { preconnect: () => {} }
    )
  );
  try {
    const store = createGitHubStore();
    store.initializeAnonymous();
    await store.fetchPRList(["is:pr is:closed repo:test/repo"]);
    expect(store.getState().prList.items).toEqual([closedPR]);

    const loadingItems: PRSearchResult[][] = [];
    const unsubscribe = store.subscribe(() => {
      if (store.getState().prList.loading) {
        loadingItems.push(store.getState().prList.items);
      }
    });
    await store.fetchPRList(["is:pr is:open repo:test/repo"]);
    unsubscribe();
    expect(loadingItems).toEqual([[]]);
    expect(store.getState().prList.items).toEqual([]);
    expect(store.getState().prList.totalCount).toBe(0);
    expect(store.getState().prList.loading).toBe(false);
    expect(store.getState().prList.error).toContain(
      "Resource not accessible by integration"
    );
    expect(queries).toEqual([
      "is:pr is:closed repo:test/repo",
      "is:pr is:open repo:test/repo",
    ]);
    store.reset();
  } finally {
    upstream.mockRestore();
  }
});

test("an unsuccessful PR search can be retried and settle with no open PRs", async () => {
  let requests = 0;
  const upstream = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () => {
        requests++;
        return requests === 1
          ? Response.json({ message: "Search unavailable" }, { status: 503 })
          : Response.json({ items: [], total_count: 0 });
      },
      { preconnect: () => {} }
    )
  );
  try {
    const store = createGitHubStore();
    store.initializeAnonymous();
    const queries = ["is:pr is:open repo:test/repo"];
    await store.fetchPRList(queries);
    expect(store.getState().prList.error).toContain("Search unavailable");

    await store.fetchPRList(queries, 1, 30, { backgroundRefresh: true });
    expect(store.getState().prList).toMatchObject({
      items: [],
      totalCount: 0,
      loading: false,
      error: null,
    });
    expect(requests).toBe(2);
    store.reset();
  } finally {
    upstream.mockRestore();
  }
});
