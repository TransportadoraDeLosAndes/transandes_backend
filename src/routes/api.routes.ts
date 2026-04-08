import { Router } from "express";
import { obtenerViajes, asignarConductor, viajeCompletado } from "../controllers/api.controller.js";
import adminRoutes from "./admin.routes.js"; 

const router = Router();

// Definimos las rutas y las conectamos con su lógica respectiva (Las que ya tenías)
router.get("/viajes", obtenerViajes);
router.post("/asignar-conductor", asignarConductor);
router.post("/viaje-completado", viajeCompletado);

// 🚀 NUEVO: Conectamos las rutas de administrador bajo el prefijo /admin
router.use("/admin", adminRoutes);

export default router;