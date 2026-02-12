CREATE TABLE settings (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO settings (key, value) VALUES
    ('theme', 'system'),
    ('prevent_sleep', 'false'),
    ('code_font_family', '"SF Mono", "Fira Code", monospace'),
    ('code_font_size', '13'),
    ('terminal_font_family', '"SF Mono", "Fira Code", "Menlo", monospace'),
    ('terminal_font_size', '13'),
    ('worktree_base_path', ''),
    ('worktree_branch_pattern', 'feature/{task_name}');
