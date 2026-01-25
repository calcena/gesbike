<?php
session_start();
header('Content-Type: application/json');


function realizarBackupSQLite() // ... (código de la función aquí)
{
    $dbPath = $_SESSION['base_project'] . '/database/app.db';
    $backupDir = $_SESSION['base_project'] . '/database/backups/';

    if (!file_exists($dbPath)) { /* ... */
    }
    if (!is_dir($backupDir)) { /* ... */
    }

    // Lógica de copia...
    $dbFileName = basename($dbPath);
    $timestamp = date('Ymd_His');
    $backupFileName = str_replace('.db', "_{$timestamp}.db", $dbFileName);
    $destinationPath = rtrim($backupDir, '/') . '/' . $backupFileName;

    if (copy($dbPath, $destinationPath)) {
        return [
            'success' => true,
            'message' => "Backup de SQLite realizado con éxito.",
            'path' => $destinationPath
        ];
    } else {
        $error = error_get_last();
        return [
            'success' => false,
            'message' => "ERROR: Falló la operación de copia (copy()). " .$error['message']
        ];
    }
}

// --------------------------------------------------------

// 2. Procesamiento de la Petición
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $resultado = realizarBackupSQLite();

    if ($resultado['success']) {
        http_response_code(200);
    } else {
        http_response_code(500);
    }

    echo json_encode($resultado);
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido.']);
}

exit; // Asegurarse de que no se ejecute nada más
?>