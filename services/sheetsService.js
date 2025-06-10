// services/sheetsService.js
const { google } = require('googleapis');
const path = require('path');

class SheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = '1aSdhS-KfxU7bG9aDhvTOb40zfx18qX0NP6vd1KlV8OU';
    this.range = 'Sheet1!A:X'; // Ajusta según el nombre de tu hoja
  }

  async initialize() {
    try {
      // Cargar credenciales
      const credentialsPath = path.join(__dirname, '../creds.json');
      
      this.auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      
      console.log('✅ Google Sheets inicializado correctamente');
      return true;
    } catch (error) {
      console.error('❌ Error inicializando Google Sheets:', error.message);
      return false;
    }
  }

  async addPropertyToSheet(propertyData) {
    try {
      if (!this.sheets) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('No se pudo inicializar Google Sheets');
        }
      }

      const { cliente, propiedad, proceso, id } = propertyData;
      
      // Preparar los datos en el orden correcto según las columnas
      const rowData = [
        id || '',
        new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
        cliente.nombre || '',
        cliente.apellido || '',
        cliente.tipo_documento || '',
        cliente.numero_documento || '',
        cliente.celular || '',
        cliente.email || '',
        cliente.ciudad_inmueble || '',
        cliente.direccion_inmueble || '',
        propiedad.tipo_propiedad || '',
        propiedad.area_m2 || '',
        propiedad.habitaciones || '',
        propiedad.banos || '',
        propiedad.precio_venta || '',
        propiedad.estado_propiedad || '',
        propiedad.parqueadero ? 'Sí' : 'No',
        propiedad.disponibilidad_visita || '',
        propiedad.predial?.extractedInfo?.numeroPredial || '',
        propiedad.certificado_libertad?.extractedInfo?.matricula || '',
        propiedad.predial?.extractedInfo?.entidadRecaudadora || '',
        propiedad.certificado_libertad?.extractedInfo?.oficiaRegistro || '',
        proceso.status || '',
        cliente.matricula_inmobiliaria || ''
      ];

      // Agregar fila al sheet
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData],
        },
      });

      console.log('✅ Propiedad agregada a Google Sheets:', {
        spreadsheetId: this.spreadsheetId,
        range: response.data.tableRange,
        updatedRows: response.data.updates.updatedRows
      });

      return {
        success: true,
        spreadsheetId: this.spreadsheetId,
        range: response.data.tableRange,
        updatedRows: response.data.updates.updatedRows
      };

    } catch (error) {
      console.error('❌ Error agregando propiedad a Google Sheets:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getSheetInfo() {
    try {
      if (!this.sheets) {
        await this.initialize();
      }

      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      return {
        success: true,
        title: response.data.properties.title,
        sheets: response.data.sheets.map(sheet => ({
          title: sheet.properties.title,
          sheetId: sheet.properties.sheetId,
          gridProperties: sheet.properties.gridProperties
        }))
      };
    } catch (error) {
      console.error('❌ Error obteniendo info del sheet:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createHeaders() {
    try {
      if (!this.sheets) {
        await this.initialize();
      }

      const headers = [
        'ID',
        'Fecha_Registro',
        'Nombre_Cliente',
        'Apellido_Cliente',
        'Documento',
        'Numero_Documento',
        'Telefono',
        'Email',
        'Ciudad',
        'Direccion',
        'Tipo_Propiedad',
        'Area_m2',
        'Habitaciones',
        'Banos',
        'Precio_Venta',
        'Estado_Propiedad',
        'Parqueadero',
        'Disponibilidad_Visita',
        'Numero_Predial',
        'Matricula_Libertad',
        'Entidad_Recaudadora',
        'Oficina_Registro',
        'Status_Proceso',
        'Matricula_Inmobiliaria'
      ];

      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Sheet1!A1:X1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers],
        },
      });

      console.log('✅ Headers creados en Google Sheets');
      return { success: true, response: response.data };
    } catch (error) {
      console.error('❌ Error creando headers:', error.message);
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, error: 'No se pudo inicializar' };
      }

      const info = await this.getSheetInfo();
      return info;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { SheetsService };