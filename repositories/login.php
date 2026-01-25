<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
// require_once __DIR__ . '/helpers/helper.php';
// debug_mode();
function validarUsuario($params)
{
    global $db;
    $db = conectar();
    $username = $params['username'];
    $pass = $params['pass'];
    $stmt = $db->prepare("SELECT * FROM usuarios WHERE nombre = ? AND password = ? ");
    $stmt->execute([$username, $pass]);
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    return $entity;
}