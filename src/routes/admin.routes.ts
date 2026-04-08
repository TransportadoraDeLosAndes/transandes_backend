import { Router } from 'express';
import { actualizarConductor, crearConductor, eliminarConductor, loginAdmin, obtenerConductores, obtenerConductorPorId, obtenerViajes } from '../controllers/admin.controller.js';
import { verificarToken } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/login', loginAdmin);
router.get('/conductores', verificarToken, obtenerConductores);
router.post('/conductores', verificarToken,crearConductor);
router.get('/viajes', verificarToken, obtenerViajes);

router.get('/conductores/:id', verificarToken, obtenerConductorPorId);
router.put('/conductores/:id', verificarToken, actualizarConductor);
router.delete('/conductores/:id', verificarToken, eliminarConductor);

export default router;

