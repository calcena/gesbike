CREATE TABLE
    IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rol_id INTEGER,
        nombre TEXT,
        password TEXT,
        activo INTEGER DEFAULT 1
    );

create table
    if not exists roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        activo INTEGER default 1
    );