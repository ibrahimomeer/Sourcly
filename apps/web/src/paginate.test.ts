import { describe, expect, it } from "vitest";
import { PAGE_SIZE, paginate } from "./paginate";

const numbers = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginate", () => {
  it("shows 25 per page", () => {
    expect(PAGE_SIZE).toBe(25);
  });

  it("returns the first page by default and knows how many pages there are", () => {
    const page = paginate(numbers(60), 1);
    expect(page.items).toEqual(numbers(25));
    expect(page).toMatchObject({ page: 1, totalPages: 3, offset: 0, total: 60 });
  });

  it("returns the right slice for later pages, including a short last page", () => {
    expect(paginate(numbers(60), 2).items).toEqual(Array.from({ length: 25 }, (_, i) => 26 + i));
    const last = paginate(numbers(60), 3);
    expect(last.items).toEqual(numbers(60).slice(50));
    expect(last).toMatchObject({ page: 3, offset: 50 });
  });

  it("fits exactly on one page at 25 results, and needs a second page at 26", () => {
    expect(paginate(numbers(25), 1).totalPages).toBe(1);
    expect(paginate(numbers(26), 1).totalPages).toBe(2);
    expect(paginate(numbers(26), 2).items).toEqual([26]);
  });

  it("handles an empty list as one empty page", () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, totalPages: 1, offset: 0, total: 0 });
  });

  it("moves an out-of-range page to the nearest real one instead of showing nothing", () => {
    expect(paginate(numbers(60), 99).page).toBe(3);
    expect(paginate(numbers(60), 0).page).toBe(1);
    expect(paginate(numbers(60), -4).page).toBe(1);
    expect(paginate(numbers(60), Number.NaN).page).toBe(1);
    expect(paginate(numbers(60), 2.9).page).toBe(2);
  });

  it("takes a different page size, and does not modify the list", () => {
    const list = numbers(10);
    expect(paginate(list, 2, 4).items).toEqual([5, 6, 7, 8]);
    expect(list).toEqual(numbers(10));
  });
});
