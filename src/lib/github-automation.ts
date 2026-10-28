import type { ArtifactFile } from "./autonomy";

const owner = process.env.GITHUB_AUTOMATION_OWNER || "shoyrulove-dev";
const repo = process.env.GITHUB_AUTOMATION_REPO || "aishoyru";
const api = "https://api.github.com";

async function github<T>(path: string, init: RequestInit = {}) {
  const token = process.env.GITHUB_AUTOMATION_TOKEN;
  if (!token) throw new Error("Thiếu GITHUB_AUTOMATION_TOKEN");
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Shoyru-AI",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };
  if (!response.ok)
    throw new Error(`GitHub HTTP ${response.status}: ${payload.message || "Yêu cầu thất bại"}`);
  return payload;
}

export async function checkGitHubAutomation() {
  const repository = await github<{
    full_name: string;
    default_branch: string;
    permissions?: { push?: boolean; pull?: boolean };
  }>(`/repos/${owner}/${repo}`);
  return {
    ok: true,
    repository: repository.full_name,
    defaultBranch: repository.default_branch,
    canPush: Boolean(repository.permissions?.push),
    canPull: Boolean(repository.permissions?.pull),
  };
}

export async function createArtifactPullRequest(input: {
  taskId: string;
  title: string;
  description: string;
  files: ArtifactFile[];
}) {
  if (!input.files.length) throw new Error("Không có tệp để tạo Pull Request");
  const repository = await github<{ default_branch: string }>(`/repos/${owner}/${repo}`);
  const base = repository.default_branch || "main";
  const ref = await github<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`,
  );
  const branch = `shoyru/work-${input.taskId.slice(0, 8)}`;
  await github(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }),
  });

  const root = `shoyru-work/${input.taskId.slice(0, 8)}`;
  for (const file of input.files) {
    const path = `${root}/${file.path}`.replace(/\/{2,}/g, "/");
    await github(`/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `feat(shoyru): add ${file.path}`,
        content: Buffer.from(file.content, "utf8").toString("base64"),
        branch,
      }),
    });
  }

  const pull = await github<{ number: number; html_url: string }>(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `[Shoyru] ${input.title}`.slice(0, 240),
        head: branch,
        base,
        body: `${input.description}\n\nTự động tạo bởi Shoyru. Pull Request này cần chủ nhân kiểm tra và merge thủ công.`,
        maintainer_can_modify: true,
      }),
    },
  );
  return { branch, number: pull.number, url: pull.html_url };
}
