<?php
$ftp_server = "ftpupload.net";
$ftp_username = "if0_40253663";
$ftp_password = "sUCsOHy0DF";
$remote_file = "/htdocs/database/app.db";
$local_file = "./app.db";

// Conectar
$conn_id = ftp_connect($ftp_server);
if (!$conn_id) {
    die("❌ Error: No se pudo conectar a $ftp_server\n");
}

// Login
if (!ftp_login($conn_id, $ftp_username, $ftp_password)) {
    ftp_close($conn_id);
    die("❌ Error: Fallo al iniciar sesión\n");
}

// Opciones
ftp_pasv($conn_id, true);
ftp_set_option($conn_id, FTP_TIMEOUT_SEC, 30);

// Verificar que el directorio existe y es accesible
echo "🔍 Listando /htdocs/tests...\n";
$listing = ftp_nlist($conn_id, "/htdocs/tests");
if ($listing === false) {
    echo "⚠️ No se puede listar el directorio. Puede que no exista o falten permisos.\n";
} else {
    echo "✅ Archivos disponibles:\n";
    print_r($listing);
}

// Verificar si el archivo específico existe
echo "🔍 Verificando tamaño de '$remote_file'...\n";
$fileSize = ftp_size($conn_id, $remote_file);
if ($fileSize === -1) {
    echo "❌ El archivo '$remote_file' no existe o no es accesible.\n";
    ftp_close($conn_id);
    exit(1);
} else {
    echo "✅ Tamaño del archivo remoto: $fileSize bytes\n";
    unlink($local_file);
}

// Intentar descargar
echo "📥 Descargando...\n";
if (ftp_get($conn_id, $local_file, $remote_file, FTP_BINARY)) {
    echo "✅ Archivo descargado correctamente a '$local_file'.\n";
    echo "Tamaño local: " . filesize($local_file) . " bytes\n";
} else {
    $lastError = error_get_last();
    echo "❌ Error al descargar:\n";
    echo "Mensaje: " . ($lastError ? $lastError['message'] : "Desconocido") . "\n";

    // Intentar ver permisos o ruta
    if (!is_writable(dirname($local_file))) {
        echo "⚠️ El directorio local no es escribible.\n";
    }
}

ftp_close($conn_id);
?>