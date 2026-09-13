export type ConsoleSectionData = {
  title: string;
  description: string;
  action: string;
  columns: string[];
  rows: string[][];
};

export const consoleSections = {
  organizaciones: {
    title: "Organizaciones",
    description:
      "Gestiona clientes contractuales, cadenas y agrupaciones con aislamiento por tenant.",
    action: "Nueva organización",
    columns: ["Organización", "Sedes", "Usuarios activos", "Plan", "Estado"],
    rows: [],
  },
  red: {
    title: "Red y gateways",
    description: "Inventario MikroTik, conectividad privada, versiones y estado de configuración.",
    action: "Registrar gateway",
    columns: ["Gateway", "Sede", "Modelo", "RouterOS", "Último heartbeat", "Estado"],
    rows: [],
  },
  usuarios: {
    title: "Usuarios WiFi",
    description: "Perfiles minimizados, dispositivos, consentimientos y visitas por sede.",
    action: "Exportación autorizada",
    columns: ["Usuario", "Identificador", "Última sede", "Visitas", "Marketing", "Última conexión"],
    rows: [],
  },
  sesiones: {
    title: "Sesiones",
    description: "Estado RADIUS, consumo y acciones de desconexión con trazabilidad completa.",
    action: "Actualizar",
    columns: ["Sesión", "Usuario", "Gateway", "Duración", "Consumo", "Estado"],
    rows: [],
  },
  dispositivos: {
    title: "Autorizados y bloqueos",
    description: "Controla dispositivos sin navegador y bloqueos temporales por ámbito y motivo.",
    action: "Autorizar dispositivo",
    columns: ["Dispositivo", "MAC minimizada", "Sede", "Política", "Caducidad", "Estado"],
    rows: [],
  },
  estadisticas: {
    title: "Estadísticas",
    description:
      "Métricas diferenciadas por usuario, dispositivo, sesión y visita con filtros de alcance.",
    action: "Crear informe",
    columns: ["Informe", "Ámbito", "Periodo", "Generado", "Formato", "Estado"],
    rows: [],
  },
  legal: {
    title: "Legal y privacidad",
    description: "Versiona textos legales, finalidades, consentimientos y solicitudes de derechos.",
    action: "Nuevo documento",
    columns: ["Documento", "Responsable", "Versión", "Idiomas", "Publicado", "Estado"],
    rows: [],
  },
  auditoria: {
    title: "Auditoría",
    description:
      "Registro inmutable de acciones sensibles, cambios, accesos y decisiones de autorización.",
    action: "Exportar evidencia",
    columns: ["Fecha", "Actor", "Acción", "Recurso", "Ámbito", "Resultado"],
    rows: [],
  },
  ajustes: {
    title: "Ajustes",
    description:
      "Configuración del tenant, seguridad, límites contratados e integraciones operativas.",
    action: "Guardar cambios",
    columns: ["Área", "Configuración", "Valor", "Heredado de", "Último cambio", "Estado"],
    rows: [],
  },
} satisfies Record<string, ConsoleSectionData>;

export type ConsoleSection = keyof typeof consoleSections;
