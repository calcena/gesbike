<?php
require_once '../helpers/helper.php';
get_session_status();

// Definimos los botones: [texto, función onclick, ícono]
$menuButtons = [
    ['btn_id' => 'btn_inicio', 'label' => 'Inicio', 'id' => 'lbl_inicio', 'onclick' => '', 'icon' => ''],
    ['btn_id' => 'btn_mantenimientos', 'label' => 'Mantenimientos', 'id' => 'lbl_mantenimientos', 'onclick' => '', 'icon' => ''],
    ['btn_id' => 'btn_rutas', 'label' => 'Rutas', 'id' => 'lbl_rutas', 'onclick' => '', 'icon' => ''],
    ['btn_id' => 'btn_recambios', 'label' => 'Recambios', 'id' => 'lbl_recambios', 'onclick' => '', 'icon' => ''],
    ['btn_id' => 'btn_grupos', 'label' => 'Grupos', 'id' => 'lbl_grupos', 'onclick' => '', 'icon' => ''],
    ['btn_id' => 'btn_vehiculos', 'label' => 'Vehiculos', 'id' => 'lbl_vehiculos', 'onclick' => '', 'icon' => ''],
    ['btn_id' => 'btn_motores', 'label' => 'Motores', 'id' => 'lbl_motores', 'onclick' => '', 'icon' => ''],
];

// Generamos los botones
foreach ($menuButtons as $btn):
    ?>
    <button id="<?= htmlspecialchars($btn['btn_id']) ?>" class="btn button-menu" onclick="<?= htmlspecialchars($btn['onclick']) ?>">
        <span id="<?= htmlspecialchars($btn['id']) ?>" class="day-text"></span>
        <span id="" class="button-menu-text"><?= htmlspecialchars($btn['label']) ?>
        <span class="badge bg-danger little-size">0</span>
    </button>
<?php endforeach; ?>