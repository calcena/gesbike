<?php
require_once __DIR__ . '/../repositories/login.php';

function authentication($params) {

    $entity = validarUsuario($params);
    return $entity;
}

