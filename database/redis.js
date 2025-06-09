// database/redis.js
const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = new Redis({
      host: process.env.UPSTASH_REDIS_URL?.replace('https://', '').replace('redis://', ''),
      port: 6379,
      password: process.env.UPSTASH_REDIS_TOKEN,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      tls: process.env.UPSTASH_REDIS_URL?.startsWith('https') ? {} : undefined
    });

    this.client.on('connect', () => {
      console.log('🔗 Redis conectado exitosamente');
    });

    this.client.on('error', (err) => {
      console.error('❌ Error Redis:', err.message);
    });
  }

  // Normalizar número de teléfono para clave consistente
  _normalizePhoneKey(phoneNumber) {
    // Siempre usar formato completo con 57
    let normalized = phoneNumber.toString().replace(/[^\d]/g, '');
    
    if (normalized.startsWith('57')) {
      return normalized;
    } else if (normalized.startsWith('3')) {
      return '57' + normalized;
    } else {
      return '57' + normalized;
    }
  }

  // Guardar datos de propiedad
  async saveProperty(phoneNumber, propertyData) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const key = `property:${normalizedPhone}`;
      const value = JSON.stringify({
        ...propertyData,
        lastUpdated: new Date().toISOString()
      });
      
      await this.client.setex(key, 86400, value); // Expira en 24 horas
      console.log(`💾 Propiedad guardada en Redis: ${normalizedPhone} (clave: ${key})`);
      return true;
    } catch (error) {
      console.error('Error guardando en Redis:', error);
      return false;
    }
  }

  // Obtener datos de propiedad
  async getProperty(phoneNumber) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const key = `property:${normalizedPhone}`;
      const data = await this.client.get(key);
      
      if (data) {
        const propertyData = JSON.parse(data);
        console.log(`📖 Propiedad encontrada en Redis: ${normalizedPhone} (clave: ${key})`);
        return propertyData;
      }
      
      console.log(`🔍 No se encontró propiedad en Redis: ${normalizedPhone} (clave: ${key})`);
      return null;
    } catch (error) {
      console.error('Error obteniendo de Redis:', error);
      return null;
    }
  }

  // Actualizar datos de propiedad
  async updateProperty(phoneNumber, updates) {
    try {
      const existing = await this.getProperty(phoneNumber);
      if (!existing) {
        const normalizedPhone = this._normalizePhoneKey(phoneNumber);
        console.log(`❌ No se puede actualizar - propiedad no existe: ${normalizedPhone}`);
        return false;
      }

      const updated = {
        ...existing,
        ...updates,
        lastUpdated: new Date().toISOString()
      };

      return await this.saveProperty(phoneNumber, updated);
    } catch (error) {
      console.error('Error actualizando en Redis:', error);
      return false;
    }
  }

  // Guardar estado de conversación
  async saveConversationState(phoneNumber, state) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const key = `conversation:${normalizedPhone}`;
      const value = JSON.stringify({
        ...state,
        lastUpdated: new Date().toISOString()
      });
      
      await this.client.setex(key, 3600, value); // Expira en 1 hora
      console.log(`💬 Conversación guardada: ${normalizedPhone}`);
      return true;
    } catch (error) {
      console.error('Error guardando conversación en Redis:', error);
      return false;
    }
  }

  // Obtener estado de conversación
  async getConversationState(phoneNumber) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const key = `conversation:${normalizedPhone}`;
      const data = await this.client.get(key);
      
      if (data) {
        console.log(`📖 Conversación encontrada: ${normalizedPhone}`);
        return JSON.parse(data);
      }
      
      return null;
    } catch (error) {
      console.error('Error obteniendo conversación de Redis:', error);
      return null;
    }
  }

  // Listar todas las propiedades
  async getAllProperties() {
    try {
      const keys = await this.client.keys('property:*');
      const properties = [];
      
      for (const key of keys) {
        const data = await this.client.get(key);
        if (data) {
          const property = JSON.parse(data);
          property.phoneNumber = key.replace('property:', '');
          properties.push(property);
        }
      }
      
      console.log(`📊 Total propiedades en Redis: ${properties.length}`);
      return properties;
    } catch (error) {
      console.error('Error obteniendo todas las propiedades:', error);
      return [];
    }
  }

  // Eliminar propiedad
  async deleteProperty(phoneNumber) {
    try {
      const normalizedPhone = this._normalizePhoneKey(phoneNumber);
      const propertyKey = `property:${normalizedPhone}`;
      const conversationKey = `conversation:${normalizedPhone}`;
      
      const deleted1 = await this.client.del(propertyKey);
      const deleted2 = await this.client.del(conversationKey);
      
      console.log(`🗑️ Propiedad eliminada de Redis: ${normalizedPhone} (eliminadas: ${deleted1 + deleted2} claves)`);
      return deleted1 > 0 || deleted2 > 0;
    } catch (error) {
      console.error('Error eliminando de Redis:', error);
      return false;
    }
  }

  // Verificar conexión
  async ping() {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Error en ping Redis:', error);
      return false;
    }
  }

  // Debug: listar todas las claves
  async debugKeys() {
    try {
      const allKeys = await this.client.keys('*');
      console.log('🔍 Todas las claves en Redis:', allKeys);
      return allKeys;
    } catch (error) {
      console.error('Error obteniendo claves:', error);
      return [];
    }
  }
}

module.exports = { RedisClient };