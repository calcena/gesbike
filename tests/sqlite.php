<?php

// Ruta al archivo de la base de datos SQLite
$databasePath = __DIR__ . '/gestion.db';

try {
    // Conexión a la base de datos SQLite
    $pdo = new PDO("sqlite:$databasePath");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Preparar la consulta de inserción
    $sql = "INSERT INTO logs (
        usuario_id,
        mensaje,
        modulo,
        metodo,
        error_code,
        error_description,
        created_at,
        modified_at,
        deleted_at,
        is_active
    ) VALUES (
        :usuario_id,
        :mensaje,
        :modulo,
        :metodo,
        :error_code,
        :error_description,
        :created_at,
        :modified_at,
        :deleted_at,
        :is_active
    )";

    $stmt = $pdo->prepare($sql);

    // Datos a insertar (ajusta estos valores según tus necesidades)
    $data = [
        'usuario_id' => 123,
        'mensaje' => 'Inicio de sesión exitoso',
        'modulo' => 'auth',
        'metodo' => 'login',
        'error_code' => null, // o un código si aplica
        'error_description' => null, // o una descripción si aplica
        'created_at' => date('Y-m-d H:i:s'), // Formato ISO 8601
        'modified_at' => null,
        'deleted_at' => null,
        'is_active' => 1
    ];

    // Ejecutar la inserción
    $stmt->execute($data);

    echo "Registro insertado correctamente con ID: " . $pdo->lastInsertId();

    $pdo = null;

} catch (PDOException $e) {
    die("Error al conectar o insertar en la base de datos: " . $e->getMessage());
}