import dotenv from "dotenv";
import express, { Request, Response } from "express";
// 👉 1. Nuevas importaciones para WebSockets
import http from "http";
import { Server } from "socket.io";

import { obtenerSesion, actualizarSesion } from "./services/session.service.js";
import {
  enviarMensajeTexto,
  enviarBotones,
} from "./services/whatsapp.service.js";
import { verificarUbicacionEnPaipa } from "./services/api.service.js";
import {
  enviarAlertaNuevoViaje,
  enviarAlertaViajeAgendado,
} from "./services/telegram.service.js";
import { EstadoBot } from "./types.js";
import * as chrono from "chrono-node";
import { conectarDB } from "./config/database.js";
import { ViajeModel } from "./models/viaje.model.js";
import cors from "cors";
import apiRoutes from "./routes/api.routes.js";

dotenv.config();

const app = express();

// ==========================================
// ⚡ CONFIGURACIÓN DE WEBSOCKETS (TIEMPO REAL)
// ==========================================
// 👉 2. Envolvemos Express con el servidor HTTP nativo
const server = http.createServer(app);

// 👉 3. Inicializamos Socket.io y lo exportamos para usarlo en otros archivos
export const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://transandes-frontend.vercel.app"], // Permite conexión desde tu React
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

export const getIO = () => io;

// 👉 4. Escuchamos conexiones entrantes
io.on("connection", (socket) => {
  console.log(`⚡ Cliente Web conectado en tiempo real (ID: ${socket.id})`);

  socket.on("disconnect", () => {
    console.log(`❌ Cliente Web desconectado (ID: ${socket.id})`);
  });
});
// ==========================================

app.use(
  cors({
    origin: ["http://localhost:5173", "https://transandes-frontend.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.get("/ping", (req: Request, res: Response) => {
  res.send(
    "El servidor TS del Chatbot de Transportadora de los Andes está vivo.",
  );
});

app.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ==========================================
// 🔌 API INTERNA (Rutas delegadas)
// ==========================================
// 🚨 AQUÍ ESTABA EL ERROR: Agregamos el /admin para que coincida con tu Frontend 🚨
app.use("/api/admin", apiRoutes);

// --- HELPER: FILTRO ANTI-TELEPATÍA ---
const esUbicacionRelativa = (texto: string): boolean => {
  const limpiado = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const relativas = [
    "casa",
    "mi casa",
    "la casa",
    "a mi casa",
    "para la casa",
    "pa la casa",
    "trabajo",
    "mi trabajo",
    "el trabajo",
    "al trabajo",
    "para el trabajo",
    "aqui",
    "aca",
    "donde estoy",
    "mismo",
    "mi hogar",
  ];
  return relativas.includes(limpiado);
};

// --- HELPER: VALIDADOR DE FECHAS A FUTURO (IA) ---
const validarFechaFutura = (texto: string): boolean => {
  let textoLimpio = texto.toLowerCase();
  textoLimpio = textoLimpio.replace(/min\b/g, " minutos");
  textoLimpio = textoLimpio.replace(/mins\b/g, " minutos");
  textoLimpio = textoLimpio.replace(/hrs\b/g, " horas");
  textoLimpio = textoLimpio.replace(/h\b/g, " horas");

  const resultados = chrono.es.parse(textoLimpio);

  if (resultados.length === 0) {
    return false;
  }

  const fechaEntendida = resultados[0].start.date();
  const fechaActual = new Date();
  const fechaMinima = new Date(fechaActual.getTime() + 30 * 60000);

  console.log(`\n🤖 [NLP DEBUG]`);
  console.log(`Original: "${texto}" | Limpio: "${textoLimpio}"`);
  console.log(`Chrono entendió: ${fechaEntendida.toLocaleString("es-CO")}`);
  console.log(`Fecha mínima permitida: ${fechaMinima.toLocaleString("es-CO")}`);

  if (fechaEntendida < fechaMinima) {
    console.log("❌ Resultado: RECHAZADO (Muy pronto o en el pasado)\n");
    return false;
  }

  console.log("✅ Resultado: APROBADO\n");
  return true;
};

// --- VERIFICACIÓN DE HORARIO DEL ASESOR ---
const estaAsesorDisponible = (): boolean => {
  const horaColombia = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }),
  );

  const dia = horaColombia.getDay();
  const hora = horaColombia.getHours();
  const minutos = horaColombia.getMinutes();

  const esDiaLaboral = dia >= 1 && dia <= 5;
  const esTurnoManana =
    hora === 9 || hora === 10 || (hora === 11 && minutos <= 30);
  const esTurnoTarde =
    (hora >= 14 && hora < 17) || (hora === 17 && minutos === 0);

  return esDiaLaboral && (esTurnoManana || esTurnoTarde);
};

// --- FUNCIÓN DEL CRONÓMETRO DE BÚSQUEDA ---
const iniciarTemporizadorBusqueda = (telefonoCliente: string) => {
  const TIEMPO_ESPERA = 30 * 1000;

  const timerId = setTimeout(async () => {
    const sesionActualizada = obtenerSesion(telefonoCliente);

    if (sesionActualizada.estado === EstadoBot.ESPERANDO_TAXI) {
      console.log(`⏱️ Tiempo agotado para ${telefonoCliente}.`);
      await enviarMensajeTexto(
        telefonoCliente,
        "⏳ Ha pasado un tiempo y ningún conductor ha aceptado aún. ¿Deseas seguir buscando un servicio? Responde *SI* para continuar esperando, o *NO* para cancelar.",
      );
      actualizarSesion(telefonoCliente, {
        estado: EstadoBot.REINTENTAR_BUSQUEDA,
      });
    }
  }, TIEMPO_ESPERA);

  const sesionActual = obtenerSesion(telefonoCliente);
  actualizarSesion(telefonoCliente, {
    datosTemporales: {
      ...sesionActual.datosTemporales,
      temporizadorId: timerId as any,
    },
  });
};

// --- MAPA GLOBAL PARA LOS GUARDIANES DE INACTIVIDAD ---
const timeoutsInactividad = new Map<string, NodeJS.Timeout>();

