// src/services/session.service.ts
import { EstadoBot, SesionUsuario } from '../types.js'; // Recuerda el .js al final en NodeNext

// Este Map guardará las sesiones en la memoria RAM de tu servidor
const sesiones = new Map<string, SesionUsuario>();

export const obtenerSesion = (telefono: string): SesionUsuario => {
    // Si el usuario ya nos había escrito, devolvemos su sesión actual
    if (sesiones.has(telefono)) {
        return sesiones.get(telefono)!;
    }

    // Si es un usuario nuevo, le creamos una sesión desde cero (INACTIVO)
    const nuevaSesion: SesionUsuario = {
        telefono,
        estado: EstadoBot.INACTIVO,
        datosTemporales: {},
        ultimaInteraccion: new Date()
    };
    
    sesiones.set(telefono, nuevaSesion);
    return nuevaSesion;
};

export const actualizarSesion = (telefono: string, datosParciales: Partial<SesionUsuario>) => {
    const sesionActual = obtenerSesion(telefono);
    const sesionActualizada = { 
        ...sesionActual, 
        ...datosParciales, 
        ultimaInteraccion: new Date() // Refrescamos el tiempo de inactividad
    };
    sesiones.set(telefono, sesionActualizada);
};