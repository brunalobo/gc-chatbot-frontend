// API Configuration
// Para desenvolvimento local, use: http://localhost:3000/api
// Para produção, atualize com a URL do servidor em produção

const CONFIG = {
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : '/api', // Em produção, use um proxy reverso ou URL completa
  
  // Configuração de timeouts
  REQUEST_TIMEOUT: 30000, // 30 segundos
  
  // Azure AI Agent Reference (atualizar com seu ID real)
  AGENT_REFERENCE: 'default-agent-id',
  
  // ========== AUTENTICAÇÃO MICROSOFT/AZURE AD ==========
  // IMPORTANTE: Adicione o Client ID do seu registro no Azure AD
  MICROSOFT_CLIENT_ID: 'ADICIONE_SEU_CLIENT_ID_AQUI', // Ex: '12345678-1234-1234-1234-123456789012'
  MICROSOFT_TENANT_ID: 'common', // Ou o ID do seu tenant
  
  // Outras configurações podem ser adicionadas aqui
  ENABLE_DEBUG: true,
};

export default CONFIG;
