// src/services/whatsapp.service.ts
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const META_TOKEN = process.env.META_TOKEN;
const META_TELEFONO_ID = process.env.META_TELEFONO_ID;

// Función universal para enviar texto por WhatsApp
export const enviarMensajeTexto = async (
  telefonoDestino: string,
  texto: string,
) => {
  try {
    const url = `https://graph.facebook.com/v17.0/${META_TELEFONO_ID}/messages`;

    const data = {
      messaging_product: "whatsapp",
      to: telefonoDestino,
      type: "text",
      text: { body: texto },
    };

    const config = {
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        "Content-Type": "application/json",
      },
    };

    await axios.post(url, data, config);
    console.log(` Mensaje enviado a ${telefonoDestino}`);
  } catch (error: any) {
    console.error(
      ` Error enviando mensaje a ${telefonoDestino}:`,
      error.response?.data || error.message,
    );
  }
};

export const enviarBotones = async (numeroTelefono: string, texto: string, botones: { id: string, titulo: string }[]) => {
  const url = `https://graph.facebook.com/v17.0/${process.env.META_TELEFONO_ID}/messages`;

  // Traducimos tus botones simples al formato exacto que exige Meta
  const botonesFormateados = botones.map(boton => ({
    type: "reply",
    reply: {
      id: boton.id,
      title: boton.titulo // Máximo 20 caracteres obligatoriamente
    }
  }));

  const payload = {
    messaging_product: "whatsapp",
    to: numeroTelefono,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: texto },
      action: { buttons: botonesFormateados }
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ Error de Meta enviando botones:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("❌ Error de red:", error);
  }
};
