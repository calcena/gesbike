<?php
/*
 * Genera el menú dinámico según el origen ($source) y los permisos del usuario
 * Acciones JS en: services/animals/animal.js
 */
?>

<div class="menu-buttons">
    <?php if ($source === 'animals'): ?>
        <?php
        // Definimos los botones del menú de animales: [permiso, texto, función onclick, ícono]
        $animalMenuItems = [
            [
                'permission' => 'animales_menu_buscar_animal',
                'label' => 'Inicio',
                'id' => 'lbl_inicio',
                'onclick' => 'searchAnimal()',
                'icon' => 'home.png'
            ],
            [
                'permission' => 'animales_menu_alta_animal',
                'label' => 'Alta',
                'id' => 'lbl_alta',
                'onclick' => 'showNewAnimal()',
                'icon' => 'punto.png'
            ],
            [
                'permission' => 'animales_menu_listar_pendiente',
                'label' => 'Listar pendientes',
                'id' => 'lbl_pendientes',
                'onclick' => 'listPendings()',
                'icon' => 'punto.png'
            ],
            [
                'permission' => 'animales_menu_canguro',
                'label' => 'Acogidas',
                'id' => 'lbl_acogidas',
                'onclick' => 'showFostering()',
                'icon' => 'punto.png'
            ],
            [
                'permission' => 'animales_menu_canguro',
                'label' => 'Agendas',
                'id' => 'lbl_agendas',
                'onclick' => 'showPlanner()',
                'icon' => 'punto.png'
            ],
        ];

        foreach ($animalMenuItems as $item):
            if ($_SESSION['user'][$item['permission']] === 'on'):
                ?>
                <button class="btn button-menu" onclick="<?= htmlspecialchars($item['onclick']) ?>">
                    <img class="me-2 button-menu-icon" src="../../assets/images/icons/<?= $item['icon'] ?>" alt="">
                    <span id="<?= htmlspecialchars($item['id']) ?>"><?= htmlspecialchars($item['label']) ?></span>
                </button>
                <?php
            endif;
        endforeach;
        ?>
    <?php endif; ?>

    <?php if ($source === 'persons'): ?>
        <!-- Menú para personas (vacío por ahora) -->
        <span class="text-muted">Menú de personas</span>
    <?php endif; ?>
</div>