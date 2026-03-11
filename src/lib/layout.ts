/**
 * Calculate column layout for overlapping time-based items (like Google Calendar).
 * Returns each item with its column index and total columns in its overlap group.
 */
export interface LayoutItem {
  id: string;
  startTime: number;
  endTime: number;
}

export interface LayoutResult {
  id: string;
  column: number;
  totalColumns: number;
}

export function computeOverlapColumns<T extends LayoutItem>(items: T[]): Map<string, LayoutResult> {
  if (items.length === 0) return new Map();

  // Sort by start time, then longest first (for stable layout)
  const sorted = [...items].sort((a, b) =>
    a.startTime !== b.startTime
      ? a.startTime - b.startTime
      : (b.endTime - b.startTime) - (a.endTime - a.startTime)
  );

  // Assign columns greedily
  // columns[i] = end time of the last item placed in column i
  const columns: number[] = [];
  const itemColumns = new Map<string, number>();

  for (const item of sorted) {
    // Find first column where this item fits (no overlap)
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      if (item.startTime >= columns[col]) {
        columns[col] = item.endTime;
        itemColumns.set(item.id, col);
        placed = true;
        break;
      }
    }
    if (!placed) {
      itemColumns.set(item.id, columns.length);
      columns.push(item.endTime);
    }
  }

  // Find connected overlap groups to determine totalColumns per group
  // Two items are in the same group if they overlap (directly or transitively)
  const groups: number[][] = []; // group index -> item indices
  const itemGroup = new Map<number, number>(); // sorted index -> group index

  for (let i = 0; i < sorted.length; i++) {
    let groupIdx = -1;

    // Check if this item overlaps with any already-grouped item
    for (let j = 0; j < i; j++) {
      if (sorted[j].endTime > sorted[i].startTime) {
        // Overlaps with item j
        const jGroup = itemGroup.get(j)!;
        if (groupIdx === -1) {
          groupIdx = jGroup;
        } else if (groupIdx !== jGroup) {
          // Merge groups
          const mergeFrom = Math.max(groupIdx, jGroup);
          const mergeTo = Math.min(groupIdx, jGroup);
          for (const idx of groups[mergeFrom]) {
            groups[mergeTo].push(idx);
            itemGroup.set(idx, mergeTo);
          }
          groups[mergeFrom] = [];
          groupIdx = mergeTo;
        }
      }
    }

    if (groupIdx === -1) {
      groupIdx = groups.length;
      groups.push([]);
    }

    groups[groupIdx].push(i);
    itemGroup.set(i, groupIdx);
  }

  // Build result: for each group, totalColumns = max column used + 1
  const result = new Map<string, LayoutResult>();

  for (const group of groups) {
    if (group.length === 0) continue;

    let maxCol = 0;
    for (const idx of group) {
      const col = itemColumns.get(sorted[idx].id)!;
      if (col > maxCol) maxCol = col;
    }
    const totalColumns = maxCol + 1;

    for (const idx of group) {
      const item = sorted[idx];
      result.set(item.id, {
        id: item.id,
        column: itemColumns.get(item.id)!,
        totalColumns,
      });
    }
  }

  return result;
}
