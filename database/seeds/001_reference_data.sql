-- Fixed IDs and timestamps give both clients the same reproducible reference data.
-- Re-running restores these reference values without deleting application data.
INSERT INTO users (id, name) VALUES
  ('user-alex', 'Алексей'),
  ('user-maria', 'Мария'),
  ('user-ivan', 'Иван')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO tags (id, name, color, created_at) VALUES
  ('tag-feature', 'Feature', '#2563EB', '2026-01-01 00:00:00'),
  ('tag-bug', 'Bug', '#DC2626', '2026-01-01 00:00:00'),
  ('tag-research', 'Research', '#7C3AED', '2026-01-01 00:00:00'),
  ('tag-priority', 'Priority', '#EA580C', '2026-01-01 00:00:00')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, created_at = EXCLUDED.created_at;
