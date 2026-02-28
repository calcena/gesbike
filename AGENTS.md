# GesBike - Sistema de Gestión de Mantenimiento de Bicicletas

## 1. Descripción General

GesBike es una aplicación web para la gestión integral de mantenimiento de bicicletas. Permite gestionar vehículos (bicicletas), mantenimientos, recambios, compras, rutas y operaciones de mantenimiento. El sistema está diseñado para que usuarios particulares o pequeños talleres puedan llevar un control exhaustivo de sus bicicletas y sus mantenimientos.

## 2. Arquitectura

El proyecto sigue el patrón **MVC (Model-View-Controller)** con una capa adicional de **Repositories** para la acceso a datos. También cuenta con una capa de **API** para comunicación asíncrona y una capa de **Servicios JavaScript** para el frontend.

### Capas de la Arquitectura

```
┌─────────────────────────────────────────────┐
│                Views (Vistas)               │
│         PHP + HTML + JavaScript            │
├─────────────────────────────────────────────┤
│              Controllers                    │
│         Lógica de control y flujo           │
├─────────────────────────────────────────────┤
│               Models                        │
│         Definición de entidades            │
├─────────────────────────────────────────────┤
│             Repositories                     │
│         Acceso a datos y queries            │
├─────────────────────────────────────────────┤
│           DatabaseConnection                 │
│              SQLite (PDO)                    │
└─────────────────────────────────────────────┘
```

## 3. Estructura de Directorios

```
gesBike/
├── api/                    # Endpoints API REST
│   ├── compras/
│   ├── grupos/
│   ├── login/
│   ├── log/
│   ├── mantenimientos/
│   ├── recambios/
│   ├── rutas/
│   ├── stocks/
│   └── vehiculos/
├── assets/                 # Recursos estáticos
│   ├── css/
│   ├── js/
│   │   ├── axios/
│   │   └── bootstrap/
│   └── images/
├── attachments/            # Archivos subidos por usuarios
├── controllers/            # Controladores PHP
│   ├── attach.php
│   ├── compra.php
│   ├── grupo.php
│   ├── helper.php
│   ├── login.php
│   ├── log.php
│   ├── mantenimiento.php
│   ├── recambio.php
│   ├── ruta.php
│   ├── selector.php
│   ├── stock.php
│   ├── translate.php
│   └── vehiculo.php
├── database/               # Base de datos
│   ├── app.db              # Archivo SQLite principal
│   ├── gesbike.db
│   └── backups/            # Copias de seguridad
├── helpers/                # Utilidades y configuración
│   ├── backup.php
│   ├── config.php
│   └── helper.php
├── jobs/                   # Tareas programadas (cron)
│   └── cron_email.php
├── models/                 # Modelos PHP
│   ├── attach.php
│   ├── compra.php
│   ├── grupo.php
│   ├── helper.php
│   ├── login.php
│   ├── log.php
│   ├── mantenimiento.php
│   ├── recambio.php
│   ├── ruta.php
│   ├── selector.php
│   ├── stock.php
│   ├── translate.php
│   ├── vehiculo.php
├── repositories/           # Repositorios (acceso a datos)
│   ├── attach.php
│   ├── compra.php
│   ├── helper.php
│   ├── login.php
│   ├── log.php
│   ├── mantenimiento.php
│   ├── recambio.php
│   ├── ruta.php
│   ├── selector.php
│   ├── stock.php
│   ├── translate.php
│   └── vehiculo.php
├── services/               # Servicios JavaScript (frontend)
│   ├── compras/
│   ├── componentes/
│   ├── detalles/
│   ├── helpers/
│   ├── login/
│   ├── logs/
│   ├── main/
│   ├── mantenimientos/
│   ├── recambios/
│   ├── rutas/
│   ├── stocks/
│   ├── translate/
│   └── vehiculos/
├── views/                  # Vistas PHP
│   ├── components/
│   ├── compras/
│   ├── detalles/
│   ├── mantenimientos/
│   ├── recambios/
│   ├── rutas/
│   ├── stocks/
│   ├── vehiculos/
│   └── main.php
├── tests/                  # Pruebas y scripts utilitarios
├── photos/                 # Fotos y medios
├── index.php               # Punto de entrada (login)
├── .env                    # Variables de entorno
└── compress_existing_images.php
```

## 4. Tecnologías Utilizadas

### Backend
- **PHP 7.4+** - Lenguaje del servidor
- **SQLite** - Base de datos embebida
- **PDO** - Acceso a datos

### Frontend
- **HTML5** - Estructura
- **CSS3** - Estilos (Bootstrap 5)
- **JavaScript (ES6+)** - Interactividad
- **Axios** - Cliente HTTP
- **SweetAlert2** - Alertas y dialogs

### Herramientas
- **Git** - Control de versiones
- **PHP Sessions** - Gestión de autenticación

## 5. Configuración

### Variables de Entorno (.env)

```env
APP_ENV=local
APP_VERSION=1.0-0
APP_NAME=Mantenimientos bicicletas
DB_TYPE=sqlite
DB_PATH=../../database/app.db
```

### Puntos de Entrada

