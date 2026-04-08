import mongoose, { Schema, Document } from "mongoose";

export interface IConductor extends Document {
  telegramId: string; // 🔑 El ID numérico oculto que nos da Telegram
  nombre: string;
  telefono: string;
  placa: string;
  numeroInterno: string; // Ej: Móvil 045
  estado: "ACTIVO" | "INACTIVO";
  fechaRegistro: Date;
}

const ConductorSchema: Schema = new Schema({
  // Guardamos el telegramId como String porque a veces son números muy largos
  telegramId: { type: String, required: false, default: null },
  nombre: { type: String, required: true },
  telefono: { type: String, required: true },
  placa: { type: String, required: true },
  numeroInterno: { type: String, required: true },
  estado: { type: String, enum: ["ACTIVO", "INACTIVO"], default: "ACTIVO" },
  fechaRegistro: { type: Date, default: Date.now },
});

export const ConductorModel = mongoose.model<IConductor>("Conductor", ConductorSchema);