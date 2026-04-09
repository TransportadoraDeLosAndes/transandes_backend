import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { ViajeModel } from "../models/viaje.model.js";
import { enviarMensajeTexto, enviarBotones } from "./whatsapp.service.js";
import { actualizarSesion } from "./session.service.js";
import { EstadoBot } from "../types.js";
import { ConductorModel } from "../models/conductor.model.js";
import { getIO } from "../index.js"; 

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const groupId = process.env.TELEGRAM_GROUP_ID;

if (!token) {
  console.error("⚠️ CRÍTICO: Falta TELEGRAM_BOT_TOKEN en el .env");
}

export const telegramBot = new TelegramBot(token as string, { polling: true });

// 🛡️ PARCHE DE RED: Ignora los micro-cortes de internet para que no asusten en la consola
telegramBot.on("polling_error", (error: any) => {
  if (error.code === "EFATAL" || error.code === "ECONNRESET") {
    // Omitido para no hacer spam en consola
  } else {
    console.error(`⚠️ [Telegram Polling Error]:`, error.message);
  }
});

// ==========================================
// 📢 1. FUNCIÓN PARA GRITAR EN EL GRUPO (INMEDIATOS)
// ==========================================
export const enviarAlertaNuevoViaje = async (
  viajeId: string,
  origen: string,
  destino: string,
  lat?: number,
  lng?: number,
  referencia?: string,
) => {
  if (!groupId) {
    console.error("⚠️ No hay TELEGRAM_GROUP_ID configurado.");
    return;
  }

  const linkMapa =
    lat && lng
      ? `[📍 Abrir GPS para ir por el cliente](https://www.google.com/maps/search/?api=1&query=${lat},${lng})`
      : "";

  const textoReferencia =
    referencia && referencia.toLowerCase() !== "no"
      ? `\n📍 *Referencia:* ${referencia}`
      : "";

  const mensaje = `🚨 *NUEVO SERVICIO PENDIENTE* 🚨\n\n📍 *Origen:* ${origen}${textoReferencia}\n🏁 *Destino:* ${destino}\n\n${linkMapa}\n\n👇 El primero en presionar el botón se lo lleva:`;

  const opciones: TelegramBot.SendMessageOptions = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🚕 ACEPTAR VIAJE",
            callback_data: `aceptar_${viajeId}`,
          },
        ],
      ],
    },
  };

  try {
    await telegramBot.sendMessage(groupId, mensaje, opciones);
    console.log(`📢 [Telegram] Alerta de viaje inmediato enviada al grupo.`);
  } catch (error) {
    console.error("❌ Error enviando mensaje a Telegram:", error);
  }
};

