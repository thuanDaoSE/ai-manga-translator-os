DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'deepkoma') THEN
        CREATE ROLE deepkoma WITH LOGIN PASSWORD 'secretpassword';
    END IF;
END
$$;

SELECT 'CREATE DATABASE manga_studio OWNER deepkoma'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'manga_studio')\gexec

GRANT ALL PRIVILEGES ON DATABASE manga_studio TO deepkoma;
