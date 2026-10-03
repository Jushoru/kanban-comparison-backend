CREATE TABLE users (
  id text PRIMARY KEY,
  name varchar(255) NOT NULL
);

CREATE TABLE boards (
  id text PRIMARY KEY,
  title varchar(255) NOT NULL,
  description text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE lists (
  id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT lists_board_position_key UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE cards (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  description text,
  assignee_id text REFERENCES users(id) ON DELETE SET NULL,
  position integer NOT NULL CHECK (position >= 0),
  completed boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cards_list_position_key UNIQUE (list_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE comments (
  id text PRIMARY KEY,
  card_id text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  text text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id text PRIMARY KEY,
  name varchar(100) NOT NULL,
  color varchar(50) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE card_tags (
  card_id text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag_id text NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);

-- Composite unique indexes above cover board_id/list_id FKs and position ordering.
CREATE INDEX boards_created_at_idx ON boards (created_at, id);
CREATE INDEX lists_created_at_idx ON lists (created_at, id);
CREATE INDEX cards_assignee_id_idx ON cards (assignee_id);
CREATE INDEX cards_list_created_at_idx ON cards (list_id, created_at, id);
CREATE INDEX cards_created_at_idx ON cards (created_at, id);
CREATE INDEX comments_card_created_at_idx ON comments (card_id, created_at, id);
CREATE INDEX comments_user_id_idx ON comments (user_id);
CREATE INDEX comments_created_at_idx ON comments (created_at, id);
CREATE INDEX tags_created_at_idx ON tags (created_at, id);
CREATE INDEX card_tags_tag_id_idx ON card_tags (tag_id);
