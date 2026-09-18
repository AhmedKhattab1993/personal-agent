import assert from 'node:assert/strict';
import test from 'node:test';

import { PROJECT_CATEGORIES, groupProjectsByCategory, normalizeProjectCategory } from './planningProjects.js';

test('groups planning projects by the closed category order', () => {
  const projects = [
    { id: 'trading-a', name: 'theultimate', category: 'Trading' },
    { id: 'other-a', name: 'galata-beans', category: 'Other' },
    { id: 'distribution-a', name: 'MC & WC', category: 'Distribution' },
    { id: 'trading-b', name: 'Daniel-HumbleBot', category: 'Trading' },
    { id: 'products-a', name: 'maarood', category: 'Products' },
    { id: 'other-missing', name: 'qayem' },
    { id: 'freelance-a', name: 'Remote Jobs', category: 'Freelance' },
  ];

  const groups = groupProjectsByCategory(projects);
  const labels = groups.map((group) => group.category);

  assert.deepEqual(labels, ['Distribution', 'Products', 'Trading', 'Freelance', 'Other']);
  assert.ok(labels.every((label, index) => {
    const previous = PROJECT_CATEGORIES.indexOf(labels[index - 1] ?? PROJECT_CATEGORIES[0]);
    return PROJECT_CATEGORIES.indexOf(label) >= previous;
  }));
  assert.ok(labels.every((label) => PROJECT_CATEGORIES.includes(label)));
  assert.equal(new Set(labels).size, labels.length);

  const seen = new Set();
  for (const group of groups) {
    assert.ok(group.projects.length > 0);
    for (const project of group.projects) {
      assert.equal(normalizeProjectCategory(project.category), group.category);
      assert.equal(seen.has(project.id), false);
      seen.add(project.id);
    }
  }
  assert.equal(seen.size, projects.length);

  assert.deepEqual(groups.find((group) => group.category === 'Trading').projects.map((project) => project.id), ['trading-a', 'trading-b']);
  assert.deepEqual(groups.find((group) => group.category === 'Other').projects.map((project) => project.id), ['other-a', 'other-missing']);
  assert.equal(groups.some((group) => group.category === 'Study'), false);
});
