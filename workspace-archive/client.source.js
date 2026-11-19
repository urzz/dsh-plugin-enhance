import { registerWorkspaceArchive } from './workspace-client.js';

export const inject = ['slots', 'locale', 'contextMenus', 'workspaces', 'sessions', 'remoteAccess'];
export const apply = registerWorkspaceArchive;