- **index.php** - Pantalla de login
- **views/main.php** - Dashboard principal (requiere autenticación)
- **api/*/** - Endpoints de la API

## 6. Base de Datos

### Esquema de Tablas

#### vehiculos
Gestión de bicicletas/usuarios del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK autoincremental |
| fecha_compra | TEXT | Fecha de adquisición |
| anagrama | TEXT | Identificador corto |
| nombre | TEXT | Nombre de la bicicleta |
| kms_inicio | INTEGER | KMs iniciales |
| imagen | TEXT | Ruta a imagen |
| observaciones | TEXT | Notas adicionales |
| is_active | INTEGER | Estado lógico |

#### mantenimientos
Registro de todas las operaciones de mantenimiento.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| vehiculo_id | INTEGER | FK a vehiculos |
| fecha | TEXT | Fecha del mantenimiento |
| kms | INTEGER | KMs en el momento |
| operacion_id | INTEGER | FK a operaciones |
| recambio_id | INTEGER | FK a recambios |
| grupo_id | INTEGER | FK a grupos |
| localizacion_id | INTEGER | FK a localizaciones |
| Precio | TEXT | Costo |
| Unidades | INTEGER | Cantidad |

#### recambios
Catálogo de piezas y componentes.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| nombre | TEXT | Nombre del recambio |
| referencia | TEXT | Número de referencia |
| grupo_id | INTEGER | FK a grupos |
| vehiculo_id | INTEGER | FK a vehiculos |
| imagen | TEXT | Ruta a imagen |

#### compras
Registro de compras de recambios.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| recambio_id | INTEGER | FK a recambios |
| proveedor | TEXT | Nombre del proveedor |
| precio | REAL | Costo unitario |
| unidades | INTEGER | Cantidad comprada |
| fecha | TEXT | Fecha de compra |

#### rutas
Registro de rutas realizadas con las bicicletas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| vehiculo_id | INTEGER | FK a vehiculos |
| fecha_inicio | DATETIME | Inicio de ruta |
| fecha_fin | DATETIME | Fin de ruta |
| tiempo_total | TEXT | Duración total |
| kms | DECIMAL | Kilómetros |
| metros_ascenso | INTEGER | Desnivel positivo |
| velocidad_media | DECIMAL | Velocidad promedio |
| potencia_promedio_w | INTEGER | Potencia media |

#### operaciones
Catálogo de operaciones posibles (sustituir, engrasar, limpiar, etc.)

#### grupos
Agrupadores lógicos de recambios (frenos, transmisión, suspensión)

#### localizaciones
Ubicaciones en la bicicleta (delante, detrás, izquierda, derecha)

#### motores
Control de horas/motor (para bicicletas eléctricas)

#### adjuntos
Archivos adjuntos a mantenimientos

#### logs
Histórico de acciones de usuarios

#### usuarios y roles
Gestión de usuarios y permisos

## 7. Flujo de Trabajo

### Autenticación

1. Usuario accede a `index.php`
2. Ingresa credenciales
3. JavaScript llama a `api/login/login.php`
4. Sistema valida contra tabla `usuarios`
5. Crea sesión PHP
6. Redirige a `views/main.php`

### Gestión de Mantenimientos

1. Usuario selecciona vehículo en el dashboard
2. Visualiza mantenimientos asociados
3. Puede agregar nuevo mantenimiento:
   - Seleccionar operación
   - Elegir recambio (si aplica)
   - Indicar localizaciones
   - Registrar kms, precio, observaciones
4. Sistema guarda en tabla `mantenimientos`
5. Opcionalmente adjunta imágenes

### API

Los endpoints siguen el patrón:
```
api/{recurso}/{recurso}.php?{action}
```

Ejemplo: `api/vehiculos/vehiculo.php?getVehiculosById`

## 8. Tareas Programadas (Jobs)

### cron_email.php
Script para envío de emails automatizados mediante cron. Utiliza conexión SMTP directa a Gmail.

```bash
# Ejemplo de configuración crontab
0 * * * * php /var/www/html/gesBike/jobs/cron_email.php
```

## 9. Desarrollo y Contribución

### Estructura de un Nuevo Módulo

Para agregar una nueva entidad:

1. **Crear repositorio** en `repositories/{entidad}.php`
2. **Crear modelo** en `models/{entidad}.php`
3. **Crear controlador** en `controllers/{entidad}.php`
4. **Crear API** en `api/{entidades}/{entidad}.php`
5. **Crear vista** en `views/{entidades}/{entidad}.php`
6. **Crear servicio JS** en `services/{entidades}/{entidad}.js`
7. **Agregar tabla** en base de datos

### Convenciones

- ** snake_case** para nombres de archivos PHP
- **camelCase** para funciones JavaScript
- Tablas con **is_active** para borrado lógico
- Timestamps en **created_at**, **modified_at**, **deleted_at**
- IDs autoincrementales como clave primaria

## 10. Notas Adicionales

- El proyecto utiliza **borrado lógico** (soft delete) mediante el campo `deleted_at`
- Las imágenes se almacenan en `attachments/` y se referencian por UUID
- El sistema soporta múltiples usuarios con roles diferenciados
- Incluye gestión de permisos a nivel de tabla `roles` y `operaciones`
- Las rutas GPX pueden importarse para registrar actividades
