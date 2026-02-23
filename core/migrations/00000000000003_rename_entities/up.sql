ALTER TABLE projects RENAME TO workspaces;
ALTER TABLE tasks RENAME TO projects;
ALTER TABLE projects RENAME COLUMN project_id TO workspace_id;
UPDATE settings SET value = REPLACE(value, '{task_name}', '{project_name}')
  WHERE key = 'worktree_branch_pattern';
UPDATE settings SET key = 'last_workspace_id' WHERE key = 'last_project_id';
UPDATE settings SET key = 'last_project_id' WHERE key = 'last_task_id';
