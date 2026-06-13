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
│   │   ├── bootstrap/
│   │   ├── login/
│   │   ├── main/
│   │   ├── recambios/
│   │   ├── rutas/
│   │   ├── stocks/
│   │   ├── vehiculos/
│   │   ├── detalles/
│   │   ├── theme.css       # Variables CSS para modo claro/oscuro
│   │   └── style.css       # Estilos globales
│   ├── js/
│   │   ├── axios/
│   │   └── bootstrap/
│   └── images/
│       ├── icons/
│       └── Vehiculos/       # Imágenes subidas de bicicletas
├── attachments/            # Archivos subidos por usuarios
├── controllers/            # Controladores PHP
│   ├── attach.php          # Subida de archivos e imágenes
│   ├── compra.php
│   ├── grupo.php
│   ├── helper.php
│   ├── login.php           # Autenticación y persistencia de tema
│   ├── log.php
│   ├── mantenimiento.php
│   ├── recambio.php
│   ├── ruta.php
│   ├── selector.php
│   ├── stock.php
│   ├── translate.php
│   └── vehiculo.php        # CRUD de vehículos
├── database/               # Base de datos
│   ├── app.db              # Archivo SQLite principal
│   ├── gesbike.db
│   └── backups/            # Copias de seguridad
├── helpers/                # Utilidades y configuración
│   ├── backup.php
│   ├── config.php          # Carga de variables de entorno (.env)
│   └── helper.php          # Funciones auxiliares PHP
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
│   └── vehiculo.php
├── repositories/           # Repositorios (acceso a datos SQL)
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
│   └── vehiculo.php        # CRUD incluye LEFT JOIN con ultimos_kms
├── services/               # Servicios JavaScript (frontend)
│   ├── compras/
│   ├── componentes/
│   │   └── sitebar.js      # Menú lateral con navegación
│   ├── detalles/
│   ├── helpers/
│   │   └── helper.js       # Utilidades compartidas (formatos, API calls)
│   ├── login/
│   │   └── login.js        # Autenticación y autologin
│   ├── logs/
│   ├── main/
│   ├── mantenimientos/
│   ├── recambios/
│   ├── rutas/
│   ├── stocks/
│   ├── theme/
│   │   └── theme.js        # Cambio de modo claro/oscuro con persistencia
│   ├── translate/
│   └── vehiculos/
│       └── vehiculo.js     # CRUD vehículos + totalizador km
├── views/                  # Vistas PHP
│   ├── components/
│   │   ├── footer.php
│   │   ├── header_info.php
│   │   ├── menu.php
│   │   ├── menu_actions.php
│   │   └── sidebar.php     # Menú lateral con theme toggle
│   ├── compras/
│   ├── detalles/
│   ├── mantenimientos/
│   ├── recambios/
│   ├── rutas/
│   ├── stocks/
│   ├── vehiculos/
│   │   ├── vehiculo.php    # Listado de vehículos con totalizador km
│   │   └── form.php        # Alta/edición con subida de imagen
│   └── main.php            # Dashboard principal
├── tests/
├── photos/
├── index.php               # Login moderno con card y tema
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
- **CSS3** - Estilos (Bootstrap 5 + CSS variables para theming)
- **JavaScript (ES6+)** - Interactividad
- **Axios** - Cliente HTTP
- **SweetAlert2** - Alertas y dialogs
- **FontAwesome 6** - Iconografía

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

