interface SkillOrderFields {
  id: string;
  name: string;
  sort_order: number;
}

/** Urutan tampilan: sort_order menaik, nama sebagai tie-break. */
export function orderedAISkills<T extends Pick<SkillOrderFields, 'name' | 'sort_order'>>(skills: T[]): T[] {
  return [...skills].sort((a, b) => {
    const d = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    return d !== 0 ? d : a.name.localeCompare(b.name, 'id');
  });
}

/** Nomor 1..n tanpa lompat. Tidak mengubah urutan relatif. */
export function compactedSkillSortOrders<T extends SkillOrderFields>(
  skills: T[]
): Array<{ id: string; sort_order: number }> {
  return orderedAISkills(skills).map((skill, index) => ({
    id: skill.id,
    sort_order: index + 1,
  }));
}

export function skillSortHasGaps<T extends SkillOrderFields>(skills: T[]): boolean {
  return compactedSkillSortOrders(skills).some((next, i) => {
    const current = orderedAISkills(skills)[i];
    return current.sort_order !== next.sort_order;
  });
}
