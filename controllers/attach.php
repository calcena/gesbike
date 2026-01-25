<?php
$root = dirname(__DIR__);
require_once $root . '/helpers/helper.php';
require_once $root . '/models/attach.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido']);
    exit;
}

if (!isset($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
    $errors = [
        UPLOAD_ERR_INI_SIZE => 'El archivo excede el límite permitido.',
        UPLOAD_ERR_FORM_SIZE => 'El archivo excede el límite del formulario.',
        UPLOAD_ERR_PARTIAL => 'El archivo se subió parcialmente.',
        UPLOAD_ERR_NO_FILE => 'No se seleccionó ningún archivo.',
        UPLOAD_ERR_NO_TMP_DIR => 'Falta carpeta temporal.',
        UPLOAD_ERR_CANT_WRITE => 'Error al escribir en disco.',
        UPLOAD_ERR_EXTENSION => 'Extensión bloqueó la subida.',
    ];
    $code = $_FILES['archivo']['error'] ?? UPLOAD_ERR_NO_FILE;
    $msg = $errors[$code] ?? 'Error desconocido.';
    echo json_encode(['success' => false, 'message' => $msg]);
    exit;
}

$file = $_FILES['archivo'];

$allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
if (!in_array($file['type'], $allowedTypes)) {
    echo json_encode(['success' => false, 'message' => 'Solo imágenes permitidas.']);
    exit;
}

if ($file['size'] > 5 * 1024 * 1024) {
    echo json_encode(['success' => false, 'message' => 'Máx. 5 MB.']);
    exit;
}

$source = $_POST['source'];
$vehiculo_id = $_POST['vehiculo_id'] ?? null;
$mantenimiento_id = $_POST['mantenimiento_id'] ?? null;

switch ($source) {
    case 'recambio':
        $uploadDir = __DIR__ . '/../assets/images/Recambios/';
        $basePath = '../assets/images/Recambios/';
        break;
    default:
        $uploadDir = __DIR__ . '/../attachments/';
        $basePath = '../attachments/';
        break;
}
if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
        echo json_encode(['success' => false, 'message' => 'No se pudo crear la carpeta de adjuntos']);
        exit;
    }
}

if (!$vehiculo_id) {
    echo json_encode(['success' => false, 'message' => 'vehiculo_id es requerido']);
    exit;
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$uuid = new_guui_generator(); // asumo que está en helper.php
$safeName = $uuid . '.' . $ext;
$targetPath = $uploadDir . $safeName;

if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    echo json_encode(['success' => false, 'message' => 'Error al guardar el archivo.']);
    exit;
}

try {
    switch ($source) {
        case 'adjunto':
            $adjuntoId = createAdjuntoModel([
                'guid' => $uuid,
                'nombre_original' => $file['name'],
                'ruta' => $safeName,
                'vehiculo_id' => (int) $vehiculo_id,
                'mantenimiento_id' => $mantenimiento_id
            ]);
            break;
        default:

            break;
    }
    echo json_encode([
        'success' => true,
        'message' => 'Archivo subido y registrado',
        'data' => [
            'id' => $adjuntoId ?? null,
            'guid' => $uuid,
            'file' => $safeName,
            'file_path' => $basePath . $safeName
        ]
    ]);

} catch (Exception $e) {
    // En producción, logea y no expongas el error
    error_log("Error BD adjunto: " . $e->getMessage());
    @unlink($targetPath); // intenta borrar archivo huérfano
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}