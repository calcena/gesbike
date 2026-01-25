<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
// $password_input = 'p4ssw0rdT3mp0r4l';
$password_input = '1012';
$hash = password_hash($password_input, PASSWORD_DEFAULT);
echo 'Password: ' . $password_input;
echo '<br />';
echo 'Hashing: ' . $hash;
echo '<br />';
if (password_verify($password_input, $hash)) {
    echo "✅ password_verify: ÉXITO";
} else {
    echo "❌ password_verify: FALLO";
}

// Verifica que el hash es válido
if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
    echo "<br/>⚠️ El hash necesita ser regenerado";
}

// Muestra detalles
echo "<br/>Longitud del hash: " . strlen($hash);
echo "<br/>Hash: " . htmlspecialchars($hash);