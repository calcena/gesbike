<div id="lateral-menu" class="lateral-menu">
    <div class="menu-header d-flex justify-content-between align-items-center ms-1 me-1 mt-2">
        <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/cancelar_icon.png" class="menu-icon me-1 p-1"
            aria-label="Close" onclick="deleteKmsDetail(this.value)" />
        <input id="kms_realizados" type="number" class="fs-4 form-control w-75 ms-1" placeholder="Kms">
        <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/check.png" class="menu-icon me-1 p-1"
            aria-label="Close" onclick="applyKmsDetail(document.getElementById('kms_realizados').value)" />
    </div>
    <hr />
    <div class="menu-items">
        <!-- 7 íconos de menú -->
        <div class="menu-item text-center" onclick="menuAction('inicio',<?php echo $GLOBALS['navigation_deep'] ?>)">
            <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/inicio_ico.png" alt="Inicio"
                class="menu-icon">
            <div class="menu-text-option">Inicio</div>
        </div>
        <div class="menu-item text-center"
            onclick="menuAction('mantenimiento',<?php echo $GLOBALS['navigation_deep'] ?>)">
            <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/mantenimiento_ico.png" alt="Matenimientos"
                class="menu-icon">
            <div class="menu-text-option">Mantenimientos</div>
        </div>
        <div class="menu-item text-center" onclick="menuAction('rutas',<?php echo $GLOBALS['navigation_deep'] ?>)">
            <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/ruta_ico.png" alt="Rutas" class="menu-icon">
            <div class="menu-text-option">Rutas</div>
        </div>
        <div class="menu-item text-center" onclick="menuAction('vehiculos',<?php echo $GLOBALS['navigation_deep'] ?>)">
            <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/vehiculos_ico.png" alt="Vehículos"
                class="menu-icon">
            <div class="menu-text-option">Vehículos</div>
        </div>
        <div class="menu-item text-center" onclick="menuAction('grupos',<?php echo $GLOBALS['navigation_deep'] ?>)">
            <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/grupo_ico.png" alt="Grupos"
                class="menu-icon">
            <div class="menu-text-option">Grupos</div>
        </div>
        <div class="menu-item text-center" onclick="menuAction('recambios', <?php echo $GLOBALS['navigation_deep'] ?>)">
            <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/recambio_ico.png" alt="Recambios"
                class="menu-icon">
            <div class="menu-text-option">Recambios</div>
        </div>
        <div class="menu-item text-center" onclick="menuAction('stock', <?php echo $GLOBALS['navigation_deep'] ?>)">
            <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/stock_ico.png" alt="Stock" class="menu-icon">
            <div class="menu-text-option">Stock</div>
        </div>
        <hr>
        <div class="menu-item text-center" onclick="menuAction('salir',<?php echo $GLOBALS['navigation_deep'] ?>)">
            <img src="<?php echo $GLOBALS['pathUrl'] ?>assets/images/icons/exit.png" alt="Salir" class="menu-icon">
            <div class="menu-text-option">Salir</div>
        </div>
    </div>
</div>
<!-- Overlay oscuro (opcional, mejora UX) -->
<div id="menu-overlay" class="menu-overlay" onclick="hideLateralMenu()"></div>