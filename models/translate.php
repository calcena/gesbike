<?php
require_once __DIR__ . '/../repositories/translate.php';

function getTranslate($source, $language) {
    global $db;
    $traduccion = obtenerTraduccion($source, $language);
    return $traduccion;
}