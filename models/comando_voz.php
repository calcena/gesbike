<?php
require_once __DIR__ . '/../repositories/comando_voz.php';

function getComandosVozActivos()
{
    return get_comandos_voz_activos();
}