// ==========================================
// 📅 1.5 FUNCIÓN PARA ALERTAR A LA CENTRAL (AGENDADOS)
// ==========================================
export const enviarAlertaViajeAgendado = async (viaje: any) => {
  if (!groupId) {
    console.error("⚠️ No hay TELEGRAM_GROUP_ID configurado.");
    return;
  }

  const mensaje =
    `📅 *NUEVA SOLICITUD DE VIAJE AGENDADO* 📅\n\n` +
    `👤 *Cliente:* ${viaje.nombreCliente}\n` +
    `📞 *Teléfono:* +${viaje.telefonoCliente}\n` +
    `📍 *Origen:* ${viaje.origen}\n` +
    `🏁 *Destino:* ${viaje.destino}\n` +
    `👥 *Pasajeros:* ${viaje.numeroPasajeros}\n` +
    `🗓️ *Fecha Salida:* ${viaje.fechaHoraInicio}\n` +
    `🔄 *Regreso:* ${viaje.datosRegreso}\n` +
    `📝 *Obs:* ${viaje.observaciones}\n\n` +
    `🚨 *ACCIÓN REQUERIDA:* Central, por favor contactar al cliente para cotizar y confirmar.\n\n` +
    `[📲 Toca aquí para abrir WhatsApp con el cliente](https://wa.me/${viaje.telefonoCliente})`;

  try {
    await telegramBot.sendMessage(groupId, mensaje, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
    console.log(`📅 [Telegram] Alerta de viaje agendado enviada a la central.`);
  } catch (error) {
    console.error("❌ Error enviando alerta de agendado a Telegram:", error);
  }
};

// ==========================================
// 👂 2. EL OÍDO DEL BOT: MANEJANDO BOTONES DE LOS VIAJES
// ==========================================
telegramBot.on("callback_query", async (query) => {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;
  const taxistaTelegramId = query.from.id.toString();

  // --- ESCENARIO A: UN TAXISTA ACEPTA EL VIAJE ---
  if (data && data.startsWith("aceptar_")) {
    const viajeId = data.split("_")[1];

    try {
      const conductorOficial = await ConductorModel.findOne({
        telegramId: taxistaTelegramId,
        estado: "ACTIVO",
      });

      if (!conductorOficial) {
        await telegramBot.answerCallbackQuery(query.id, {
          text: "❌ Acceso denegado. No estás registrado como conductor activo.",
          show_alert: true,
        });
        return;
      }

      const viajeActualizado = await ViajeModel.findOneAndUpdate(
        { _id: viajeId, estadoViaje: "PENDIENTE" },
        {
          estadoViaje: "ASIGNADO",
          conductorAsignadoTelegramId: taxistaTelegramId,
          observaciones: `Asignado a: ${conductorOficial.nombre} (Móvil: ${conductorOficial.numeroInterno})`,
        },
        { new: true },
      );

      if (viajeActualizado) {
        getIO().emit('viajes_actualizados');

        await telegramBot.answerCallbackQuery(query.id, {
          text: "¡Viaje asignado a ti! 🚕✅ Escríbele al cliente.",
          show_alert: false,
        });

        const telefonoCliente = viajeActualizado.telefonoCliente;
        const nombreCliente = viajeActualizado.nombreCliente || "Cliente";

        const textoRefTomado =
          viajeActualizado.referenciaOrigen &&
          viajeActualizado.referenciaOrigen.toLowerCase() !== "no"
            ? `\n📍 *Referencia:* ${viajeActualizado.referenciaOrigen}`
            : "";

        if (chatId && messageId) {
          await telegramBot.editMessageText(
            `✅ *VIAJE TOMADO*\n\n📍 *Origen:* ${viajeActualizado.origen}${textoRefTomado}\n🏁 *Destino:* ${viajeActualizado.destino}\n\n🚕 Asignado a: *Móvil ${conductorOficial.numeroInterno} (${conductorOficial.nombre})*\n\n👤 *Cliente:* ${nombreCliente}\n📞 *Teléfono:* +${telefonoCliente}\n\n[📲 Toca aquí para abrir WhatsApp con el cliente](https://wa.me/${telefonoCliente})`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: "Markdown",
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "🏁 MARCAR COMO COMPLETADO",
                      callback_data: `completar_${viajeId}`,
                    },
                  ],
                ],
              },
            },
          );
        }

        console.log(
          `✅ [Backend] Viaje asignado exitosamente a ${conductorOficial.nombre}`,
        );

        await enviarMensajeTexto(
          telefonoCliente,
          `🚕 *¡Tu taxi va en camino!*\n\nEl servicio ha sido asignado exitosamente:\n\n👨‍✈️ *Conductor:* ${conductorOficial.nombre}\n🚘 *Placa:* ${conductorOficial.placa}\n🔢 *Móvil:* ${conductorOficial.numeroInterno}\n📱 *Celular:* ${conductorOficial.telefono}\n\nEn un momento el conductor se comunicará contigo. ¡Gracias por confiar en Trans Andes! 👋`,
        );

        actualizarSesion(telefonoCliente, {
          estado: EstadoBot.INACTIVO,
          datosTemporales: {},
        });
      } else {
        await telegramBot.answerCallbackQuery(query.id, {
          text: "Lo siento, otro compañero fue más rápido. 😔",
          show_alert: true,
        });
      }
    } catch (error) {
      console.error("❌ Error al procesar la asignación del viaje:", error);
    }
  }

  // --- ESCENARIO B: EL TAXISTA TERMINA LA CARRERA ---
  else if (data && data.startsWith("completar_")) {
    const viajeId = data.split("_")[1];

    try {
      const conductorOficial = await ConductorModel.findOne({
        telegramId: taxistaTelegramId,
        estado: "ACTIVO",
      });
      if (!conductorOficial) {
        await telegramBot.answerCallbackQuery(query.id, {
          text: "❌ Acceso denegado.",
          show_alert: true,
        });
        return;
      }

      const viajeCompletado = await ViajeModel.findOneAndUpdate(
        {
          _id: viajeId,
          estadoViaje: "ASIGNADO",
          conductorAsignadoTelegramId: taxistaTelegramId,
        },
        { estadoViaje: "COMPLETADO" },
        { new: true },
      );

      if (viajeCompletado) {!
        getIO().emit('viajes_actualizados');

        await telegramBot.answerCallbackQuery(query.id, {
          text: "¡Excelente trabajo! Viaje finalizado. 🌟",
          show_alert: false,
        });

        if (chatId && messageId) {
          try {
            await telegramBot.deleteMessage(chatId, messageId);
            console.log(
              `🗑️ [Telegram] Mensaje del viaje ${viajeId} borrado del grupo.`,
            );
          } catch (deleteError) {
            console.error(
              "⚠️ No se pudo borrar el mensaje en Telegram:",
              deleteError,
            );
          }
        }

        console.log(
          `🌟 [Backend] Viaje ${viajeId} completado. Enviando encuesta a WhatsApp...`,
        );

        const telefonoCliente = viajeCompletado.telefonoCliente;

        await enviarBotones(
          telefonoCliente,
          "🚕 *¡Tu viaje ha finalizado!*\n\nEsperamos que hayas llegado bien a tu destino.\n\nPara Transportadora de los Andes tu opinión es vital. ¿Cómo calificarías el servicio prestado por el conductor?",
          [
            { id: "cal_3", titulo: "⭐⭐⭐ Excelente" },
            { id: "cal_2", titulo: "⭐⭐ Bueno" },
            { id: "cal_1", titulo: "⭐ Regular" },
          ],
        );

        actualizarSesion(telefonoCliente, {
          estado: EstadoBot.ESPERANDO_CALIFICACION,
          datosTemporales: {},
        });
      } else {
        const viajeCheck = await ViajeModel.findById(viajeId);
        if (
          viajeCheck &&
          viajeCheck.conductorAsignadoTelegramId !== taxistaTelegramId
        ) {
          await telegramBot.answerCallbackQuery(query.id, {
            text: "❌ ¡Ojo! Solo el conductor que aceptó este viaje puede marcarlo como completado.",
            show_alert: true,
          });
        } else {
          await telegramBot.answerCallbackQuery(query.id, {
            text: "Este viaje ya había sido completado o cancelado.",
            show_alert: true,
          });
        }
      }
    } catch (error) {
      console.error("❌ Error al completar el viaje:", error);
    }
  }
});

