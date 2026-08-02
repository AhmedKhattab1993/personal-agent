export function findAdjacentJob(jobs, selectedJobId, direction) {
  const selectedIndex = jobs.findIndex((job) => String(job?.id) === String(selectedJobId));
  if (selectedIndex === -1) return null;
  return jobs[selectedIndex + direction] ?? null;
}

export function includeSelectedJobInNavigation(jobs, selectedJob, sortJobs) {
  const selectedJobId = String(selectedJob?.id ?? '');
  if (!selectedJobId || jobs.some((job) => String(job?.id) === selectedJobId)) return jobs;
  return sortJobs([...jobs, selectedJob]);
}
