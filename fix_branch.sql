UPDATE bots SET configuration = (configuration::jsonb || '{"git_branch": "claude/elegant-brown-n7xf4v"}'::jsonb)::json WHERE configuration->>'git_branch' = 'main';
