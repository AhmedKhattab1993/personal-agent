export const PROJECT_CATEGORIES = ['Distribution', 'Products', 'Trading', 'Freelance', 'Study', 'Other'];
export const DEFAULT_PROJECT_CATEGORY = 'Other';

export function normalizeProjectCategory(value) {
  const category = typeof value === 'string' ? value.trim() : '';
  return PROJECT_CATEGORIES.includes(category) ? category : DEFAULT_PROJECT_CATEGORY;
}

export function groupProjectsByCategory(projects) {
  const grouped = new Map(PROJECT_CATEGORIES.map((category) => [category, []]));
  for (const project of projects ?? []) {
    grouped.get(normalizeProjectCategory(project.category)).push(project);
  }
  return PROJECT_CATEGORIES
    .filter((category) => grouped.get(category).length > 0)
    .map((category) => ({ category, projects: grouped.get(category) }));
}
