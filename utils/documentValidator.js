// utils/documentValidator.js
const Anthropic = require('@anthropic-ai/sdk');

class DocumentValidator {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
  }

  async validateDocumentSimple(documentType) {
    // Validación simple sin Claude (temporal)
    console.log(`📄 Validación simple para ${documentType}`);
    
    return {
      isValid: true,
      confidence: 95,
      reason: `Documento de ${documentType} recibido y procesado correctamente`,
      extractedInfo: {
        numeroPredial: documentType === 'predial' ? 'PRED-2025-12345' : null,
        matricula: documentType === 'certificado_libertad' ? 'MAT-0218584' : null,
        fechaExpedicion: new Date().toLocaleDateString('es-CO'),
        propietario: 'Juan Carlos Pérez Gómez'
      }
    };
  }

  async validateDocument(documentData, documentType, mimeType = 'image/jpeg') {
    try {
      const systemPrompt = documentType === 'predial' 
        ? this.getPredialValidationPrompt()
        : this.getCertificadoValidationPrompt();

      let content = [];
      
      // Determinar si es imagen o PDF
      if (mimeType.includes('pdf')) {
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: documentData
          }
        });
      } else {
        // Es imagen
        const imageType = mimeType.includes('png') ? 'image/png' : 'image/jpeg';
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: imageType,
            data: documentData
          }
        });
      }

      content.push({
        type: "text",
        content: `Analiza este ${mimeType.includes('pdf') ? 'PDF' : 'imagen'} y determina si es un ${documentType === 'predial' ? 'recibo de predial' : 'certificado de libertad y tradición'} válido para una propiedad en Colombia.`
      });

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: content
        }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('Error validando documento:', error);
      return {
        isValid: false,
        confidence: 0,
        reason: "Error técnico al validar el documento. Por favor, intenta nuevamente con una imagen más clara o un PDF legible.",
        extractedInfo: {}
      };
    }
  }

  getPredialValidationPrompt() {
    return `Eres un experto en documentos inmobiliarios colombianos. Analiza el documento para determinar si es un recibo de predial válido.

Un recibo de predial válido debe contener:
- Logo o encabezado de la alcaldía municipal o entidad recaudadora
- Número de cuenta predial o código catastral
- Dirección completa del inmueble
- Valor del impuesto predial
- Año gravable o período fiscal
- Información del propietario o contribuyente
- Fecha de vencimiento
- Código de barras, QR o número de referencia para pago (opcional)

CRITERIOS DE VALIDACIÓN:
- Debe ser legible y de calidad suficiente para leer la información
- Debe contener al menos 4 de los elementos principales listados
- La información debe ser coherente (fechas, montos, códigos)
- No debe ser una factura de servicios públicos u otro tipo de documento

RESPONDE EXACTAMENTE EN ESTE FORMATO JSON:
{
  "isValid": true/false,
  "confidence": número entre 0-100,
  "reason": "explicación detallada del por qué es válido o no válido",
  "extractedInfo": {
    "numeroPredial": "número encontrado o null",
    "direccion": "dirección encontrada o null",
    "propietario": "nombre del propietario o null",
    "vigencia": "año o período fiscal o null",
    "valorImpuesto": "valor del impuesto o null",
    "entidadRecaudadora": "nombre de la alcaldía o entidad o null"
  }
}`;
  }

  getCertificadoValidationPrompt() {
    return `Eres un experto en documentos inmobiliarios colombianos. Analiza el documento para determinar si es un certificado de libertad y tradición válido.

Un certificado de libertad y tradición válido debe contener:
- Logo oficial de la Superintendencia de Notariado y Registro
- Número de matrícula inmobiliaria
- Fecha de expedición (debe ser reciente, máximo 3 meses)
- Información completa del titular registral/propietario
- Descripción detallada del inmueble (dirección, área, linderos)
- Estado de libertad del inmueble (gravámenes, embargos, etc.)
- Código QR o código de verificación oficial
- Firma digital o sello oficial
- Número de folios

CRITERIOS DE VALIDACIÓN:
- Debe tener formato oficial de la Superintendencia de Notariado y Registro
- Fecha de expedición no mayor a 90 días
- Debe contener matrícula inmobiliaria
- Información del inmueble debe estar completa
- Debe ser legible y de calidad suficiente

RESPONDE EXACTAMENTE EN ESTE FORMATO JSON:
{
  "isValid": true/false,
  "confidence": número entre 0-100,
  "reason": "explicación detallada del por qué es válido o no válido",
  "extractedInfo": {
    "matricula": "número de matrícula inmobiliaria o null",
    "fechaExpedicion": "fecha de expedición encontrada o null",
    "titular": "nombre del titular registral o null",
    "direccionInmueble": "dirección del inmueble o null",
    "estadoLibertad": "descripción del estado de libertad o null",
    "areaInmueble": "área del inmueble si está especificada o null",
    "oficiaRegistro": "oficina de registro que expidió o null"
  }
}`;
  }
}

module.exports = { DocumentValidator };