- **index.php** - Pantalla de login con diseño moderno (card centrada, gradientes, iconos en inputs)
- **views/main.php** - Dashboard principal (requiere autenticación)
- **api/*/** - Endpoints de la API

## 6. Base de Datos

### Esquema de Tablas

#### usuarios
Gestión de usuarios del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK autoincremental |
| rol_id | INTEGER | FK a roles |
| nombre | TEXT | Nombre de usuario |
| password | TEXT | Contraseña |
| activo | INTEGER | Estado lógico |
| theme | TEXT | Preferencia de tema ('light' o 'dark') |

#### vehiculos
Gestión de bicicletas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK autoincremental |
| fecha_compra | TEXT | Fecha de adquisición |
| anagrama | TEXT | Identificador corto |
| nombre | TEXT | Nombre de la bicicleta |
| kms_inicio | INTEGER | KMs iniciales |
| imagen | TEXT | Nombre del archivo de imagen en assets/images/Vehiculos/ |
| observaciones | TEXT | Notas adicionales |
| puntero | TEXT | Icono representativo (bullet_nombre.png) |
| categoria | TEXT | Tipo: 'pulmonar' o 'electrica' |
| usuario_id | INTEGER | FK a usuarios |
| is_active | INTEGER | Estado lógico (1=activo, 0=inactivo) |
| created_at | TEXT | Fecha de creación |
| modified_at | TEXT | Fecha de modificación |
| deleted_at | TEXT | Fecha de borrado lógico |

#### ultimos_kms
Registro del último kilometraje conocido por vehículo.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| vehiculo_id | INTEGER | FK única a vehiculos |
| kms | INTEGER | Últimos kilómetros registrados |
| fecha_actualizacion | DATETIME | Timestamp de actualización |

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
| observaciones | TEXT | Notas |
| motor_id | INTEGER | FK a motores |
| is_active | INTEGER | Estado lógico |
| created_at / modified_at / deleted_at | TEXT | Timestamps |

#### recambios
Catálogo de piezas y componentes.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | PK |
| nombre | TEXT | Nombre del recambio |
| referencia | TEXT | Número de referencia |
| grupo_id | INTEGER | FK a grupos |
| vehiculo_id | INTEGER | FK a vehiculos |
| imagen | TEXT | Ruta a imagen en assets/images/Recambios/ |
| observaciones | TEXT | Notas |
| is_active | INTEGER | Estado lógico |

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
| is_active | INTEGER | Estado lógico |

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

## 7. Flujo de Trabajo

### Autenticación

1. Usuario accede a `index.php` (login moderno con card, gradientes, iconos)
2. Ingresa credenciales
3. JavaScript llama a `api/login/login.php?auth`
4. Sistema valida contra tabla `usuarios`
5. Crea sesión PHP
6. Recupera preferencia de tema del usuario (`theme`) y la guarda en sessionStorage
7. Redirige a `views/main.php`

### Gestión de Vehículos

1. Usuario navega al menú "Vehículos" desde el sidebar
2. Visualiza listado con tarjetas: imagen (100x70px), nombre, anagrama, badge activo (verde) / inactivo (rojo), fecha de compra, km actuales
3. **Totalizador**: barra superior con suma de km de todos los vehículos
4. Tap en una tarjeta abre menú contextual (editar / eliminar)
5. **Alta/Edición**: formulario con imagen (cámara o galería), nombre, anagrama, fecha compra, km iniciales, categoría (pulmonar / eléctrica), observaciones
6. **Imagen**: se sube a `assets/images/Vehiculos/` con nombre UUID, compresión automática a 200KB máx
7. **Borrado lógico**: `is_active = 0`, la card se muestra con badge rojo "Inactivo"

### Gestión de Mantenimientos

1. Usuario selecciona vehículo en el dashboard
2. Visualiza mantenimientos asociados agrupados por fecha/kms
3. Puede agregar nuevo mantenimiento:
   - Seleccionar operación
   - Elegir recambio (si aplica)
   - Indicar localizaciones
   - Registrar kms, precio, observaciones
4. Sistema guarda en tabla `mantenimientos`
5. Opcionalmente adjunta imágenes

### Sistema de Temas (Claro / Oscuro)

1. Cada usuario tiene su preferencia almacenada en `usuarios.theme`
2. Al loguearse, el tema se carga desde la BD y se aplica a todas las páginas
3. El botón de cambio está en el menú lateral (icono luna/sol)
4. Usa variables CSS (`:root` para modo claro, `[data-theme="dark"]` para oscuro)
5. La preferencia se guarda vía `api/login/login.php?setTheme`
6. Todas las vistas incluyen `assets/css/theme.css` y `services/theme/theme.js`
7. Transiciones suaves (0.3s ease) en colores de fondo, texto, bordes

### API

Los endpoints siguen el patrón:
```
api/{recurso}/{recurso}.php?{action}
```

Ejemplo: `api/vehiculos/vehiculo.php?getVehiculos`

#### Endpoints de Vehículos
| Acción | Método | Descripción |
|--------|--------|-------------|
| getVehiculos | POST | Lista todos los vehículos del usuario (con LEFT JOIN ultimos_kms) |
| getVehiculoById | POST | Obtiene un vehículo por ID |
| nuevoVehiculo | POST | Crea un nuevo vehículo |
| editarVehiculo | POST | Actualiza un vehículo |
| eliminarVehiculo | POST | Borrado lógico (is_active=0) |
| getMotorVehiculo | POST | Obtiene datos del motor del vehículo |
| uploadVehiculoImage | POST | Sube imagen a assets/images/Vehiculos/ |

#### Endpoints de Login
| Acción | Método | Descripción |
|--------|--------|-------------|
| auth | POST | Autenticación de usuario |
| setTheme | POST | Guarda preferencia de tema (light/dark) |

### Subida de Imágenes

El controlador `controllers/attach.php` maneja la subida. Según el parámetro `source`:
- `vehiculo` → `assets/images/Vehiculos/`
- `recambio` → `assets/images/Recambios/`
- cualquier otro → `attachments/`

Todas las imágenes se comprimen automáticamente a un máximo de 200KB usando la función `compressImage()`.

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
8. **Añadir theme.css** enlace en el `<head>` de la vista
9. **Añadir theme.js** y `initTheme()` en el `onload`

### Convenciones

- **snake_case** para nombres de archivos PHP
- **camelCase** para funciones JavaScript
- Tablas con **is_active** para borrado lógico
- Timestamps en **created_at**, **modified_at**, **deleted_at**
- IDs autoincrementales como clave primaria
- **CSS variables** para colores (nunca valores fijos), definidas en `theme.css`
- Transiciones suaves en cambios de color (`transition: xxx 0.3s ease`)

## 10. Notas Adicionales

- El proyecto utiliza **borrado lógico** (soft delete) mediante el campo `deleted_at`
- Las imágenes de bicicletas se almacenan en `assets/images/Vehiculos/` con nombre UUID
- Las imágenes de recambios se almacenan en `assets/images/Recambios/` con nombre UUID
- El sistema soporta múltiples usuarios con roles diferenciados
- Incluye gestión de permisos a nivel de tabla `roles` y `operaciones`
- Las rutas GPX pueden importarse para registrar actividades
- **Tema oscuro/claro**: persistencia por usuario en BD, 70+ variables CSS, activable desde el menú lateral
- **Login moderno**: card centrada con gradiente, iconos en inputs, versión mostrada al pie, animación de entrada
- **Totalizador km**: en la pantalla de vehículos se muestra una tarjeta con la suma de km actuales de todos los vehículos
- **Categoría de vehículo**: solo dos valores permitidos: `pulmonar` o `electrica`
- **Autologin**: el formulario de login detecta credenciales precargadas por gestores de contraseñas y ejecuta el login automáticamente
