-- Scrabbleish v1 schema. Everything the online game needs lives here; the
-- single-player robot game is stored entirely on the device.

CREATE TABLE IF NOT EXISTS players (
  id              TEXT PRIMARY KEY,
  device_key_hash TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id              TEXT PRIMARY KEY,
  mode            TEXT NOT NULL CHECK (mode IN ('bot', 'human', 'agent')),
  status          TEXT NOT NULL CHECK (status IN ('waiting', 'active', 'done')),
  seed            TEXT NOT NULL,
  bag_json        TEXT NOT NULL,
  board_json      TEXT NOT NULL,
  turn_seat       INTEGER NOT NULL DEFAULT 0,
  version         INTEGER NOT NULL DEFAULT 0,
  scores_json     TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  invite_code     TEXT,
  creator_seat    INTEGER NOT NULL DEFAULT 0,
  difficulty      INTEGER,
  scoreless_turns INTEGER NOT NULL DEFAULT 0,
  move_count      INTEGER NOT NULL DEFAULT 0,
  ended_reason    TEXT,
  last_move_json  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_games_invite
  ON games (invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_updated ON games (updated_at);

CREATE TABLE IF NOT EXISTS game_players (
  game_id      TEXT NOT NULL,
  seat         INTEGER NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('human', 'bot', 'agent')),
  player_id    TEXT,
  rack_json    TEXT NOT NULL,
  score        INTEGER NOT NULL DEFAULT 0,
  display_name TEXT NOT NULL,
  PRIMARY KEY (game_id, seat)
);

CREATE TABLE IF NOT EXISTS moves (
  game_id      TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  seat         INTEGER NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('play', 'exchange', 'pass', 'surrender', 'end')),
  payload_json TEXT NOT NULL,
  score        INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  game_id    TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  seat       INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('human', 'agent', 'system')),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);

CREATE TABLE IF NOT EXISTS match_queue (
  id         TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL,
  mode       TEXT NOT NULL,
  difficulty INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'waiting',
  game_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_open
  ON match_queue (mode, status, created_at);

CREATE TABLE IF NOT EXISTS agent_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id      TEXT NOT NULL,
  seat         INTEGER NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_tokens_game ON agent_tokens (game_id, seat);