// --- FUNCIÓN: PERRO GUARDIÁN DE INACTIVIDAD ---
const reiniciarTemporizadorInactividad = (telefonoCliente: string) => {
  if (timeoutsInactividad.has(telefonoCliente)) {
    clearTimeout(timeoutsInactividad.get(telefonoCliente)!);
  }

  const sesion = obtenerSesion(telefonoCliente);

  if (
    sesion.estado === EstadoBot.INACTIVO ||
    sesion.estado === EstadoBot.HABLANDO_CON_ASESOR ||
    sesion.estado === EstadoBot.ESPERANDO_TAXI
  ) {
    return;
  }

  const TIEMPO_EXPIRACION = 10 * 60 * 1000;

  const nuevoTimer = setTimeout(async () => {
    console.log(
      `🧹 Sesión de ${telefonoCliente} limpiada por inactividad (Ghosting).`,
    );
    await enviarMensajeTexto(
      telefonoCliente,
      "⏳ *Tu sesión ha caducado por inactividad.*\n\nComo no recibimos respuesta, hemos cancelado la solicitud actual. Si aún necesitas un servicio de Transportadora de los Andes, simplemente escribe *Hola* para volver a empezar. 👋",
    );
    actualizarSesion(telefonoCliente, {
      estado: EstadoBot.INACTIVO,
      datosTemporales: {},
    });
    timeoutsInactividad.delete(telefonoCliente);
  }, TIEMPO_EXPIRACION);

  timeoutsInactividad.set(telefonoCliente, nuevoTimer);
};

