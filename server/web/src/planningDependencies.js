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
