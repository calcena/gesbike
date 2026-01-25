<?php
// Configuración del servidor FTP
$ftp_server = "ftpupload.net";
$ftp_username = "if0_40253663";
$ftp_password = "sUCsOHy0DF";
$remote_file = "/htdocs/database/app.db";
$local_file = "./app.db";

// Verificar que el archivo local exista
if (!file_exists($local_file)) {
    die("Error: El archivo local '$local_file' no existe.\n");
}

// Conectar al servidor FTP
$conn_id = ftp_connect($ftp_server);

if (!$conn_id) {
    die("Error: No se pudo conectar al servidor FTP ($ftp_server).\n");
}

// Iniciar sesión
$login_result = ftp_login($conn_id, $ftp_username, $ftp_password);

if (!$login_result) {
    ftp_close($conn_id);
    die("Error: No se pudo iniciar sesión en el servidor FTP.\n");
}

// Activar modo pasivo (recomendado)
ftp_pasv($conn_id, true);

// Subir el archivo
if (ftp_put($conn_id, $remote_file, $local_file, FTP_BINARY)) {
    echo "Archivo subido correctamente a $remote_file.\n";
} else {
    echo "Error: No se pudo subir el archivo '$local_file' al servidor.\n";
}

// Cerrar la conexión
ftp_close($conn_id);
?>