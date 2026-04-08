export enum EstadoBot {
  INACTIVO = "INACTIVO",
  ESPERANDO_ACEPTACION_DATOS = "ESPERANDO_ACEPTACION_DATOS",
  ESPERANDO_OPCION_MENU = "ESPERANDO_OPCION_MENU",
  ESPERANDO_OPCION_INFO = "ESPERANDO_OPCION_INFO",
  ESPERANDO_NOMBRE = "ESPERANDO_NOMBRE",
  ESPERANDO_ORIGEN = "ESPERANDO_ORIGEN",
  ESPERANDO_REFERENCIA = "ESPERANDO_REFERENCIA",
  ESPERANDO_DESTINO = "ESPERANDO_DESTINO",
  ESPERANDO_CONFIRMACION = "ESPERANDO_CONFIRMACION",
  ESPERANDO_TAXI = "ESPERANDO_TAXI",
  ESPERANDO_CALIFICACION = "ESPERANDO_CALIFICACION",
  ESPERANDO_COMENTARIO_RESEÑA = "ESPERANDO_COMENTARIO_RESEÑA",
  ESPERANDO_CONFIRMAR_DATOS_GUARDADOS = "ESPERANDO_CONFIRMAR_DATOS_GUARDADOS",
  
  REINTENTAR_BUSQUEDA = "REINTENTAR_BUSQUEDA",

  AGENDAR_ORIGEN = "AGENDAR_ORIGEN",
  AGENDAR_DESTINO = "AGENDAR_DESTINO",
  AGENDAR_FECHA_HORA = "AGENDAR_FECHA_HORA",
  AGENDAR_REGRESO = "AGENDAR_REGRESO",
  AGENDAR_NOMBRE_CEDULA = "AGENDAR_NOMBRE_CEDULA",
  AGENDAR_DIRECCION = "AGENDAR_DIRECCION",
  AGENDAR_OBSERVACIONES = "AGENDAR_OBSERVACIONES",
  AGENDAR_CONFIRMACION = "AGENDAR_CONFIRMACION",
  AGENDAR_PASAJEROS = "AGENDAR_PASAJEROS",

  AGENDAR_SELECCIONAR_EDICION = "AGENDAR_SELECCIONAR_EDICION",
  AGENDAR_EDITANDO_CAMPO = "AGENDAR_EDITANDO_CAMPO",

  HABLANDO_CON_ASESOR = "HABLANDO_CON_ASESOR"
}

export interface Coordenadas {
    lat?: number;
    lng?: number;
}

export interface DatosTemporales {
    origen?: string;
    destino?: string;
    coordenadasOrigen?: Coordenadas;
    coordenadasDestino?: Coordenadas;
    // Campos para Agendamiento:
    fechaHoraInicio?: string;
    datosRegreso?: string;
    nombreCedula?: string;
    direccionContratante?: string;
    observaciones?: string;
    referencia?: string;
    numeroPasajeros?: string;
    temporizadorId?: NodeJS.Timeout;
    campoEnEdicion?: string;

    origenGuardado?: string;
  coordenadasOrigenGuardado?: {
    lat: number;
    lng: number;
  }

}

// Información del usuario que esta pidiendo el servicio de taxi
export interface SesionUsuario {
  telefono: string;
  estado: EstadoBot;
  nombre?: string;
  datosTemporales: DatosTemporales;
  ultimaInteraccion: Date;
}
