// Display-only inventory: imported files are counted independently of extracted/accepted facts.
export function importedSourceCount(projectId, ...inventories) {
  if (!projectId) return 0;
  const ids=new Set(),hashes=new Set();let count=0;
  for (const inventory of inventories) {
    if (!inventory || inventory.projectId !== projectId) continue;
    for (const source of inventory.sources || []) {
      if (!['bldg','geo','yjk'].includes(source.slot) || source.origin === 'decisions' || source.origin === 'intake') continue;
      const id=source.source_id,hash=source.hash;
      if (!id && !hash) continue;
      if ((id && ids.has(id)) || (hash && hashes.has(hash))) continue;
      if (id) ids.add(id);if (hash) hashes.add(hash);count++;
    }
  }
  return count;
}
