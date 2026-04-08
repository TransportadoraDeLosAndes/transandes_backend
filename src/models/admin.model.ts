import mongoose, { Schema, Document } from 'mongoose';

// Interfaz para TypeScript
export interface IAdmin extends Document {
  username: string;
  password: string;
  role: string;
}

// Esquema de Mongoose
const AdminSchema: Schema = new Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, // No pueden haber dos usuarios con el mismo nombre
    trim: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    default: 'SUPERADMIN' 
  }
}, { 
  timestamps: true // Agrega fecha de creación y modificación automáticamente
});

export const AdminModel = mongoose.model<IAdmin>('Admin', AdminSchema);