<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
if (!function_exists('getallheaders')) {
    function getallheaders()
    {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) === 'HTTP_') {
                // Convertir HTTP_ACCEPT_ENCODING → Accept-Encoding
                $headerName = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
                $headers[$headerName] = $value;
            } elseif ($name === 'CONTENT_TYPE') {
                $headers['Content-Type'] = $value;
            } elseif ($name === 'CONTENT_LENGTH') {
                $headers['Content-Length'] = $value;
            }
        }
        return $headers;
    }
}

function random_file_enumerator()
{
    $number = rand(1, 10000000000);
    echo $number;
}

function exit_session()
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_unset();
        session_destroy();
    }
}

function get_session_status()
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
}

function debug_mode()
{
    if (APP_ENV == "local" || APP_ENV == "dev") {
        ini_set('display_errors', 1);
        ini_set('display_startup_errors', 1);
        error_reporting(E_ALL);
    }
}

function show_envoironment_message()
{
    if (APP_ENV == "local") {
        echo '<div class="container">';
        echo '<div class="bg-primary">';
        echo '<h2 style="text-align: center;color: white;">Entorno LOCAL</h2>';
        echo '</div>';
        echo '</div>';
    }
    if (APP_ENV == "qa" || APP_ENV == "dev") {
        echo '<div class="container">';
        echo '<div class="bg-danger">';
        echo '<h2 style="text-align: center;color: white;">Entorno de DESARROLLO/QA</h2>';
        echo '</div>';
        echo '</div>';
    }
}

function new_guui_generator()
{
    $bytes = random_bytes(16);
    $bytes[6] = chr(ord($bytes[6]) & 0x0f | 0x40); // set version to 0100
    $bytes[8] = chr(ord($bytes[8]) & 0x3f | 0x80); // set variant to 10xx
    $hex = bin2hex($bytes);
    return sprintf(
        '%08s-%04s-%04s-%04s-%12s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );
}


function check_security()
{
    // En el caso de no existir sesión redirigimos
    if (!isset($_SESSION['user'])) {
        header('Location: /index.php');
        exit;
    }
}

