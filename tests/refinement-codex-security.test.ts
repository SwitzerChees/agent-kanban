import { describe, expect, test } from 'vitest';
import {
  buildRefinementSecurityConfig,
  buildRefinementThreadSecurityParams,
  buildRefinementTurnSecurityParams,
  parseRefinementCommand,
  REFINEMENT_PERMISSION_PROFILE,
  retainRefinementImageResult,
} from '../server/lib/refinement-codex';
import { REFINEMENT_TOOL_NAMESPACE } from '../server/lib/refinement-tools';

describe('refinement Codex security contract', () => {
  test('defines a named minimal plus workspace-read profile with network disabled', () => {
    const config = buildRefinementSecurityConfig() as any;
    expect(config.permissions[REFINEMENT_PERMISSION_PROFILE]).toEqual({
      filesystem: {
        ':minimal': 'read',
        ':workspace_roots': { '.': 'read' },
      },
      network: { enabled: false },
    });
    expect(config.web_search).toBe('disabled');
    expect(config.mcp_servers).toEqual({});
    expect(config.apps._default).toMatchObject({
      enabled: false,
      destructive_enabled: false,
      open_world_enabled: false,
    });
    expect(config.shell_environment_policy).toEqual({
      inherit: 'none',
      ignore_default_excludes: false,
      set: { PATH: '/usr/bin:/bin' },
    });
  });

  test('removes web, apps, plugins, shell, browser, and multi-agent surfaces while retaining image generation', () => {
    const features = (buildRefinementSecurityConfig() as any).features;
    for (const key of [
      'shell_tool',
      'unified_exec',
      'request_permissions_tool',
      'hooks',
      'code_mode_host',
      'code_mode_only',
      'multi_agent',
      'multi_agent_v2',
      'enable_fanout',
      'apps',
      'enable_mcp_apps',
      'plugins',
      'remote_plugin',
      'plugin_sharing',
      'tool_suggest',
      'standalone_web_search',
      'web_search_request',
      'web_search_cached',
      'skill_mcp_dependency_install',
      'in_app_browser',
      'browser_use',
      'browser_use_full_cdp_access',
      'browser_use_external',
      'computer_use',
    ]) {
      expect(features[key], key).toBe(false);
    }
    expect(features.image_generation).toBe(true);
    expect(features.code_mode).toMatchObject({
      enabled: false,
      direct_only_tool_namespaces: [REFINEMENT_TOOL_NAMESPACE, 'image_gen'],
    });
    expect(features.code_mode.excluded_tool_namespaces).toEqual(expect.arrayContaining([
      'mcp__codex_apps',
      'web',
      'multi_agent_v1',
      'multi_agent_v2',
    ]));
  });

  test('applies identical sticky thread hardening on start/resume and disables turn environments', () => {
    const workspace = '/srv/project';
    const thread = buildRefinementThreadSecurityParams(workspace, 'gpt-5.6-sol') as any;
    expect(thread).toMatchObject({
      cwd: workspace,
      runtimeWorkspaceRoots: [workspace],
      model: 'gpt-5.6-sol',
      approvalPolicy: 'never',
      permissions: REFINEMENT_PERMISSION_PROFILE,
    });
    expect(thread).not.toHaveProperty('sandbox');
    expect(thread).not.toHaveProperty('sandboxPolicy');
    expect(thread.config).toEqual(buildRefinementSecurityConfig());

    const turn = buildRefinementTurnSecurityParams(workspace, 'gpt-5.6-sol') as any;
    expect(turn).toEqual({
      cwd: workspace,
      runtimeWorkspaceRoots: [workspace],
      environments: [],
      model: 'gpt-5.6-sol',
      approvalPolicy: 'never',
    });
    // The selected profile is sticky. Re-sending it on turn/start is rejected
    // by app-server 0.144.3 because turn config lacks the profile catalog.
    expect(turn).not.toHaveProperty('permissions');
  });

  test('parses app-server argv without shell expansion or interpolation', () => {
    expect(parseRefinementCommand('codex app-server --flag "two words"')).toEqual([
      'codex',
      'app-server',
      '--flag',
      'two words',
    ]);
    expect(parseRefinementCommand('codex app-server "$HOME"; touch /tmp/never')).toEqual([
      'codex',
      'app-server',
      '$HOME;',
      'touch',
      '/tmp/never',
    ]);
    expect(() => parseRefinementCommand('codex app-server "unfinished')).toThrow(/Invalid quoting/);
    expect(() => parseRefinementCommand('codex\napp-server')).toThrow(/Invalid Codex/);
  });

  test('does not retain duplicate or unbounded inline image payloads', () => {
    expect(retainRefinementImageResult('inline-data', null)).toBe('inline-data');
    expect(retainRefinementImageResult('inline-data', '/srv/project/generated.png')).toBe('');
    expect(retainRefinementImageResult('x'.repeat(1024 * 1024 + 1), null)).toBe('');
  });
});
