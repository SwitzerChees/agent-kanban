import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

describe('external harness OpenAPI contract', () => {
  test('publishes the authenticated task and agent lifecycle operations', () => {
    const document = parse(readFileSync(path.resolve('public/openapi.yaml'), 'utf8')) as {
      openapi: string;
      paths: Record<string, Record<string, { operationId?: string; requestBody?: unknown }>>;
      components: { securitySchemes: Record<string, unknown>; schemas: Record<string, { properties?: Record<string, unknown> }> };
    };

    expect(document.openapi).toBe('3.1.0');
    expect(document.components.securitySchemes).toHaveProperty('bearerAuth');
    expect(document.paths['/api/projects/{projectId}/board']?.get?.operationId).toBe('getBoard');
    expect(document.paths['/api/projects/{projectId}/wiki/pages']?.get?.operationId).toBe('listWikiPages');
    expect(document.paths['/api/projects/{projectId}/wiki/pages']?.post?.operationId).toBe('createWikiPage');
    expect(document.paths['/api/wiki-pages/{pageId}']?.get?.operationId).toBe('getWikiPage');
    expect(document.paths['/api/wiki-pages/{pageId}']?.patch?.operationId).toBe('updateWikiPage');
    expect(document.paths['/api/wiki-pages/{pageId}']?.delete?.operationId).toBe('deleteWikiPage');
    expect(document.paths['/api/wiki-pages/{pageId}/move']?.post?.operationId).toBe('moveWikiPage');
    expect(document.paths['/api/projects/{projectId}/wiki/todo-lists']?.get?.operationId).toBe('listWikiTodoLists');
    expect(document.paths['/api/projects/{projectId}/wiki/todo-lists']?.post?.operationId).toBe('createWikiTodoList');
    expect(document.paths['/api/wiki-todo-lists/{listId}/items']?.post?.operationId).toBe('addWikiTodoItem');
    expect(document.paths['/api/wiki-todo-items/{itemId}']?.patch?.operationId).toBe('updateWikiTodoItem');
    expect(document.paths['/api/wiki-todo-items/{itemId}']?.delete?.operationId).toBe('deleteWikiTodoItem');
    expect(document.paths['/api/wiki-pages/{pageId}/images']?.get?.operationId).toBe('listWikiImages');
    expect(document.paths['/api/wiki-pages/{pageId}/images']?.post?.operationId).toBe('uploadWikiImage');
    expect(document.paths['/api/wiki-images/{imageId}']?.get?.operationId).toBe('getWikiImageContent');
    expect(document.paths['/api/wiki-images/{imageId}/annotation']?.patch?.operationId).toBe('updateWikiImageAnnotation');
    expect(document.components.schemas.WikiPageWrite?.properties).toHaveProperty('expectedUpdatedAt');
    expect(document.paths['/api/tasks/{taskId}/agent/queue']?.post?.operationId).toBe('queueTaskAgent');
    expect(document.paths['/api/tasks/{taskId}/agent/cancel']?.post?.operationId).toBe('cancelTaskAgent');
    expect(document.paths['/api/tasks/{taskId}/agent/retry']?.post?.operationId).toBe('retryTaskAgent');
    expect(document.components.schemas.TaskUpdate?.properties).not.toHaveProperty('agentStatus');
    expect(document.components.schemas.TaskCreate?.properties).toMatchObject({
      agentHarness: { $ref: '#/components/schemas/AgentHarness' },
      reasoningEffort: { $ref: '#/components/schemas/ReasoningEffort' },
    });

    const operationIds = Object.values(document.paths)
      .flatMap((pathItem) => Object.values(pathItem).map((operation) => operation.operationId))
      .filter(Boolean);
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });
});
