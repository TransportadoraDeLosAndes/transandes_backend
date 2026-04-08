import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
// Asegúrate de poner la ruta correcta a tu modelo de Admin
import { AdminModel } from './models/admin.model.js'; 

dotenv.config();

const poblarBaseDeDatos = async () => {
  try {
    // 1. Conectamos a Mongo
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/transandes');
    console.log('✅ Conectado a MongoDB');

    // 2. Verificamos si ya existe el admin para no duplicarlo
    const existeAdmin = await AdminModel.findOne({ username: 'admin_transandes' });
    
    if (existeAdmin) {
      console.log('⚠️ El administrador principal ya existe.');
    } else {
      // 3. Encriptamos la contraseña
      const salt = await bcrypt.genSalt(10);
      const claveEncriptada = await bcrypt.hash('Transandes2026*', salt); // <-- Contraseña segura inicial

      // 4. Creamos el admin
      const nuevoAdmin = new AdminModel({
        username: 'admin_transandes',
        password: claveEncriptada,
        role: 'SUPERADMIN'
      });

      await nuevoAdmin.save();
      console.log('✅ Administrador maestro creado con éxito.');
    }

    mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error creando el admin:', error);
    process.exit(1);
  }
};

poblarBaseDeDatos();