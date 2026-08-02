export function findAdjacentJob(jobs, selectedJobId, direction) {
  const selectedIndex = jobs.findIndex((job) => String(job?.id) === String(selectedJobId));
  if (selectedIndex === -1) return null;
  return jobs[selectedIndex + direction] ?? null;
}
