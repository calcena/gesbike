<?php

function obtenerTraduccion($source, $language)
{
    global $db;
    $stmt = $db->prepare("SELECT tag_id, tag_type, `$language` FROM translate WHERE source= ?");
    $stmt->bind_param("s", $source);
    $stmt->execute();
    $result = $stmt->get_result();
    $usuarios = [];
    while ($row = $result->fetch_assoc()) {
        $usuarios[] = $row;
    }
    return $usuarios;
}
