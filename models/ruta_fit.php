<?php
require_once __DIR__ . '/../repositories/ruta_fit.php';

function createRutaPulsacion($ruta_id, $pulsaciones) {
    return create_pulsaciones_repo($ruta_id, $pulsaciones);
}

function getRutaPulsacion($ruta_id) {
    return get_pulsaciones_repo($ruta_id);
}

function getRutaPulsacionSummary($ruta_id) {
    return get_pulsaciones_summary_repo($ruta_id);
}
