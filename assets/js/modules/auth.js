import CONFIG from '../config.js';

const API_URL = CONFIG.API_URL || "http://localhost:3000/api";
const TOKEN_KEY = "gc_auth_token";
let currentToken = null;

const authManager = {
  login: async () => {
    try {
      // 1. Pede a URL de login oficial gerada pelo seu servidor Python
      const response = await fetch(`${API_URL}/auth/login`);
      const data = await response.json();
      
      if (data.authorization_url) {
        // 2. Redireciona o utilizador para a Microsoft
        window.location.href = data.authorization_url;
      } else {
        console.error("Erro: URL de login não retornada pelo servidor.");
      }
    } catch (error) {
      console.error("Erro ao iniciar o processo de login:", error);
    }
  },

  handleAuthCallback: async () => {
    // Verifica se o utilizador acabou de voltar da Microsoft com um código na URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      try {
        // 3. Envia o código da Microsoft para o Python validar e gerar o crachá (JWT)
        const response = await fetch(`${API_URL}/auth/callback?code=${code}`);
        const data = await response.json();
        
        if (data.access_token) {
          // 4. Salva o crachá e limpa a URL do navegador
          currentToken = data.access_token;
          localStorage.setItem(TOKEN_KEY, currentToken);
          window.history.replaceState({}, document.title, window.location.pathname);
          return true;
        }
      } catch (error) {
        console.error("Erro ao processar o retorno da Microsoft:", error);
      }
    }
    return false;
  },

  loadStoredToken: () => {
    currentToken = localStorage.getItem(TOKEN_KEY);
    return currentToken;
  },

  getToken: () => currentToken,

  isLoggedIn: () => !!currentToken,

  logout: () => {
    currentToken = null;
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
  }
};

export default authManager;