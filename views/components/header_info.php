<?php
require_once __DIR__ . '/../../helpers/helper.php';
get_session_status();
?>

<div class="col-4">
      <div>
            <span class="fw-bold text-capitalize">
                  <!-- Usuario: <span class="header-text"><?php echo htmlspecialchars($_SESSION['user']['usuario']); ?> (<?php echo htmlspecialchars($_SESSION['user']['tipo']); ?>)</span> -->
                  Usuario: <span class="header-text">Victor.Calcena (Admin))</span>
            </span>
      </div>
</div>
<div class="col-6 text-center">
      <img class="header-button-option me-5" src="../assets/images/icons/zonas.png" alt="">
      <img class="header-button-option me-5" src="../assets/images/icons/cuadrilla.png" alt="">
      <img class="header-button-option" src="../assets/images/icons/trabajador.png" alt="">
</div>

<div class="col-2 text-end">
      <?php if (!empty($source)): ?>
            <img onclick="gotoMain()" class="header-button pointer" src="../../assets/images/icons/volver.png" alt="Volver atrás">
      <?php else: ?>
            <img onclick="exitSession()" class="header-button pointer" src="../assets/images/icons/exit.png" alt="Salir">
      <?php endif; ?>
</div>