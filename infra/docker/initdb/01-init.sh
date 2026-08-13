#!/bin/bash
# Creates the test database and installs the extensions the schema depends on
# (geospatial branch search, trigram product search, UUID generation) in both
# the development and test databases.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
  SELECT 'CREATE DATABASE ${POSTGRES_DB}_test'
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}_test')\gexec
SQL

for db in "$POSTGRES_DB" "${POSTGRES_DB}_test"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-'SQL'
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS citext;
SQL
done
