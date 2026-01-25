<?php
require_once __DIR__ . '/../repositories/attach.php';

function createAdjuntoModel($params) {
    global $db;
    $id = createAdjunto($params);
    return $id;
}


function createRecambioImageModel($params) {
    global $db;
    $id = createRecambioImage($params);
    return $id;
}
