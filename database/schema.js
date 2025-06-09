// database/schema.js
const { RedisClient } = require('./redis');
const { formatPhoneNumber } = require('../utils/helpers');

const propertyDataSchema = {
  id: String,
  cliente: {
    nombre: String,
    apellido: String,
    tipo_documento: String,
    numero_documento: String,
    pais: String,
    celular: String,
    email: String,
    ciudad_inmueble: String,
    direccion_inmueble: String,
    matricula_inmobiliaria: String,
    timestamp: Date
  },
  
  propiedad: {
    tipo_propiedad: String,
    area_m2: Number,
    habitaciones: Number,
    banos: Number,
    precio_venta: Number,
    estado_propiedad: String,
    estrato: Number,
    parqueadero: Boolean,
    caracteristicas_especiales: Array,
    piso: Number,
    disponibilidad_visita: String,
    fotos_disponibles: Boolean,
    descripcion_adicional: String
  },
  
  proceso: {
    step_actual: String,
    campos_completados: Array,
    fecha_inicio: Date,
    fecha_completado: Date,
    status: String,
    mensajes_pendientes: Array,
    ultima_actividad: Date
  }
};

// PropertyDatabase con Redis
class PropertyDatabase {
  constructor() {
    this.redis = new RedisClient();
    this.memoryFallback = new Map(); // Fallback en caso de problemas con Redis
  }

