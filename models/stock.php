<?php
require_once __DIR__ . '/../repositories/stock.php';

function getStock($params) {
    global $db;
    $entity = stock($params);
    return $entity;
}