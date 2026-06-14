<?php
require_once __DIR__ . '/../repositories/programacion.php';

function getPrediccion($params)
{
    global $db;
    return get_prediccion_by_combinacion($params);
}

function guardarProgramacion($params)
{
    global $db;
    return save_programacion($params);
}

function getTodasPredicciones($params)
{
    global $db;
    return get_todas_predicciones($params);
}

function getConfiguracionCombinaciones($params)
{
    global $db;
    return get_configuracion_combinaciones($params);
}