// ==========================================
// 🧠 LÓGICA PRINCIPAL EXTRAÍDA
// ==========================================
const procesarFlujoBot = async (
  telefonoCliente: string,
  textoMensaje: string,
) => {
  console.log(`🧠 Procesando texto final: "${textoMensaje}"`);
  const mensajeMinusculas = textoMensaje.toLowerCase();

  // 🚨 COMANDO GLOBAL 1: CANCELAR 🚨
  if (mensajeMinusculas === "cancelar" || mensajeMinusculas === "salir") {
    const sesionActual = obtenerSesion(telefonoCliente);

    if (sesionActual.datosTemporales?.temporizadorId) {
      clearTimeout(sesionActual.datosTemporales.temporizadorId);
    }

    try {
      const viajeCancelado = await ViajeModel.findOneAndUpdate(
        { telefonoCliente: telefonoCliente, estadoViaje: "PENDIENTE" },
        { estadoViaje: "CANCELADO" },
        { sort: { fechaCreacion: -1 } },
      );

      if (viajeCancelado) {
        console.log(
          `🚫 [DB] Viaje cancelado por el cliente ${telefonoCliente}. El despachador ya no lo verá como pendiente.`,
        );
        io.emit("viajes_actualizados");
      }
    } catch (error) {
      console.error(
        "❌ Error al intentar cancelar el viaje en MongoDB:",
        error,
      );
    }

    await enviarMensajeTexto(
      telefonoCliente,
      "Proceso cancelado. Si necesitas un servicio más tarde, vuelve a escribirme *Hola*.",
    );

    actualizarSesion(telefonoCliente, {
      estado: EstadoBot.INACTIVO,
      datosTemporales: {},
    });

    // 🌟 COMANDO GLOBAL 2: CIERRE AMABLE (GRACIAS / FIN) 🌟
  } else if (
    mensajeMinusculas === "gracias" ||
    mensajeMinusculas === "fin" ||
    mensajeMinusculas === "terminar"
  ) {
    const sesionActual = obtenerSesion(telefonoCliente);
    if (sesionActual.datosTemporales?.temporizadorId) {
      clearTimeout(sesionActual.datosTemporales.temporizadorId);
    }

    await enviarMensajeTexto(
      telefonoCliente,
      "¡Con gusto! Para Transportadora de los Andes es un placer servirte. Que tengas un excelente día. 👋",
    );
    actualizarSesion(telefonoCliente, {
      estado: EstadoBot.INACTIVO,
      datosTemporales: {},
    });

    // 🚨 COMANDO GLOBAL 3: ASESOR HUMANO (CON HORARIO) 🚨
  } else if (
    mensajeMinusculas === "asesor" ||
    mensajeMinusculas === "humano" ||
    mensajeMinusculas === "agente"
  ) {
    const sesionActual = obtenerSesion(telefonoCliente);

    if (sesionActual.datosTemporales?.temporizadorId) {
      clearTimeout(sesionActual.datosTemporales.temporizadorId);
    }

    if (estaAsesorDisponible()) {
      await enviarMensajeTexto(
        telefonoCliente,
        "👨‍💻 Te estoy transfiriendo con nuestro equipo. Por favor, escribe tu consulta y un asesor te responderá en breve.\n\n_(Cuando termines de hablar con el asesor, escribe la palabra *Cancelar* para regresar al menú principal)_",
      );

      const numeroDespachador = process.env.TELEFONO_DESPACHADOR;
      if (numeroDespachador) {
        const nombreCliente = sesionActual.nombre
          ? sesionActual.nombre
          : "Un cliente";
        await enviarMensajeTexto(
          numeroDespachador,
          `🚨 *ALERTA DE SOPORTE* 🚨\n\n${nombreCliente} (Tel: +${telefonoCliente}) requiere atención manual.\n\nPor favor, atiende su solicitud en WhatsApp.`,
        );
      } else {
        console.error(
          "⚠️ Falla: No configuraste TELEFONO_DESPACHADOR en tu .env",
        );
      }

      actualizarSesion(telefonoCliente, {
        estado: EstadoBot.HABLANDO_CON_ASESOR,
        datosTemporales: {},
      });
    } else {
      await enviarMensajeTexto(
        telefonoCliente,
        "🏢 *Fuera de horario de atención*\n\nEn este momento nuestros asesores humanos no están disponibles.\n\n🕒 *Horario de atención (Lunes a Viernes):*\n• Mañanas: 9:00 AM - 11:30 AM\n• Tardes: 2:00 PM - 5:00 PM\n\nSi deseas utilizar nuestro sistema automático, por favor escribe *Hola*.",
      );
      actualizarSesion(telefonoCliente, {
        estado: EstadoBot.INACTIVO,
        datosTemporales: {},
      });
    }

    // 🚨 COMANDO GLOBAL 4: AGENDAR 🚨
  } else if (
    mensajeMinusculas === "agendar" ||
    (obtenerSesion(telefonoCliente).estado ===
      EstadoBot.ESPERANDO_OPCION_MENU &&
      textoMensaje === "2")
  ) {
    await enviarMensajeTexto(
      telefonoCliente,
      "Perfecto. Vamos a recolectar los datos para tu Planilla de Viaje Ocasional.\n\nPrimero, ¿cuál será el *Origen* de este viaje? (Ciudad o lugar)",
    );
    actualizarSesion(telefonoCliente, {
      estado: EstadoBot.AGENDAR_ORIGEN,
      datosTemporales: {},
    });

    // ➡️ FLUJO NORMAL
  } else {
    const sesion = obtenerSesion(telefonoCliente);

    switch (sesion.estado) {
      case EstadoBot.INACTIVO:
        await enviarBotones(
          telefonoCliente,
          "📄 *Política de Privacidad*\n\nPara Transportadora de los Andes S.A.S. es muy importante tu seguridad. Para enviarte un taxi, necesitamos que autorices el tratamiento de tus datos personales (como tu número y ubicación GPS) conforme a la Ley de Hábeas Data.\n\nhttps://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981\n\n¿Aceptas nuestra política de tratamiento de datos?",
          [
            { id: "acepto_datos", titulo: "✅ Sí, Acepto" },
            { id: "rechazo_datos", titulo: "❌ No Acepto" },
          ],
        );
        actualizarSesion(telefonoCliente, {
          estado: EstadoBot.ESPERANDO_ACEPTACION_DATOS,
        });
        break;

      case EstadoBot.ESPERANDO_ACEPTACION_DATOS:
        const respuestaDatos = textoMensaje.toLowerCase();

        if (
          respuestaDatos === "acepto_datos" ||
          respuestaDatos.includes("si") ||
          respuestaDatos.includes("sí")
        ) {
          await enviarBotones(
            telefonoCliente,
            "🚕 *Bienvenido a Transportadora de los Andes*\n\n¿En qué te podemos ayudar hoy?",
            [
              { id: "1", titulo: "Pedir Taxi" },
              { id: "2", titulo: "Agendar Viaje" },
              { id: "3", titulo: "Info y Tarifas" },
            ],
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_OPCION_MENU,
          });
        } else {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ Entendemos. Lamentablemente, no podemos procesar tu solicitud de taxi sin el tratamiento de datos para contactar al conductor.\n\nSi cambias de opinión, escribe *Hola* de nuevo. 👋",
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.INACTIVO,
            datosTemporales: {},
          });
        }
        break;

      case EstadoBot.ESPERANDO_OPCION_MENU:
        if (textoMensaje === "1") {
          // 🏨 MODO HOTEL: Buscamos si el cliente tiene un viaje anterior
          try {
            const ultimoViaje = await ViajeModel.findOne({
              telefonoCliente: telefonoCliente,
            }).sort({ fechaCreacion: -1 });

            if (
              ultimoViaje &&
              ultimoViaje.nombreCliente &&
              ultimoViaje.origen
            ) {
              // Encontramos historial, le ofrecemos el atajo
              actualizarSesion(telefonoCliente, {
                nombre: ultimoViaje.nombreCliente, // Guardamos el nombre en memoria
                datosTemporales: {
                  ...sesion.datosTemporales,
                  origenGuardado: ultimoViaje.origen,
                  coordenadasOrigenGuardado: ultimoViaje.coordenadasOrigen,
                },
                estado: EstadoBot.ESPERANDO_CONFIRMAR_DATOS_GUARDADOS,
              });

              await enviarBotones(
                telefonoCliente,
                `¡Hola de nuevo, *${ultimoViaje.nombreCliente}*! 👋\n\n¿Deseas pedir el taxi en la misma dirección de tu último viaje?\n📍 *${ultimoViaje.origen}*`,
                [
                  { id: "usar_guardado", titulo: "✅ Sí, aquí mismo" },
                  { id: "usar_nuevo", titulo: "❌ No, otra dirección" },
                ],
              );
              break; // Salimos del case
            }
          } catch (error) {
            console.error("Error buscando historial:", error);
          }

          // Si no tiene historial o hubo error, seguimos el flujo normal
          await enviarMensajeTexto(
            telefonoCliente,
            "Perfecto. Primero, ¿podrías decirme tu *nombre*?",
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_NOMBRE,
          });
        } else if (textoMensaje === "3") {
          await enviarBotones(
            telefonoCliente,
            "ℹ️ *Información de Transportadora de los Andes*\n\n¿Qué apartado te gustaría consultar?",
            [
              { id: "1", titulo: "Tarifas y Horarios" },
              { id: "2", titulo: "Misión y Visión" },
              { id: "3", titulo: "Volver al Menú" },
            ],
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_OPCION_INFO,
          });
        } else {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ Opción no válida. Por favor, responde únicamente con el número *1*, *2* o *3*.",
          );
        }
        break;

      // ==========================================
      // --- NUEVO: ATAJO MODO HOTEL ---
      // ==========================================
      case EstadoBot.ESPERANDO_CONFIRMAR_DATOS_GUARDADOS:
        if (textoMensaje.toLowerCase() === "usar_guardado") {
          // Aceptó el atajo: Saltamos directamente a pedirle la referencia!
          actualizarSesion(telefonoCliente, {
            datosTemporales: {
              ...sesion.datosTemporales,
              origen: sesion.datosTemporales.origenGuardado,
              coordenadasOrigen:
                sesion.datosTemporales.coordenadasOrigenGuardado,
            },
            estado: EstadoBot.ESPERANDO_REFERENCIA,
          });

          await enviarMensajeTexto(
            telefonoCliente,
            "¡Excelente! ✅\n\n¿Deseas agregar alguna *referencia* nueva para que el conductor te encuentre rápido? (Ej: Estoy en la recepción. Si no, responde 'No')",
          );
        } else {
          // Rechazó el atajo: Le pedimos el origen nuevo (ya sabemos su nombre)
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_ORIGEN,
          });
          await enviarMensajeTexto(
            telefonoCliente,
            `Entendido. Entonces, ¿En qué *Dirección o Barrio* te recojo hoy?\n_(Puedes enviar la dirección o tu ubicación GPS 📍)_`,
          );
        }
        break;

      // ==========================================
      // --- SUB-MENÚ DE INFORMACIÓN ---
      // ==========================================
      case EstadoBot.ESPERANDO_OPCION_INFO:
        if (textoMensaje === "1") {
          await enviarMensajeTexto(
            telefonoCliente,
            "🕒 *Horarios de Servicio:*\n• Despacho de Taxis: 24/7.\n• Atención de Asesores: L-V (9:00 AM - 11:30 AM y 2:00 PM - 5:00 PM).\n\n" +
              "💰 *Tarifas Oficiales:*\n¡Claro que sí! 🚕 Para tu comodidad, hemos publicado todas nuestras tarifas y recargos oficiales en nuestro Catálogo de WhatsApp.\n\n" +
              "Simplemente toca el ícono de la tiendita 🏪 en la parte superior de nuestro perfil (junto a nuestro nombre) para verlas en detalle.",
          );
          await enviarBotones(
            telefonoCliente,
            "¿En qué más te podemos ayudar hoy?",
            [
              { id: "1", titulo: "Pedir Taxi" },
              { id: "2", titulo: "Agendar Viaje" },
              { id: "3", titulo: "Info y Tarifas" },
            ],
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_OPCION_MENU,
          });
        } else if (textoMensaje === "2") {
          await enviarMensajeTexto(
            telefonoCliente,
            "🏢 *Transportadora de los Andes S.A.S.*\n\n🌟 *Misión:*\nSomos una empresa que presta el servicio de transporte publico terrestre automotor individual de pasajeros en vehículos tipo taxi, operando con conductores comprometidos a prestar un servicio con honestidad, seguridad y calidad que compense las necesidades de todos nuestros usuarios.\n\n👁️ *Visión:*\nMarcar la Diferencia siendo una empresa líder en la prestación del servicio público de transporte individual de pasajeros a través de servicios propios. Para llegar a convertirse en la principal empresa de taxis del municipio, solidaria, comprometida y competitiva, elevándose a un óptimo, eficiente y cuidadoso servicio con excelentes recursos humanos, vehiculares y tecnológico para satisfacer las necesidades de nuestros clientes.",
          );
          await enviarBotones(
            telefonoCliente,
            "¿En qué más te podemos ayudar hoy?",
            [
              { id: "1", titulo: "Pedir Taxi" },
              { id: "2", titulo: "Agendar Viaje" },
              { id: "3", titulo: "Info y Tarifas" },
            ],
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_OPCION_MENU,
          });
        } else if (textoMensaje === "3") {
          await enviarBotones(
            telefonoCliente,
            "🚕 *Bienvenido a Transportadora de los Andes*\n\n¿En qué te podemos ayudar hoy?",
            [
              { id: "1", titulo: "Pedir Taxi" },
              { id: "2", titulo: "Agendar Viaje" },
              { id: "3", titulo: "Info y Tarifas" },
            ],
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_OPCION_MENU,
          });
        } else {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ Opción no válida. Por favor, selecciona un botón del menú.",
          );
        }
        break;

      // ==========================================
      // FLUJO 1: PEDIR TAXI AHORA MISMO
      // ==========================================
      case EstadoBot.ESPERANDO_NOMBRE:
        actualizarSesion(telefonoCliente, {
          nombre: textoMensaje,
          estado: EstadoBot.ESPERANDO_ORIGEN,
        });
        await enviarMensajeTexto(
          telefonoCliente,
          `Un gusto, *${textoMensaje}*. ¿En qué *Dirección o Barrio* te recojo?\n_(Ej: Calle 25 #10-12, Barrio Centro, o envíame tu ubicación GPS)_`,
        );
        break;

      case EstadoBot.ESPERANDO_ORIGEN:
        // 🗺️ 1. Validación Inteligente con Google Maps
        const validacionOrigen = await verificarUbicacionEnPaipa(textoMensaje);

        if (!validacionOrigen.valida) {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ Parece que esta ubicación se encuentra fuera de Paipa o es muy ambigua.\n\nPara viajes intermunicipales o rurales, escríbeme la palabra *Agendar*.\n\nSi deseas intentar con otra dirección en Paipa escríbela aquí, envíame tu ubicación GPS 📍, o escribe *Cancelar* para abortar.",
          );
          break;
        }

        // 🗺️ 2. Guardar texto y coordenadas en la sesión temporal
        actualizarSesion(telefonoCliente, {
          datosTemporales: {
            ...sesion.datosTemporales,
            origen: validacionOrigen.direccionFormateada || textoMensaje,
            coordenadasOrigen: {
              lat: validacionOrigen.lat,
              lng: validacionOrigen.lng,
            },
          },
          estado: EstadoBot.ESPERANDO_REFERENCIA,
        });
        await enviarMensajeTexto(
          telefonoCliente,
          "¡Recibido! ✅\n\nPara que el conductor te encuentre más rápido, ¿puedes darnos una *referencia* del lugar?\n_(Ej: Casa de rejas negras, al lado de la panadería. Si no es necesario, responde 'No')_",
        );
        break;

      case EstadoBot.ESPERANDO_REFERENCIA:
        actualizarSesion(telefonoCliente, {
          datosTemporales: {
            ...sesion.datosTemporales,
            referencia: textoMensaje,
          },
          estado: EstadoBot.ESPERANDO_DESTINO,
        });
        // 💡 Modificación: Se informa que puede OMITIR el destino
        await enviarMensajeTexto(
          telefonoCliente,
          "Anotado. ¿Y hacia dónde te diriges?\n_(Puedes escribir la dirección, enviar la ubicación GPS 📍, o responder *OMITIR* si prefieres decirle el destino al conductor al subir)_",
        );
        break;

      case EstadoBot.ESPERANDO_DESTINO:
        const respDestinoLimpia = textoMensaje.toLowerCase().trim();
        let destinoFinal = "";
        let latDestino: number | undefined = undefined;
        let lngDestino: number | undefined = undefined;

        // 🛣️ NUEVO: Verificamos si el usuario decidió saltarse el destino
        if (
          respDestinoLimpia === "omitir" ||
          respDestinoLimpia === "no" ||
          respDestinoLimpia === "saltar"
        ) {
          destinoFinal = "A convenir con el conductor 🚕";
        } else {
          const orgComp = (sesion.datosTemporales.origen || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
          const dstComp = textoMensaje
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();

          if (orgComp === dstComp) {
            await enviarMensajeTexto(
              telefonoCliente,
              "⚠️ Me estás dando exactamente la misma dirección que pusiste de origen.\n\nPor favor, indícame un lugar de destino diferente o escribe *Omitir*:",
            );
            break;
          }

          // 🗺️ Validación Inteligente con Google Maps para el destino
          const validacionDestino =
            await verificarUbicacionEnPaipa(textoMensaje);

          if (!validacionDestino.valida) {
            await enviarMensajeTexto(
              telefonoCliente,
              "⚠️ El destino ingresado está fuera de nuestra zona de cobertura o no es claro.\n\nIntenta escribir otra dirección, envía un Pin de GPS 📍, escribe *Omitir* para no poner destino, o *Cancelar* para salir.",
            );
            break;
          }

          destinoFinal = validacionDestino.direccionFormateada || textoMensaje;
          latDestino = validacionDestino.lat;
          lngDestino = validacionDestino.lng;
        }

        // 🗺️ Guardamos en la sesión temporal (sea "a convenir" o la dirección real)
        actualizarSesion(telefonoCliente, {
          datosTemporales: {
            ...sesion.datosTemporales,
            destino: destinoFinal,
            coordenadasDestino:
              latDestino && lngDestino
                ? { lat: latDestino, lng: lngDestino }
                : undefined,
          },
          estado: EstadoBot.ESPERANDO_CONFIRMACION,
        });

        const origenG = sesion.datosTemporales.origen || "No definido";
        const refG =
          sesion.datosTemporales.referencia &&
          sesion.datosTemporales.referencia.toLowerCase() !== "no"
            ? `\n📍 Referencia: ${sesion.datosTemporales.referencia}`
            : "";
        const resumenT = `✅ *Confirmación de pedido:*\n\n👤 Cliente: ${sesion.nombre}\n📍 Origen: ${origenG}${refG}\n🏁 Destino: ${destinoFinal}\n\n¿Los datos son correctos? Responde *SI* para pedir el taxi, o *EDITAR* para corregir.`;

        await enviarMensajeTexto(telefonoCliente, resumenT);
        break;

      case EstadoBot.ESPERANDO_CONFIRMACION:
        const resp = textoMensaje.toLowerCase();
        if (resp.includes("si") || resp.includes("sí")) {
          // --- 💾 NUEVO: GUARDAR EN MONGODB Y LANZAR ALERTA A TELEGRAM ---
          try {
            const nuevoViaje = await ViajeModel.create({
              telefonoCliente: telefonoCliente,
              nombreCliente: sesion.nombre || "Cliente",
              tipoServicio: "INMEDIATO",
              origen: sesion.datosTemporales.origen,
              coordenadasOrigen: sesion.datosTemporales.coordenadasOrigen,
              destino: sesion.datosTemporales.destino,
              coordenadasDestino: sesion.datosTemporales.coordenadasDestino,
              referenciaOrigen:
                sesion.datosTemporales.referencia !== "no"
                  ? sesion.datosTemporales.referencia
                  : undefined,
              estadoViaje: "PENDIENTE",
            });
            console.log(
              `✅ [DB] Viaje inmediato guardado exitosamente para ${telefonoCliente}`,
            );

            io.emit("viajes_actualizados");

            // 🚀 DISPARAMOS EL COHETE HACIA EL GRUPO DE TELEGRAM
            await enviarAlertaNuevoViaje(
              nuevoViaje._id.toString(),
              nuevoViaje.origen,
              nuevoViaje.destino,
              nuevoViaje.coordenadasOrigen?.lat,
              nuevoViaje.coordenadasOrigen?.lng,
              nuevoViaje.referenciaOrigen,
            );
          } catch (error) {
            console.error("❌ Error guardando viaje o enviando alerta:", error);
          }
          // ------------------------------------

          await enviarMensajeTexto(
            telefonoCliente,
            "¡Solicitud enviada! Estamos buscando al conductor más cercano. Te avisaré apenas uno acepte tu viaje.",
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_TAXI,
          });
          iniciarTemporizadorBusqueda(telefonoCliente);
        } else if (
          resp.includes("editar") ||
          resp.includes("no") ||
          resp.includes("corregir")
        ) {
          await enviarMensajeTexto(
            telefonoCliente,
            "Entendido, vamos a corregir. Por favor, dime nuevamente: ¿En qué *Dirección o Barrio* te recojo?",
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_ORIGEN,
            datosTemporales: {},
          });
        } else {
          await enviarMensajeTexto(
            telefonoCliente,
            "Responde *SI* para pedir tu taxi, *EDITAR* para corregir, o *Cancelar* para salir.",
          );
        }
        break;

      case EstadoBot.REINTENTAR_BUSQUEDA:
        if (textoMensaje.toLowerCase().includes("si")) {
          await enviarMensajeTexto(
            telefonoCliente,
            "¡Entendido! Seguiremos buscando el conductor más cercano para ti.",
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.ESPERANDO_TAXI,
          });
          iniciarTemporizadorBusqueda(telefonoCliente);
        } else if (textoMensaje.toLowerCase().includes("no")) {
          await enviarMensajeTexto(
            telefonoCliente,
            "Búsqueda cancelada. Si necesitas un taxi más tarde, solo escríbeme 'Hola'.",
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.INACTIVO,
            datosTemporales: {},
          });
        } else {
          await enviarMensajeTexto(
            telefonoCliente,
            "Responde *SI* para seguir esperando, o *NO* para cancelar.",
          );
        }
        break;

      // ==========================================
      // FLUJO 2: AGENDAR VIAJE (PLANILLA OCASIONAL)
      // ==========================================
      case EstadoBot.AGENDAR_ORIGEN:
        if (esUbicacionRelativa(textoMensaje)) {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ Por favor, escríbeme la *Ciudad o Municipio* exacto de origen.",
          );
          break;
        }
        actualizarSesion(telefonoCliente, {
          datosTemporales: { ...sesion.datosTemporales, origen: textoMensaje },
          estado: EstadoBot.AGENDAR_DESTINO,
        });
        await enviarMensajeTexto(
          telefonoCliente,
          "¿Cuál será el *Destino* de este viaje? (Ciudad o lugar)",
        );
        break;

      case EstadoBot.AGENDAR_DESTINO:
        if (esUbicacionRelativa(textoMensaje)) {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ Por favor, escríbeme la *Ciudad o Municipio* exacto de destino.",
          );
          break;
        }
        const orgA = (sesion.datosTemporales.origen || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
        const dstA = textoMensaje
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
        if (orgA === dstA) {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ El origen y el destino no pueden ser el mismo lugar. Por favor, indícame un destino diferente:",
          );
          break;
        }
        actualizarSesion(telefonoCliente, {
          datosTemporales: { ...sesion.datosTemporales, destino: textoMensaje },
          estado: EstadoBot.AGENDAR_PASAJEROS,
        });
        await enviarMensajeTexto(
          telefonoCliente,
          "¿Para cuántos *pasajeros* es este viaje? (Ej: 4 personas)",
        );
        break;

      case EstadoBot.AGENDAR_PASAJEROS:
        actualizarSesion(telefonoCliente, {
          datosTemporales: {
            ...sesion.datosTemporales,
            numeroPasajeros: textoMensaje,
          },
          estado: EstadoBot.AGENDAR_FECHA_HORA,
        });
        await enviarMensajeTexto(
          telefonoCliente,
          "¿En qué *Fecha y Hora* iniciará el viaje?\n_(Ejemplo: 08 de Febrero a las 4:00 AM)_",
        );
        break;

      case EstadoBot.AGENDAR_FECHA_HORA:
        if (!validarFechaFutura(textoMensaje)) {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ Esa fecha no es válida o parece que ya pasó. ⏱️\n\nPor favor, indícame una fecha y hora en el futuro.\n_(Ejemplo: mañana a las 3 PM, o el 15 de marzo a las 8 AM)_",
          );
          break;
        }
        actualizarSesion(telefonoCliente, {
          datosTemporales: {
            ...sesion.datosTemporales,
            fechaHoraInicio: textoMensaje,
          },
          estado: EstadoBot.AGENDAR_REGRESO,
        });
        await enviarMensajeTexto(
          telefonoCliente,
          "¿El viaje incluye regreso con el mismo vehículo?\n_(Responde SI indicando la fecha de regreso, o responde NO)_",
        );
        break;

      case EstadoBot.AGENDAR_REGRESO:
        actualizarSesion(telefonoCliente, {
          datosTemporales: {
            ...sesion.datosTemporales,
            datosRegreso: textoMensaje,
          },
          estado: EstadoBot.AGENDAR_NOMBRE_CEDULA,
        });
        await enviarMensajeTexto(
          telefonoCliente,
          "Ahora los datos del contratante.\n\nPor favor, escribe el *Nombre Completo y Número de Identificación (C.C. o NIT)*.",
        );
        break;

      case EstadoBot.AGENDAR_NOMBRE_CEDULA:
        const tieneLetras = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]{3,}/.test(textoMensaje);
        const tieneNumerosCedula = /\d{5,}/.test(textoMensaje);
        const tieneEspacio = /\s/.test(textoMensaje);

        if (!tieneLetras || !tieneNumerosCedula || !tieneEspacio) {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ Formato incorrecto. Por favor, asegúrate de separar tu *Nombre* y tu *Número de Identificación* con un espacio.\n\n_(Ejemplo: Juan Perez 10456789)_",
          );
          break;
        }
        actualizarSesion(telefonoCliente, {
          datosTemporales: {
            ...sesion.datosTemporales,
            nombreCedula: textoMensaje,
          },
          estado: EstadoBot.AGENDAR_DIRECCION,
        });
        await enviarMensajeTexto(
          telefonoCliente,
          "¿Cuál es la *Dirección de residencia* del contratante?",
        );
        break;

      case EstadoBot.AGENDAR_DIRECCION:
        actualizarSesion(telefonoCliente, {
          datosTemporales: {
            ...sesion.datosTemporales,
            direccionContratante: textoMensaje,
          },
          estado: EstadoBot.AGENDAR_OBSERVACIONES,
        });
        await enviarMensajeTexto(
          telefonoCliente,
          "Por último, ¿hay alguna *Observación* importante o paradas en la ruta? (Ej: Entrar a Moniquirá). Si no hay paradas, escribe 'Ninguna'.",
        );
        break;

      case EstadoBot.AGENDAR_OBSERVACIONES:
        const obs = textoMensaje;
        const temp = sesion.datosTemporales;
        actualizarSesion(telefonoCliente, {
          datosTemporales: { ...temp, observaciones: obs },
          estado: EstadoBot.AGENDAR_CONFIRMACION,
        });

        const resumenAgendamiento = `✅ *Resumen para Planilla de Viaje:*\n\n📍 Origen: ${temp.origen}\n🏁 Destino: ${temp.destino}\n👥 Pasajeros: ${temp.numeroPasajeros}\n📅 Salida: ${temp.fechaHoraInicio}\n🔄 Regreso: ${temp.datosRegreso}\n👤 Contratante: ${temp.nombreCedula}\n🏠 Dirección: ${temp.direccionContratante}\n📞 Teléfono: ${telefonoCliente}\n📝 Observaciones: ${obs}\n\n¿Los datos están listos? Responde *SI* para confirmar, o *EDITAR* para corregir los datos.`;
        await enviarMensajeTexto(telefonoCliente, resumenAgendamiento);
        break;

      case EstadoBot.AGENDAR_CONFIRMACION:
        const respAgenda = textoMensaje.toLowerCase();
        if (respAgenda.includes("si") || respAgenda.includes("sí")) {
          const temp = sesion.datosTemporales;
          try {
            const nuevoAgendamiento = await ViajeModel.create({
              telefonoCliente: telefonoCliente,
              nombreCliente: temp.nombreCedula
                ? temp.nombreCedula.split(" ")[0]
                : "Contratante",
              tipoServicio: "AGENDADO",
              origen: temp.origen,
              destino: temp.destino,
              numeroPasajeros: temp.numeroPasajeros,
              fechaHoraInicio: temp.fechaHoraInicio,
              datosRegreso: temp.datosRegreso,
              identificacionContratante: temp.nombreCedula,
              direccionContratante: temp.direccionContratante,
              observaciones: temp.observaciones,
              estadoViaje: "PENDIENTE",
            });
            console.log(
              `✅ [DB] Planilla FUEC guardada exitosamente para ${telefonoCliente}`,
            );

            io.emit("viajes_actualizados");

            // 🚀 DISPARAMOS LA ALERTA ADMINISTRATIVA A TELEGRAM
            await enviarAlertaViajeAgendado(nuevoAgendamiento);
          } catch (error) {
            console.error(
              "❌ Error guardando Planilla FUEC en MongoDB:",
              error,
            );
          }

          await enviarMensajeTexto(
            telefonoCliente,
            "¡Tu viaje ocasional ha sido agendado exitosamente! \n\nHemos enviado tu solicitud a la central. Un asesor se comunicará contigo pronto para la asignación del vehículo, el valor del servicio y la generación de tu planilla oficial.",
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.INACTIVO,
            datosTemporales: {},
          });
        } else if (
          respAgenda.includes("editar") ||
          respAgenda.includes("no") ||
          respAgenda.includes("corregir")
        ) {
          await enviarMensajeTexto(
            telefonoCliente,
            "🛠️ ¿Qué dato deseas corregir? Responde con el número de la opción:\n\n1. Origen\n2. Destino\n3. Pasajeros\n4. Fecha y Hora de salida\n5. Regreso\n6. Nombre y Cédula\n7. Dirección\n8. Observaciones",
          );
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.AGENDAR_SELECCIONAR_EDICION,
          });
        } else {
          await enviarMensajeTexto(
            telefonoCliente,
            "Por favor responde *SI* para confirmar, *EDITAR* para corregir datos, o *Cancelar* para salir.",
          );
        }
        break;

      // ==========================================
      // --- BLOQUES DE EDICIÓN INTELIGENTE ---
      // ==========================================
      case EstadoBot.AGENDAR_SELECCIONAR_EDICION:
        const opcionesEdicion: Record<
          string,
          { campo: string; mensaje: string }
        > = {
          "1": { campo: "origen", mensaje: "📍 Escribe el nuevo *Origen*:" },
          "2": { campo: "destino", mensaje: "🏁 Escribe el nuevo *Destino*:" },
          "3": {
            campo: "numeroPasajeros",
            mensaje: "👥 Escribe la nueva cantidad de *Pasajeros*:",
          },
          "4": {
            campo: "fechaHoraInicio",
            mensaje: "📅 Escribe la nueva *Fecha y Hora* de salida:",
          },
          "5": {
            campo: "datosRegreso",
            mensaje: "🔄 Escribe los nuevos datos de *Regreso* (o NO):",
          },
          "6": {
            campo: "nombreCedula",
            mensaje: "👤 Escribe el nuevo *Nombre y Cédula*:",
          },
          "7": {
            campo: "direccionContratante",
            mensaje: "🏠 Escribe la nueva *Dirección de residencia*:",
          },
          "8": {
            campo: "observaciones",
            mensaje: "📝 Escribe las nuevas *Observaciones*:",
          },
        };

        const seleccion = textoMensaje.trim();
        if (opcionesEdicion[seleccion]) {
          actualizarSesion(telefonoCliente, {
            estado: EstadoBot.AGENDAR_EDITANDO_CAMPO,
            datosTemporales: {
              ...sesion.datosTemporales,
              campoEnEdicion: opcionesEdicion[seleccion].campo,
            },
          });
          await enviarMensajeTexto(
            telefonoCliente,
            opcionesEdicion[seleccion].mensaje,
          );
        } else {
          await enviarMensajeTexto(
            telefonoCliente,
            "⚠️ Opción no válida. Por favor, responde con un número del 1 al 8.",
          );
        }
        break;

      case EstadoBot.AGENDAR_EDITANDO_CAMPO:
        const campo = sesion.datosTemporales.campoEnEdicion;

        if (campo === "fechaHoraInicio") {
          if (!validarFechaFutura(textoMensaje)) {
            await enviarMensajeTexto(
              telefonoCliente,
              "⚠️ Fecha inválida o en el pasado. Intenta de nuevo con una fecha futura:",
            );
            break;
          }
        } else if (campo === "nombreCedula") {
          const tieneLetras = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]{3,}/.test(textoMensaje);
          const tieneNumerosCedula = /\d{5,}/.test(textoMensaje);
          const tieneEspacio = /\s/.test(textoMensaje);
          if (!tieneLetras || !tieneNumerosCedula || !tieneEspacio) {
            await enviarMensajeTexto(
              telefonoCliente,
              "⚠️ Formato incorrecto. Por favor, asegúrate de separar tu *Nombre* y tu *Número de Identificación* con un espacio.\n\n_(Ejemplo: Juan Perez 10456789)_",
            );
            break;
          }
        } else if (campo === "origen" || campo === "destino") {
          // Validamos también con el radar para asegurar congruencia al editar
          const validacionEdicion =
            await verificarUbicacionEnPaipa(textoMensaje);
          if (!validacionEdicion.valida) {
            await enviarMensajeTexto(
              telefonoCliente,
              "⚠️ Dato impreciso o fuera de zona. Escribe el *Barrio o Dirección exacta* o envía un Pin de GPS 📍:",
            );
            break;
          }
          // Si pasa, guardamos la dirección limpia que nos da Google o el usuario
          textoMensaje = validacionEdicion.direccionFormateada || textoMensaje;
        }

        const tempEditado: any = {
          ...sesion.datosTemporales,
          [campo as string]: textoMensaje,
          campoEnEdicion: undefined,
        };
        actualizarSesion(telefonoCliente, {
          datosTemporales: tempEditado,
          estado: EstadoBot.AGENDAR_CONFIRMACION,
        });
        const nuevoResumen = `✅ *Resumen Actualizado:*\n\n📍 Origen: ${tempEditado.origen}\n🏁 Destino: ${tempEditado.destino}\n👥 Pasajeros: ${tempEditado.numeroPasajeros}\n📅 Salida: ${tempEditado.fechaHoraInicio}\n🔄 Regreso: ${tempEditado.datosRegreso}\n👤 Contratante: ${tempEditado.nombreCedula}\n🏠 Dirección: ${tempEditado.direccionContratante}\n📞 Teléfono: ${telefonoCliente}\n📝 Observaciones: ${tempEditado.observaciones}\n\n¿Los datos están listos? Responde *SI* para confirmar, o *EDITAR* para corregir algo más.`;
        await enviarMensajeTexto(telefonoCliente, nuevoResumen);
        break;

      // ==========================================
      // --- SILENCIO: HABLANDO CON HUMANO ---
      // ==========================================
      case EstadoBot.HABLANDO_CON_ASESOR:
        console.log(
          `🤫 Bot en silencio. ${telefonoCliente} está conversando con el despachador.`,
        );
        break;

      // ==========================================
      // --- CIERRE DE SESIÓN: CALIFICACIÓN ---
      // ==========================================
      case EstadoBot.ESPERANDO_CALIFICACION:
        let estrellas = 0;
        if (textoMensaje === "cal_3") estrellas = 3;
        else if (textoMensaje === "cal_2") estrellas = 2;
        else if (textoMensaje === "cal_1") estrellas = 1;

        if (estrellas > 0) {
          try {
            await ViajeModel.findOneAndUpdate(
              { telefonoCliente: telefonoCliente },
              { calificacion: estrellas },
              { sort: { fechaCreacion: -1 } },
            );
            console.log(
              `⭐ [DB] Calificación de ${estrellas} estrellas guardada para ${telefonoCliente}`,
            );
            io.emit("viajes_actualizados");
          } catch (error) {
            console.error("❌ Error guardando calificación en MongoDB:", error);
          }
        }

        // 💬 NUEVO: Le pedimos el comentario adicional
        await enviarMensajeTexto(
          telefonoCliente,
          "⭐ ¡Gracias por tu calificación!\n\n¿Te gustaría dejar un breve comentario o reseña sobre el servicio prestado? (Escribe tu comentario, o responde *NO* para terminar).",
        );

        actualizarSesion(telefonoCliente, {
          estado: EstadoBot.ESPERANDO_COMENTARIO_RESEÑA,
          datosTemporales: {},
        });
        break;

      // ==========================================
      // --- NUEVO: CIERRE Y COMENTARIO DE RESEÑA ---
      // ==========================================
      case EstadoBot.ESPERANDO_COMENTARIO_RESEÑA:
        const txtComentario = textoMensaje.toLowerCase().trim();

        if (
          txtComentario !== "no" &&
          txtComentario !== "omitir" &&
          txtComentario !== "ninguno"
        ) {
          try {
            // Guardamos el comentario en el último viaje de este cliente
            await ViajeModel.findOneAndUpdate(
              { telefonoCliente: telefonoCliente },
              { comentarioCalificacion: textoMensaje },
              { sort: { fechaCreacion: -1 } },
            );
            console.log(
              `📝 [DB] Comentario guardado para el viaje de ${telefonoCliente}`,
            );
            io.emit("viajes_actualizados");
          } catch (error) {
            console.error(
              "❌ Error guardando el comentario en MongoDB:",
              error,
            );
          }
        }

        await enviarMensajeTexto(
          telefonoCliente,
          "¡Recibido! Para Transportadora de los Andes tu opinión es fundamental para mejorar. Que tengas un excelente resto de jornada. 👋",
        );

        actualizarSesion(telefonoCliente, {
          estado: EstadoBot.INACTIVO,
          datosTemporales: {},
        });
        break;
    }
  }
  reiniciarTemporizadorInactividad(telefonoCliente);
};

