import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_APP_URL = process.env.API_APP_URL;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export const enviarSolicitudTaxi = async (datosServicio: any) => {
  try {
    const respuesta = await axios.post(
      `${API_APP_URL}/servicios`,
      datosServicio,
    );
    return respuesta.data;
  } catch (error: any) {
    console.error("Error enviando datos a la API central:", error.message);
    throw error;
  }
};

// 🌍 NUEVO RADAR POTENCIADO POR GOOGLE MAPS
export const verificarUbicacionEnPaipa = async (
  entrada: string,
): Promise<{
  valida: boolean;
  lat?: number;
  lng?: number;
  direccionFormateada?: string;
}> => {
  try {
    const entradaLimpia = entrada
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    // 1. Filtro de palabras relativas (Tu lógica original era excelente, la mantenemos)
    const palabrasRelativas = [
      "casa",
      "mi casa",
      "la casa",
      "trabajo",
      "aqui",
      "aca",
      "donde estoy",
      "mismo",
      "alla",
    ];
    if (palabrasRelativas.includes(entradaLimpia)) {
      console.log(`⚠️ Dirección relativa rechazada: "${entrada}"`);
      return { valida: false };
    }

    // 2. ¿Es un PIN de GPS o es Texto escrito?
    const esCoordenada = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(entrada);
    let url = "";

    if (esCoordenada) {
      const [lat, lng] = entrada.split(",");
      // Reverse Geocoding: Si nos mandan el GPS de WhatsApp, le pedimos a Google que nos diga qué calle es
      url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat.trim()},${lng.trim()}&key=${GOOGLE_MAPS_API_KEY}`;
    } else {
      // Forward Geocoding: Si escriben "Pizza Nostra", le pedimos a Google que nos dé las coordenadas.
      // 🎯 FORZAMOS la búsqueda en Paipa para que no busque en otra ciudad del mundo
      const query = encodeURIComponent(`${entrada}, Paipa, Boyaca, Colombia`);
      url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${GOOGLE_MAPS_API_KEY}`;
    }

    // 3. Disparamos la consulta al motor de Google
    const response = await axios.get(url);
    const data = response.data;

    // 4. Si Google encuentra el lugar exitosamente
    if (data.status === "OK" && data.results.length > 0) {
      const resultado = data.results[0];
      const direccionStr = resultado.formatted_address || "";
      const lat = resultado.geometry.location.lat;
      const lng = resultado.geometry.location.lng;

      // 🛡️ Filtro de seguridad: Validamos que Google no se haya salido de Paipa
      if (direccionStr.toLowerCase().includes("paipa")) {
        console.log(
          `✅ [Google Maps] Encontrado: ${direccionStr} (Lat: ${lat}, Lng: ${lng})`,
        );

        return {
          valida: true,
          lat: lat,
          lng: lng,
          // Si mandaron GPS guardamos el nombre de la calle, si escribieron guardamos lo que escribieron
          direccionFormateada: esCoordenada ? direccionStr : entrada,
        };
      } else {
        console.log(
          `⚠️ [Google Maps] El lugar existe, pero no está en Paipa: ${direccionStr}`,
        );
        return { valida: false };
      }
    }

    console.log(`❌ [Google Maps] No sabe qué es ni dónde queda: "${entrada}"`);
    return { valida: false };
  } catch (error: any) {
    console.error("❌ Error crítico en el radar de ubicación:", error.message);
    return { valida: false };
  }
};