// ==========================================
// 🤖 3. AUTO-REGISTRO DE CONDUCTORES (CHAT PRIVADO)
// ==========================================
telegramBot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() || "";
  const telegramId = msg.from?.id?.toString();

  // 🛡️ Filtro estricto: Solo respondemos si es un chat privado
  if (msg.chat.type !== "private" || !text || !telegramId) return;

  // Paso 1: El taxista saluda al bot
  if (text === "/start") {
    await telegramBot.sendMessage(
      chatId,
      "🚕 *¡Bienvenido a Transportadora de los Andes!*\n\nPara vincular tu cuenta y empezar a recibir viajes, por favor escribe únicamente tu *Número de Móvil* (Ejemplo: 045 o 12).",
      { parse_mode: "Markdown" },
    );
    return;
  }

  // Paso 2: El taxista escribe su número de móvil (solo números)
  if (/^\d+$/.test(text)) {
    try {
      const conductor = await ConductorModel.findOne({ numeroInterno: text });

      if (!conductor) {
        await telegramBot.sendMessage(
          chatId,
          "❌ No encontré ningún móvil registrado con ese número en la base de datos de la central. Verifica e intenta de nuevo.",
        );
        return;
      }

      // Lo vinculamos
      await ConductorModel.findOneAndUpdate(
        { numeroInterno: text },
        { telegramId: telegramId, estado: "ACTIVO" },
      );

      await telegramBot.sendMessage(
        chatId,
        `✅ *¡Registro Exitoso, ${conductor.nombre}!*\n\nTu perfil ha sido vinculado al móvil *${text}* con la placa *${conductor.placa}*.\n\nYa estás autorizado. Puedes ir al grupo principal para empezar a tomar servicios. 🚀`,
        { parse_mode: "Markdown" },
      );

      console.log(
        `✅ [Registro] El móvil ${text} (${conductor.nombre}) se auto-vinculó en Telegram.`,
      );
    } catch (error) {
      console.error("❌ Error en auto-registro:", error);
      await telegramBot.sendMessage(
        chatId,
        "⚠️ Ocurrió un error en el sistema. Intenta de nuevo más tarde.",
      );
    }
  } else {
    // Si escribe letras en lugar de /start o números
    await telegramBot.sendMessage(
      chatId,
      "⚠️ Por favor, escribe únicamente tu Número de Móvil (solo números sin letras ni espacios).",
    );
  }
});