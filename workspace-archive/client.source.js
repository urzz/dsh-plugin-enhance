import { registerWorkspaceArchive } from './workspace-client.js';

export const inject = ['slots', 'locale', 'contextMenus', 'workspaces', 'sessions', 'uiSession'];
export const apply = registerWorkspaceArchive;
