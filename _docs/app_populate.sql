insert into
    roles (nombre)
values
    ('admin');

insert into
    roles (nombre)
values
    ('manager');

insert into
    roles (nombre)
values
    ('user');

insert into
    usuarios (nombre, password, rol_id)
values
    ('dcc', '1012', 1);

insert into
    usuarios (nombre, password, rol_id)
values
    ('virgi', '7477', 1);

create table
    if not exists ultimos_kms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehiculo_id INTEGER NOT NULL UNIQUE,
        kms INTEGER,
        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
    );

create table
    rutas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehiculo_id INTEGER null,
        fecha_inicio datetime,
        fecha_fin datetime,
        tiempo_total text null,
        tiempo_movimiento text null,
        kms decimal(10,3),
        metros_ascenso integer,
        metros_descenso integer,
        altitud_maxima integer,
        velocidad_media decimal(10,1),
        velocidad_maxima decimal(10,1),
        potencia_promedio_w int,
        calorias int,
        pct_subida decimal(10,1),
        pct_plano decimal(10,1),
        pct_bajada decimal(10,1),
        tiempo_subida text,
        tiempo_plano text,
        tiempo_bajada text,
        observaciones text,
        origen text,
        activo boolean default true
    );