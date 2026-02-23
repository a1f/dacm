UPDATE settings SET key = 'last_task_id' WHERE key = 'last_project_id';
UPDATE settings SET key = 'last_project_id' WHERE key = 'last_workspace_id';
UPDATE settings SET value = REPLACE(value, '{project_name}', '{task_name}')
  WHERE key = 'worktree_branch_pattern';
ALTER TABLE projects RENAME COLUMN workspace_id TO project_id;
ALTER TABLE projects RENAME TO tasks;
ALTER TABLE workspaces RENAME TO projects;
