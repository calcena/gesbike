<?php
$GLOBALS['pathUrl'] = './';


function load_env($max_levels = 3)
{
    $filename = ".env";
    $file = false;
    $path = '';
    $lines = [];

    error_log("Iniciando carga de .env desde: " . __FILE__);

    // Buscar .env en niveles superiores
    for ($level = 0; $level <= $max_levels; $level++) {
        $path = str_repeat("../", $level) . $filename;
        if (file_exists($path)) {
            $file = fopen($path, "r");
            if ($file !== false) {
                error_log("✅ .env encontrado en: $path");
                break;
            } else {
                error_log("❌ No se pudo abrir: $path");
            }
        } else {
            error_log("❌ No existe: $path");
        }
    }

    // Último intento: relativo a este archivo
    if (!$file) {
        $path = __DIR__ . "/../" . $filename;
        if (file_exists($path)) {
            $file = fopen($path, "r");
            if ($file !== false) {
                error_log("✅ .env encontrado en: $path (último intento)");
            } else {
                error_log("❌ No se pudo abrir (último intento): $path");
            }
        } else {
            error_log("❌ Ni siquiera existe en: $path");
        }
    }

    // Si no se pudo abrir
    if (!$file) {
        error_log("🔴 ERROR: No se pudo abrir el archivo .env en ningún lugar");
        return false;
    }

    // Leer líneas
    while (($line = fgets($file)) !== false) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        if (strpos($line, '=') !== false) {
            list($key, $value) = array_map('trim', explode('=', $line, 2));
            $value = preg_replace('/[\x00-\x1F\x7F\x{2000}-\x{200F}\x{2028}-\x{202F}]/u', '', $value);
            $value = trim($value, "\"' \t\n\r\0\x0B");
            $key = trim($key);
            $lines[$key] = $value;
            error_log("🔹 Leído: $key = '$value'");
        }
    }
    fclose($file);
    // === Definir constantes ===
    $required = [
        'APP_ENV',
        'APP_NAME',
        'APP_VERSION',
        'API_KEY_FRONT',
        'API_KEY_BACK',
        'DB_TYPE',
        'DB_PATH',
        'VOICE_DB_PATH',
    ];

    foreach ($required as $key) {
        if (isset($lines[$key])) {
            if (!defined($key)) {
                define($key, $lines[$key]);
                error_log("✅ Definida: $key = '" . constant($key) . "'");
            }
        } elseif (!defined($key)) {
            define($key, '');
            error_log("⚠️  No encontrada: $key (definida vacía)");
        }
    }

    // Definir también el resto de claves presentes en el .env (FTP_*, etc.)
    foreach ($lines as $key => $value) {
        if (!defined($key)) {
            define($key, $value);
        }
    }

    // Resolver PENDING_UPLOADS_PATH → PENDING_UPLOADS_DIR (ruta absoluta real).
    // Acepta rutas absolutas o relativas al raíz del proyecto. En hostings con
    // chroot FTP (p. ej. InfinityFree, donde el webroot real es /htdocs) la ruta
    // absoluta "/htdocs/..." que ve el FTP NO existe en el filesystem de PHP;
    // usar ruta relativa: PENDING_UPLOADS_PATH=pending_uploads → <raíz>/pending_uploads.
    if (defined('PENDING_UPLOADS_PATH') && trim(PENDING_UPLOADS_PATH) !== '') {
        $pending = trim(PENDING_UPLOADS_PATH);
        if (strpos($pending, '/') === 0) {
            define('PENDING_UPLOADS_DIR', rtrim($pending, '/'));
        } else {
            define('PENDING_UPLOADS_DIR', rtrim(dirname(__DIR__), '/') . '/' . trim($pending, '/'));
        }
    } else {
        define('PENDING_UPLOADS_DIR', '');
    }

    return true;
}

// === Ejecutar carga ===
load_env(3);

