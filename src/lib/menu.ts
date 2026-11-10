export type MenuGroup = { name: string; items: { slug: string; name: string }[] };

/** Starting groups for the built-in categories. Editable per category in Admin → Categories. */
export const DEFAULT_GROUPS: Record<string, string> = {
  perfumes: "Fragrance", boxers: "Underwear", singlets: "Underwear",
  "polo-shirts": "Clothing", jeans: "Clothing", "other-fashion-items": "More",
};

/**
 * Turn categories into the Shop dropdown. Groups appear in the order of their first category (by sort order),
 * categories keep their own order inside a group, and "More" (the catch-all) is always last.
 * A new category with no group lands in "More" so it is never unreachable.
 */
export function buildGroups(cats: { slug: string; name: string; sort: number; menuGroup: string | null }[]): MenuGroup[] {
  const sorted = [...cats].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const map = new Map<string, MenuGroup>();
  for (const c of sorted) {
    const name = c.menuGroup?.trim() || "More";
    if (!map.has(name)) map.set(name, { name, items: [] });
    map.get(name)!.items.push({ slug: c.slug, name: c.name });
  }
  const all = [...map.values()];
  return [...all.filter((g) => g.name !== "More"), ...all.filter((g) => g.name === "More")];
}
