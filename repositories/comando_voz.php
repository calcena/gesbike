<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();

function get_comandos_voz_activos()
{
    $db = conectar_comandos_voz();
    $stmt = $db->prepare("SELECT id, frase, url, COALESCE(respuesta, '') as respuesta FROM comandos_voz WHERE is_active = 1 AND deleted_at IS NULL");
    $stmt->execute();
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
