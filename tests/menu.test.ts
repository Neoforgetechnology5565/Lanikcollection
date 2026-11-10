import test from "node:test";
import assert from "node:assert/strict";
import { buildGroups, DEFAULT_GROUPS } from "@/lib/menu";

const c = (slug: string, name: string, sort: number, menuGroup: string | null) => ({ slug, name, sort, menuGroup });
test("groups follow category order and 'More' is always last", () => {
  const g = buildGroups([c("other", "Other", 0, "More"), c("p", "Perfumes", 1, "Fragrance"), c("b", "Boxers", 2, "Underwear"), c("s", "Singlets", 3, "Underwear"), c("pl", "Polo", 4, "Clothing")]);
  assert.deepEqual(g.map((x) => x.name), ["Fragrance", "Underwear", "Clothing", "More"]);
  assert.deepEqual(g[1].items.map((i) => i.slug), ["b", "s"]);
});
test("a category with no group is never lost: it goes to More", () => {
  const g = buildGroups([c("x", "New Thing", 9, null), c("y", "Blank", 8, "  ")]);
  assert.equal(g.length, 1); assert.equal(g[0].name, "More"); assert.equal(g[0].items.length, 2);
});
test("empty shop gives an empty menu; names are trimmed so 'Clothing ' and 'Clothing' merge", () => {
  assert.deepEqual(buildGroups([]), []);
  assert.equal(buildGroups([c("a", "A", 0, "Clothing "), c("b", "B", 1, "Clothing")]).length, 1);
});
test("built-in categories map to the agreed groups, so every one is reachable", () => {
  const cats = Object.entries(DEFAULT_GROUPS).map(([slug, g], i) => c(slug, slug, i, g));
  const g = buildGroups(cats);
  assert.deepEqual(g.map((x) => x.name), ["Fragrance", "Underwear", "Clothing", "More"]);
  assert.equal(g.flatMap((x) => x.items).length, 6);
});
