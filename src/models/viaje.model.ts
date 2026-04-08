import mongoose, { Schema, Document } from "mongoose";

// ✅ 1. Sub-interfaz para coordenadas (reutilizable)
export interface ICoordenadas {
  lat: number;
  lng: number;
}

// ✅ 2. Interfaz principal tipada
export interface IViaje extends Document {
  telefonoCliente: string;
  nombreCliente: string;
  tipoServicio: "INMEDIATO" | "AGENDADO";

  origen: string;
  coordenadasOrigen?: ICoordenadas; // ✅ AÑADIDO
  destino: string;
  coordenadasDestino?: ICoordenadas; // ✅ AÑADIDO

  referenciaOrigen?: string;
  numeroPasajeros?: string;
  fechaHoraInicio?: string;
  datosRegreso?: string;
  identificacionContratante?: string;
  direccionContratante?: string;
  observaciones?: string;

  estadoViaje:
    | "PENDIENTE"
    | "ASIGNADO"
    | "EN_CURSO"
    | "COMPLETADO"
    | "CANCELADO";

  calificacion?: number;
  comentarioCalificacion?: string;
  fechaCreacion: Date;

  conductorAsignadoTelegramId?: string;
}

// ✅ 3. Sub-schema reutilizable para coordenadas
const CoordenadasSchema = new Schema<ICoordenadas>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }, // evita crear IDs innecesarios
);

// ✅ 4. Schema principal de Mongo
const ViajeSchema: Schema = new Schema({
  telefonoCliente: { type: String, required: true },
  nombreCliente: { type: String, default: "Cliente" },

  tipoServicio: {
    type: String,
    enum: ["INMEDIATO", "AGENDADO"],
    required: true,
  },

  origen: { type: String, required: true },
  coordenadasOrigen: { type: CoordenadasSchema }, // ✅ BIEN DEFINIDO

  destino: { type: String, required: true },
  coordenadasDestino: { type: CoordenadasSchema }, // ✅ BIEN DEFINIDO

  referenciaOrigen: { type: String },
  numeroPasajeros: { type: String },
  fechaHoraInicio: { type: String },
  datosRegreso: { type: String },
  identificacionContratante: { type: String },
  direccionContratante: { type: String },
  observaciones: { type: String },

  estadoViaje: {
    type: String,
    enum: ["PENDIENTE", "ASIGNADO", "EN_CURSO", "COMPLETADO", "CANCELADO"],
    default: "PENDIENTE",
  },

  conductorAsignadoTelegramId: { type: String },

  calificacion: { type: Number },
  comentarioCalificacion: { type: String },
  fechaCreacion: { type: Date, default: Date.now },
});

// ✅ 5. Modelo exportado
export const ViajeModel = mongoose.model<IViaje>("Viaje", ViajeSchema);
