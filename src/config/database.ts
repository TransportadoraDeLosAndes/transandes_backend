import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

export const conectarDB = async () => {
  if (!MONGODB_URI) {
    console.error("❌ ERROR: No se encontró MONGODB_URI en el archivo .env");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`🍃 ¡MongoDB Conectado Exitosamente! Base de datos: ${conn.connection.name}`);
  } catch (error) {
    console.error("❌ Error conectando a MongoDB:", error);
    process.exit(1); // Detiene el servidor si falla la base de datos
  }
};