// ==========================================
// 📥 RECEPCIÓN DE MENSAJES (WEBHOOK POST)
// ==========================================

// --- NUEVO: BUFFER PARA MENSAJES MÚLTIPLES ---
const bufferMensajes = new Map<
  string,
  { texto: string; timeout: NodeJS.Timeout }
>();

app.post("/webhook", async (req: Request, res: Response) => {
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    try {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message) {
        const telefonoCliente = message.from;
        let textoParcial = "";

        if (message.type === "text") {
          textoParcial = message.text?.body?.trim();
        } else if (message.type === "location") {
          const lat = message.location.latitude;
          const lng = message.location.longitude;
          textoParcial = `${lat}, ${lng}`;
        } else if (message.type == "interactive") {
          textoParcial = message.interactive?.button_reply?.id || "";
        }

        if (textoParcial) {
          // 1. Lógica del "Debouncer" (Buffer)
          if (bufferMensajes.has(telefonoCliente)) {
            clearTimeout(bufferMensajes.get(telefonoCliente)!.timeout);
            const textoAnterior = bufferMensajes.get(telefonoCliente)!.texto;
            bufferMensajes.get(telefonoCliente)!.texto =
              `${textoAnterior} ${textoParcial}`;
            console.log(
              `⏳ Concatenando mensaje de ${telefonoCliente}: "${textoParcial}"`,
            );
          } else {
            bufferMensajes.set(telefonoCliente, {
              texto: textoParcial,
              timeout: null as any,
            });
          }

          // 2. Iniciamos la cuenta regresiva
          const nuevoTimeout = setTimeout(async () => {
            const mensajeFinal =
              bufferMensajes.get(telefonoCliente)?.texto.trim() || "";
            bufferMensajes.delete(telefonoCliente);
            await procesarFlujoBot(telefonoCliente, mensajeFinal);
          }, 5000);

          bufferMensajes.get(telefonoCliente)!.timeout = nuevoTimeout;
        } else {
          console.log(
            `⚠️ Entrada no soportada de ${telefonoCliente} (Tipo: ${message.type})`,
          );
          await enviarMensajeTexto(
            telefonoCliente,
            "Lo siento, por ahora solo puedo entender mensajes de texto y ubicaciones de mapa.\n\nPor favor, escríbeme tu respuesta.",
          );
        }
      }
    } catch (error) {
      console.error("Error procesando el mensaje:", error);
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// 👉 5. Iniciamos la Base de Datos y encendemos el servidor principal (HTTP + WebSockets)
conectarDB().then(() => {
  server.listen(PORT, () => {
    console.log(
      `🚀 Servidor TS + WebSockets ejecutándose en http://localhost:${PORT}`,
    );
  });
});
