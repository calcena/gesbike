<?php
require_once __DIR__ . '/../repositories/log.php';

function create_log($log_data)
{
    if (empty($log_data) || !is_array($log_data)) {
        throw new Exception("Datos de log inválidos o vacíos");
    }
    $log_id = insert_log($log_data);
    return $log_id;
}

