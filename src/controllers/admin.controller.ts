import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Importamos los modelos de la base de datos
import { AdminModel } from "../models/admin.model.js";
import { ConductorModel } from "../models/conductor.model.js";
import { ViajeModel } from "../models/viaje.model.js";

// ==========================================
// 1. AUTENTICACIÓN (LOGIN BLINDADO)
// ==========================================
export const loginAdmin = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const admin = await AdminModel.findOne({ username });
    if (!admin) {
      return res.status(401).json({ mensaje: "Credenciales incorrectas" });
    }

    const esClaveValida = await bcrypt.compare(password, admin.password);
    if (!esClaveValida) {
      return res.status(401).json({ mensaje: "Credenciales incorrectas" });
    }

    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET || "transandes_secret_key_2026",
      { expiresIn: "8h" },
    );

    res.json({ token, mensaje: "Bienvenido al sistema" });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ mensaje: "Error en el servidor durante el login" });
  }
};

// ==========================================
// 2. GESTIÓN DE CONDUCTORES (CRUD)
// ==========================================
export const obtenerConductores = async (req: Request, res: Response) => {
  try {
    const conductores = await ConductorModel.find().sort({ createdAt: -1 });
    res.json(conductores);
  } catch (error) {
    res
      .status(500)
      .json({ mensaje: "Error al obtener la lista de conductores" });
  }
};

export const crearConductor = async (req: Request, res: Response) => {
  try {
    const nuevoConductor = new ConductorModel(req.body);
    await nuevoConductor.save();
    res
      .status(201)
      .json({
        mensaje: "Taxista registrado con éxito",
        conductor: nuevoConductor,
      });
  } catch (error) {
    console.error("Error al crear conductor:", error);
    res.status(500).json({ mensaje: "Error al registrar el conductor" });
  }
};

export const obtenerConductorPorId = async (req: Request, res: Response) => {
  try {
    const conductor = await ConductorModel.findById(req.params.id);
    if (!conductor)
      return res.status(404).json({ mensaje: "Conductor no encontrado" });
    res.json(conductor);
  } catch (error) {
    res
      .status(500)
      .json({ mensaje: "Error al obtener los datos del conductor" });
  }
};

export const actualizarConductor = async (req: Request, res: Response) => {
  try {
    const actualizado = await ConductorModel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }, 
    );
    res.json({
      mensaje: "Taxista actualizado con éxito",
      conductor: actualizado,
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al actualizar la información" });
  }
};

export const eliminarConductor = async (req: Request, res: Response) => {
  try {
    await ConductorModel.findByIdAndDelete(req.params.id);
    res.json({ mensaje: "Conductor eliminado permanentemente" });
  } catch (error) {
    res
      .status(500)
      .json({ mensaje: "Error al intentar eliminar al conductor" });
  }
};

// ==========================================
// 3. REPORTES Y AUDITORÍA (VIAJES PAGINADOS) 📚
// ==========================================
export const obtenerViajes = async (req: Request, res: Response) => {
  try {
    // A. Leer la página actual y cuántos items queremos por página desde la URL
    // Si no mandan nada, por defecto es la página 1 y traemos 10 viajes.
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // B. Calcular cuántos documentos saltarnos
    const skip = (page - 1) * limit;

    // C. Contar cuántos viajes existen en TOTAL en la base de datos
    const totalViajes = await ViajeModel.countDocuments();
    const totalPages = Math.ceil(totalViajes / limit);

    // D. Buscar solo la "rebanada" de viajes que corresponde a esta página
    const viajes = await ViajeModel.find()
      .sort({ fechaCreacion: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // E. Cruzar la información del telegramId para adjuntar los datos del taxista
    const viajesCompletos = await Promise.all(
      viajes.map(async (viaje) => {
        let datosConductor = null;

        if (viaje.conductorAsignadoTelegramId) {
          datosConductor = await ConductorModel.findOne(
            { telegramId: viaje.conductorAsignadoTelegramId },
            "nombre placa numeroInterno", 
          ).lean();
        }

        return {
          ...viaje,
          conductorDetalle: datosConductor,
        };
      }),
    );

    // F. Devolver un objeto completo con los viajes y los datos de paginación
    res.json({
      viajes: viajesCompletos,
      paginacion: {
        totalViajes,
        totalPages,
        currentPage: page,
        limit
      }
    });

  } catch (error) {
    console.error("Error al obtener viajes:", error);
    res
      .status(500)
      .json({ mensaje: "Error al obtener el historial de viajes" });
  }
};