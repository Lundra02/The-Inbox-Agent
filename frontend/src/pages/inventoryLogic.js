export function statusLabel(item) {
  return item.quantity > 0 ? "In stock" : item.incomingQuantity > 0 ? "Coming soon" : "Out of stock";
}

export function filterAndSortItems(items, query, filter, sort) {
  return items.filter(item => {
    const matchesQuery = `${item.sku} ${item.name}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "in_stock" && item.quantity > 0) || (filter === "incoming" && item.incomingQuantity > 0) || (filter === "out_of_stock" && item.quantity === 0 && item.incomingQuantity === 0);
    return matchesQuery && matchesFilter;
  }).sort((a, b) => sort === "quantity" ? b.quantity - a.quantity : sort === "status" ? statusLabel(a).localeCompare(statusLabel(b)) : a.name.localeCompare(b.name));
}