const {
  CLOSED_PR_NUMBER,
  GITHUB_REPOSITORY,
  GITHUB_TOKEN,
  VERCEL_PROJECT_ID,
  VERCEL_TEAM_ID,
  VERCEL_TOKEN,
} = process.env;

const required = {
  GITHUB_REPOSITORY,
  GITHUB_TOKEN,
  VERCEL_PROJECT_ID,
  VERCEL_TEAM_ID,
  VERCEL_TOKEN,
};

for (const [name, value] of Object.entries(required)) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method ?? "GET"} ${url} failed (${response.status}): ${body}`);
  }

  return response;
}

async function listOpenPullRequests() {
  const openPullRequests = new Set();

  for (let page = 1; ; page += 1) {
    const url = new URL(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls`);
    url.searchParams.set("state", "open");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await request(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const pullRequests = await response.json();

    for (const pullRequest of pullRequests) {
      openPullRequests.add(String(pullRequest.number));
    }

    if (pullRequests.length < 100) break;
  }

  return openPullRequests;
}

async function listDeployments() {
  const deployments = [];
  let until;

  do {
    const url = new URL("https://api.vercel.com/v6/deployments");
    url.searchParams.set("projectId", VERCEL_PROJECT_ID);
    url.searchParams.set("teamId", VERCEL_TEAM_ID);
    url.searchParams.set("limit", "100");
    if (until) url.searchParams.set("until", String(until));

    const response = await request(url, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    });
    const page = await response.json();
    deployments.push(...page.deployments);
    until = page.pagination?.next;
  } while (until);

  return deployments;
}

async function deleteDeployment(deploymentId) {
  const url = new URL(`https://api.vercel.com/v13/deployments/${deploymentId}`);
  url.searchParams.set("teamId", VERCEL_TEAM_ID);

  await request(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
}

const closedPullRequest = CLOSED_PR_NUMBER || null;
const openPullRequests = closedPullRequest ? null : await listOpenPullRequests();
const deployments = await listDeployments();
const staleDeployments = deployments.filter((deployment) => {
  const pullRequest = deployment.meta?.githubPrId;

  if (deployment.target === "production" || !pullRequest) return false;
  if (closedPullRequest) return String(pullRequest) === closedPullRequest;

  return !openPullRequests.has(String(pullRequest));
});

for (const deployment of staleDeployments) {
  await deleteDeployment(deployment.uid);
  console.log(`Deleted ${deployment.uid} (PR #${deployment.meta.githubPrId})`);
}

console.log(`Cleanup complete: ${staleDeployments.length} deployment(s) deleted.`);