  async create(data) {
    const id = `PROP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const propertyData = {
      id,
      ...data,
      proceso: {
        ...data.proceso,
        fecha_inicio: new Date(),
        status: 'en_progreso'
      }
    };
    
    // IMPORTANTE: Normalizar el número antes de guardar
    const phoneNumber = formatPhoneNumber(data.cliente.celular);
    console.log(`📞 Normalizando número para crear: ${data.cliente.celular} -> ${phoneNumber}`);
    
    // Actualizar el número normalizado en los datos
    propertyData.cliente.celular = phoneNumber;
    
    // Intentar guardar en Redis
    const redisSaved = await this.redis.saveProperty(phoneNumber, propertyData);
    
    if (!redisSaved) {
      // Fallback a memoria
      console.log('⚠️ Usando fallback de memoria para crear');
      this.memoryFallback.set(phoneNumber, propertyData);
    }
    
    return propertyData;
  }
  
  async findByPhone(phoneNumber) {
    // Normalizar número antes de buscar
    const normalizedPhone = formatPhoneNumber(phoneNumber);
    console.log(`🔍 Buscando propiedad: ${phoneNumber} -> ${normalizedPhone}`);
    
    // Intentar obtener de Redis primero
    let property = await this.redis.getProperty(normalizedPhone);
    
    if (!property) {
      // Fallback a memoria
      property = this.memoryFallback.get(normalizedPhone) || null;
      if (property) {
        console.log('📱 Usando datos de memoria (fallback)');
      } else {
        console.log(`❌ Propiedad no encontrada en Redis ni memoria: ${normalizedPhone}`);
      }
    }
    
    return property;
  }
  
  async update(phoneNumber, data) {
    // Normalizar número
    const normalizedPhone = formatPhoneNumber(phoneNumber);
    console.log(`🔄 Actualizando propiedad: ${phoneNumber} -> ${normalizedPhone}`);
    
    // Intentar actualizar en Redis
    const redisUpdated = await this.redis.updateProperty(normalizedPhone, data);
    
    if (!redisUpdated) {
      // Fallback a memoria
      const existing = this.memoryFallback.get(normalizedPhone);
      if (existing) {
        const updated = {
          ...existing,
          ...data,
          proceso: {
            ...existing.proceso,
            ...data.proceso,
            ultima_actividad: new Date()
          }
        };
        this.memoryFallback.set(normalizedPhone, updated);
        console.log('⚠️ Actualizado en memoria (fallback)');
        return updated;
      } else {
        console.log(`❌ No se pudo actualizar - propiedad no existe: ${normalizedPhone}`);
        return null;
      }
    }
    
    return await this.findByPhone(normalizedPhone);
  }
  
  async getAll() {
    // Obtener de Redis
    const redisProperties = await this.redis.getAllProperties();
    
    // Combinar con memoria (fallback)
    const memoryProperties = Array.from(this.memoryFallback.values());
    
    // Eliminar duplicados (preferir Redis)
    const allProperties = [...redisProperties];
    const redisPhones = new Set(redisProperties.map(p => {
      const phone = p.cliente?.celular || p.phoneNumber;
      return formatPhoneNumber(phone);
    }));
    
    memoryProperties.forEach(prop => {
      const normalizedPhone = formatPhoneNumber(prop.cliente.celular);
      if (!redisPhones.has(normalizedPhone)) {
        allProperties.push(prop);
      }
    });
    
    console.log(`📊 Total propiedades encontradas: ${allProperties.length} (Redis: ${redisProperties.length}, Memoria: ${memoryProperties.length})`);
    return allProperties;
  }
  
  async delete(phoneNumber) {
    const normalizedPhone = formatPhoneNumber(phoneNumber);
    console.log(`🗑️ Eliminando propiedad: ${phoneNumber} -> ${normalizedPhone}`);
    
    const redisDeleted = await this.redis.deleteProperty(normalizedPhone);
    const memoryDeleted = this.memoryFallback.delete(normalizedPhone);
    
    console.log(`🗑️ Eliminación completada - Redis: ${redisDeleted}, Memoria: ${memoryDeleted}`);
    return redisDeleted || memoryDeleted;
  }

  async healthCheck() {
    const redisOk = await this.redis.ping();
    const totalProperties = await this.getAll();
    
    return {
      redis: redisOk,
      memory: this.memoryFallback.size,
      total: totalProperties.length
    };
  }

  // Método de debug
  async debugRedisKeys() {
    return await this.redis.debugKeys();
  }

  // Método para verificar la normalización de números
  async debugPhoneNormalization(inputPhone) {
    const normalized = formatPhoneNumber(inputPhone);
    console.log(`🔍 Debug normalización: "${inputPhone}" -> "${normalized}"`);
    
    // Verificar si existe en Redis
    const existsInRedis = await this.redis.getProperty(normalized);
    
    // Verificar si existe en memoria
    const existsInMemory = this.memoryFallback.get(normalized);
    
    return {
      input: inputPhone,
      normalized: normalized,
      existsInRedis: !!existsInRedis,
      existsInMemory: !!existsInMemory,
      redisData: existsInRedis ? { id: existsInRedis.id, status: existsInRedis.proceso?.status } : null,
      memoryData: existsInMemory ? { id: existsInMemory.id, status: existsInMemory.proceso?.status } : null
    };
  }

  // Método para migrar datos con números mal normalizados
  async migratePhoneNumbers() {
    console.log('🔄 Iniciando migración de números de teléfono...');
    
    try {
      // Obtener todas las claves de Redis
      const allKeys = await this.redis.debugKeys();
      const propertyKeys = allKeys.filter(key => key.startsWith('property:'));
      
      let migrated = 0;
      
      for (const key of propertyKeys) {
        const phone = key.replace('property:', '');
        const normalizedPhone = formatPhoneNumber(phone);
        
        // Si el número ya está normalizado, continuar
        if (phone === normalizedPhone) {
          continue;
        }
        
        console.log(`🔄 Migrando: ${phone} -> ${normalizedPhone}`);
        
        // Obtener datos con clave antigua
        const data = await this.redis.client.get(key);
        if (data) {
          const propertyData = JSON.parse(data);
          
          // Actualizar el número en los datos
          propertyData.cliente.celular = normalizedPhone;
          
          // Guardar con clave normalizada
          await this.redis.saveProperty(normalizedPhone, propertyData);
          
          // Eliminar clave antigua
          await this.redis.client.del(key);
          
          migrated++;
        }
      }
      
      console.log(`✅ Migración completada: ${migrated} propiedades migradas`);
      return migrated;
    } catch (error) {
      console.error('❌ Error en migración:', error);
      return 0;
    }
  }
}

module.exports = { propertyDataSchema, PropertyDatabase };