import { Request, Response } from "express";
import { ViajeModel } from "../models/viaje.model.js";
import {
  obtenerSesion,
  actualizarSesion,
} from "../services/session.service.js";
import {
  enviarMensajeTexto,
  enviarBotones,
} from "../services/whatsapp.service.js";
import { EstadoBot } from "../types.js";

// 1. Obtener todos los viajes (Para la App del Despachador)
export const obtenerViajes = async (req: Request, res: Response) => {
  try {
    const { estado } = req.query;
    let filtro = {};
    if (estado) filtro = { estadoViaje: estado };

    const viajes = await ViajeModel.find(filtro).sort({ fechaCreacion: -1 });
    res.status(200).json(viajes);
  } catch (error) {
    console.error("Error obteniendo los viajes:", error);
    res.status(500).json({ error: "Fallo al consultar la base de datos" });
  }
};

// 2. Asignar Conductor (Cuando el taxista acepta el viaje)
export const asignarConductor = async (req: Request, res: Response) => {
  const { telefonoCliente, nombreConductor, placaVehiculo, tiempoEstimado } =
    req.body;

  if (!telefonoCliente || !nombreConductor || !placaVehiculo) {
    return res.status(400).send({ error: "Faltan datos obligatorios." });
  }

  try {
    const viajeActualizado = await ViajeModel.findOneAndUpdate(
      { telefonoCliente: telefonoCliente, estadoViaje: "PENDIENTE" },
      { estadoViaje: "ASIGNADO" },
      { sort: { fechaCreacion: -1 }, new: true },
    );

    if (!viajeActualizado) {
      return res
        .status(404)
        .send({ error: "No se encontró un viaje PENDIENTE para este número." });
    }

    const sesionActual = obtenerSesion(telefonoCliente);
    if (sesionActual.datosTemporales?.temporizadorId) {
      clearTimeout(sesionActual.datosTemporales.temporizadorId);
    }

    const mensajeNotificacion = `✅ *¡Tu conductor ha sido asignado!*\n\n👨‍✈️ Conductor: ${nombreConductor}\n🚕 Placa: ${placaVehiculo}\n⏱️ Tiempo estimado: ${tiempoEstimado || "En unos minutos"}\n\nPor favor, mantente atento en el punto de recogida.`;

    await enviarMensajeTexto(telefonoCliente, mensajeNotificacion);
    actualizarSesion(telefonoCliente, {
      estado: EstadoBot.INACTIVO,
      datosTemporales: {},
    });

    res.status(200).send({ success: true, message: "Cliente notificado." });
  } catch (error) {
    console.error("Error al asignar conductor:", error);
    res.status(500).send({ error: "Fallo interno en el servidor." });
  }
};

// 3. Viaje Completado (Enviar Encuesta CSAT)
export const viajeCompletado = async (req: Request, res: Response) => {
  const { telefonoCliente } = req.body;

  if (!telefonoCliente) {
    return res.status(400).send({ error: "Falta el teléfono del cliente" });
  }

  try {
    await enviarBotones(
      telefonoCliente,
      "🚕 Tu viaje ha finalizado con éxito.\n\nPara Trans Andes es muy importante tu opinión. ¿Cómo calificarías el servicio de nuestro conductor hoy?",
      [
        { id: "cal_3", titulo: "⭐⭐⭐ Excelente" },
        { id: "cal_2", titulo: "⭐⭐ Bueno" },
        { id: "cal_1", titulo: "⭐ Mejorable" },
      ],
    );

    actualizarSesion(telefonoCliente, {
      estado: EstadoBot.ESPERANDO_CALIFICACION,
      datosTemporales: {},
    });

    res.status(200).send({ success: true, message: "Encuesta enviada" });
  } catch (error) {
    console.error("Error enviando encuesta:", error);
    res.status(500).send({ error: "Fallo al enviar la encuesta" });
  }
};
