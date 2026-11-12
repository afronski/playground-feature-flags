-- Create the Unleash database (Unleash server will run its own migrations)
CREATE DATABASE unleash;

-- Create the sample app database and seed data
CREATE DATABASE sampleapp;

\connect sampleapp;

CREATE TABLE colours (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  hex_value VARCHAR(7) NOT NULL
);

INSERT INTO colours (name, hex_value) VALUES
  ('blue', '#3B82F6'),
  ('green', '#22C55E');
