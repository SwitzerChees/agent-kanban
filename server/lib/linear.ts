import type { Issue, ServiceConfig } from './types';

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message?: string; [key: string]: unknown }>;
}

interface IssuesConnection {
  issues?: {
    nodes?: unknown[];
    pageInfo?: {
      hasNextPage?: boolean;
      endCursor?: string | null;
    };
  };
}

type IssuesPageInfo = NonNullable<IssuesConnection['issues']>['pageInfo'];

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  priority
  branchName
  url
  createdAt
  updatedAt
  state { name }
  labels(first: 50) { nodes { name } }
  inverseRelations(first: 50) {
    nodes {
      type
      issue { id identifier state { name } }
      relatedIssue { id identifier state { name } }
    }
  }
`;

export class LinearClient {
  constructor(private readonly config: ServiceConfig) {}

  fetchCandidateIssues(): Promise<Issue[]> {
    return this.fetchIssuesByStates(this.config.tracker.activeStates);
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    if (stateNames.length === 0) return [];

    const query = `
      query SymphonyIssuesByState($projectSlug: String!, $states: [String!], $after: String) {
        issues(
          first: 50,
          after: $after,
          filter: {
            project: { slugId: { eq: $projectSlug } },
            state: { name: { in: $states } }
          }
        ) {
          nodes { ${ISSUE_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    const nodes: unknown[] = [];
    let after: string | null = null;
    while (true) {
      const data: IssuesConnection = await this.request<IssuesConnection>(query, {
        projectSlug: this.config.tracker.projectSlug,
        states: stateNames,
        after,
      });
      const connection: IssuesConnection['issues'] = data.issues;
      nodes.push(...(connection?.nodes ?? []));
      const pageInfo: IssuesPageInfo | undefined = connection?.pageInfo;
      if (!pageInfo?.hasNextPage) break;
      if (!pageInfo.endCursor) {
        throw new Error('linear_missing_end_cursor');
      }
      after = pageInfo.endCursor;
    }

    return nodes.map(normalizeIssue).filter((issue): issue is Issue => Boolean(issue));
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Issue[]> {
    if (issueIds.length === 0) return [];

    const query = `
      query SymphonyIssueStateRefresh($ids: [ID!], $after: String) {
        issues(first: 50, after: $after, filter: { id: { in: $ids } }) {
          nodes { ${ISSUE_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    const nodes: unknown[] = [];
    let after: string | null = null;
    while (true) {
      const data: IssuesConnection = await this.request<IssuesConnection>(query, { ids: issueIds, after });
      const connection: IssuesConnection['issues'] = data.issues;
      nodes.push(...(connection?.nodes ?? []));
      const pageInfo: IssuesPageInfo | undefined = connection?.pageInfo;
      if (!pageInfo?.hasNextPage) break;
      if (!pageInfo.endCursor) {
        throw new Error('linear_missing_end_cursor');
      }
      after = pageInfo.endCursor;
    }

    return nodes.map(normalizeIssue).filter((issue): issue is Issue => Boolean(issue));
  }

  async rawGraphQL(query: string, variables?: Record<string, unknown>): Promise<GraphQLResponse<unknown>> {
    validateOneOperation(query);
    return this.requestRaw(query, variables ?? {});
  }

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const payload = await this.requestRaw<T>(query, variables);
    if (payload.errors?.length) {
      const message = payload.errors.map((error) => error.message ?? 'unknown GraphQL error').join('; ');
      throw new Error(`linear_graphql_errors: ${message}`);
    }
    if (!payload.data || typeof payload.data !== 'object') {
      throw new Error('linear_unknown_payload');
    }
    return payload.data;
  }

  private async requestRaw<T>(query: string, variables: Record<string, unknown>): Promise<GraphQLResponse<T>> {
    const apiKey = this.config.tracker.apiKey;
    if (!apiKey) throw new Error('missing_tracker_api_key');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch(this.config.tracker.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      throw new Error(`linear_api_request: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`linear_api_status: ${response.status}`);
    }

    try {
      return await response.json() as GraphQLResponse<T>;
    } catch (error) {
      throw new Error(`linear_unknown_payload: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function normalizeIssue(node: unknown): Issue | null {
  const raw = asRecord(node);
  const id = requiredString(raw.id);
  const identifier = requiredString(raw.identifier);
  const title = requiredString(raw.title);
  const state = stateName(raw.state);
  if (!id || !identifier || !title || !state) return null;

  return {
    id,
    identifier,
    title,
    description: nullableString(raw.description),
    priority: integerOrNull(raw.priority),
    state,
    branch_name: nullableString(raw.branchName),
    url: nullableString(raw.url),
    labels: labels(raw.labels),
    blocked_by: blockers(raw.inverseRelations),
    created_at: isoOrNull(raw.createdAt),
    updated_at: isoOrNull(raw.updatedAt),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function stateName(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const raw = asRecord(value);
  return nullableString(raw.name);
}

function integerOrNull(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null;
}

function labels(value: unknown): string[] {
  const raw = asRecord(value);
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  return nodes
    .map((item) => nullableString(asRecord(item).name))
    .filter((item): item is string => Boolean(item))
    .map((item) => item.toLowerCase());
}

function blockers(value: unknown): Issue['blocked_by'] {
  const raw = asRecord(value);
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  return nodes.flatMap((item) => {
    const relation = asRecord(item);
    if (nullableString(relation.type)?.toLowerCase() !== 'blocks') return [];
    const other = asRecord(relation.issue).id ? asRecord(relation.issue) : asRecord(relation.relatedIssue);
    return [{
      id: nullableString(other.id),
      identifier: nullableString(other.identifier),
      state: stateName(other.state),
    }];
  });
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function validateOneOperation(query: string) {
  const withoutComments = query.replace(/#[^\n]*/g, ' ');
  const operations = withoutComments.match(/\b(query|mutation|subscription)\b/g) ?? [];
  if (operations.length !== 1) {
    throw new Error('linear_graphql_invalid_operation_count');
  }
}
