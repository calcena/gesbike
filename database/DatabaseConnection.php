<?php
require_once __DIR__ . '/../helpers/config.php';

// Validar que DB_TYPE y DB_PATH estén definidas
if (!defined('DB_TYPE') || !defined('DB_PATH')) {
    error_log("DatabaseConnection.php: Faltan constantes DB_TYPE o DB_PATH");
    die("<p style='color:red; font-family:monospace;'>"
        . "Error de configuración: faltan DB_TYPE o DB_PATH. "
        . "Verifica que el archivo <strong>.env</strong> tenga las variables correctas."
        . "</p>");
}

if (DB_TYPE !== 'sqlite') {
    error_log("DatabaseConnection.php: DB_TYPE debe ser 'sqlite'");
    die("<p style='color:red; font-family:monospace;'>"
        . "Error de configuración: solo se soporta DB_TYPE=sqlite en esta versión."
        . "</p>");
}

$databaseDir = dirname(DB_PATH);
if (!is_dir($databaseDir)) {
    if (!mkdir($databaseDir, 0755, true)) {
        error_log("DatabaseConnection.php: No se pudo crear la carpeta de base de datos: $databaseDir");
        die("<p style='color:red; font-family:monospace;'>"
            . "No se pudo crear la carpeta de base de datos: <strong>" . htmlspecialchars($databaseDir) . "</strong><br>"
            . "Asegúrate de que el servidor tenga permisos de escritura."
            . "</p>");
    }
}

// Verificar que el archivo exista, si no, intentar crearlo (SQLite lo crea automáticamente al conectar)
if (!file_exists(DB_PATH)) {
    error_log("DatabaseConnection.php: El archivo SQLite no existe, se creará al conectar: " . DB_PATH);
}

function conectar()
{
    static $connection = null;
    if ($connection === null) {
        try {
            $connection = new PDO(
                'sqlite:' . DB_PATH,
                null,
                null,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_PERSISTENT => false,
                ]
            );

            $connection->exec("PRAGMA foreign_keys = ON;");

            error_log("✅ Conexión SQLite exitosa a: " . DB_PATH);

        } catch (PDOException $e) {
            error_log("DatabaseConnection.php - Error de conexión SQLite: " . $e->getMessage());
            die("<p style='color:red; font-family:monospace;'>"
                . "No se pudo conectar a la base de datos SQLite.<br>"
                . "Verifica la ruta: <strong>" . htmlspecialchars(DB_PATH) . "</strong><br>"
                . "<small>" . htmlspecialchars($e->getMessage()) . "</small>"
                . "</p>");
        }
    }

    return $connection;
}

function conectar_comandos_voz()
{
    static $connection = null;
    if ($connection === null) {
        if (!defined('VOICE_DB_PATH') || VOICE_DB_PATH === '') {
            error_log("conectar_comandos_voz: VOICE_DB_PATH no está definida");
            die("<p style='color:red; font-family:monospace;'>"
                . "Error de configuración: falta VOICE_DB_PATH en .env"
                . "</p>");
        }
        try {
            $connection = new PDO(
                'sqlite:' . VOICE_DB_PATH,
                null,
                null,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_PERSISTENT => false,
                ]
            );
            error_log("✅ Conexión SQLite exitosa a: " . VOICE_DB_PATH);
        } catch (PDOException $e) {
            error_log("DatabaseConnection.php - Error de conexión comandos_voz: " . $e->getMessage());
            die("<p style='color:red; font-family:monospace;'>"
                . "No se pudo conectar a la base de datos de comandos de voz.<br>"
                . "Verifica la ruta: <strong>" . htmlspecialchars(VOICE_DB_PATH) . "</strong><br>"
                . "<small>" . htmlspecialchars($e->getMessage()) . "</small>"
                . "</p>");
        }
    }
    return $connection;
}
