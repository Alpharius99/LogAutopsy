import type { GitLabIssueRequest, GitLabIssueResponse } from '../models/types';

export async function createGitLabIssue(request: GitLabIssueRequest): Promise<GitLabIssueResponse> {
  const url = new URL(
    `/api/v4/projects/${encodeURIComponent(request.projectId)}/issues`,
    request.baseUrl.endsWith('/') ? request.baseUrl : `${request.baseUrl}/`
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': request.token,
    },
    body: JSON.stringify({
      title: request.title,
      description: request.description,
      labels: request.labels.join(','),
    }),
  });

  if (!response.ok) {
    throw new Error(`GitLab issue creation failed (${response.status} ${response.statusText}).`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  return {
    id: Number(json.id),
    iid: Number(json.iid),
    web_url: String(json.web_url),
    title: String(json.title),
  };
}
