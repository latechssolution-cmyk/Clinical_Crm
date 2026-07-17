-- Business knowledge base for the AI receptionist: free-form topic/info entries
-- (pricing ranges, services offered, service areas, policies...) the agent can
-- answer caller questions from. Editable per tenant in Settings -> AI.
alter table agent_configs
  add column if not exists knowledge jsonb not null default '[]'::jsonb;
