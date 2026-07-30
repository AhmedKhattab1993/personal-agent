const HIDDEN_DEPENDENCY_OPTION_STATES = new Set(['done', 'archived']);

export function isDependencyOptionVisible(goal) {
  return !HIDDEN_DEPENDENCY_OPTION_STATES.has(goal.status);
}

export function isGoalVisibleInAllProjects(goal, hiddenProjectIds) {
  return !hiddenProjectIds.has(goal.projectId);
}

export function prioritizeSameProject(goals, projectId) {
  const sameProject = [];
  const otherProjects = [];
  for (const goal of goals) {
    (goal.projectId === projectId ? sameProject : otherProjects).push(goal);
  }
  return [...sameProject, ...otherProjects];
}

export function wouldCreateCycle(goals, goalId, candidateId) {
  if (!goalId) return false;
  if (goalId === candidateId) return true;
  const adjacency = new Map(goals.map((goal) => [goal.id, goal.dependsOn ?? []]));
  const stack = [candidateId];
  const visited = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === goalId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}
