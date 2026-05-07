import CONFIG from '../config.js';

class AuthManager {
  constructor() {
    this.token = null;
    this.userInfo = null;
    this.isAuthenticated = false;
  }

  /**
   * Inicia o fluxo de login com Microsoft
   */
  login() {
    if (CONFIG.MICROSOFT_CLIENT_ID === 'ADICIONE_SEU_CLIENT_ID_AQUI') {
      alert('❌ Client ID do Microsoft não configurado em config.js');
      return;
    }

    const redirectUri = window.location.origin;
    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    
    authUrl.searchParams.append('client_id', CONFIG.MICROSOFT_CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', 'openid profile email');
    authUrl.searchParams.append('prompt', 'select_account');

    window.location.href = authUrl.toString();
  }

  /**
   * Manipula o callback após login
   */
  async handleAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      console.error('❌ Erro no login:', error);
      alert(`Erro na autenticação: ${error}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code) {
      console.log('📝 Código de autorização recebido, trocando por token...');
      await this.exchangeCodeForToken(code);
    }
  }

  /**
   * Troca o código por um token de acesso
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          redirectUri: window.location.origin
        })
      });

      const data = await response.json();

      if (data.success && data.accessToken) {
        this.token = data.accessToken;
        this.userInfo = data.userInfo;
        this.isAuthenticated = true;

        // Armazenar token
        localStorage.setItem('gc_auth_token', this.token);
        localStorage.setItem('gc_user_info', JSON.stringify(this.userInfo));

        console.log('✅ Login bem-sucedido!');
        
        // Limpar URL e redirecionar
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.href = window.location.pathname;
      } else {
        throw new Error(data.error || 'Erro ao autenticar');
      }
    } catch (error) {
      console.error('❌ Erro ao trocar código:', error);
      alert('Erro ao autenticar. Por favor, tente novamente.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  /**
   * Carrega token armazenado
   */
  loadStoredToken() {
    const token = localStorage.getItem('gc_auth_token');
    const userInfo = localStorage.getItem('gc_user_info');

    if (token && userInfo) {
      this.token = token;
      this.userInfo = JSON.parse(userInfo);
      this.isAuthenticated = true;
      console.log('✅ Token restaurado');
    }
  }

  /**
   * Faz logout
   */
  logout() {
    localStorage.removeItem('gc_auth_token');
    localStorage.removeItem('gc_user_info');
    this.token = null;
    this.userInfo = null;
    this.isAuthenticated = false;
    window.location.href = window.location.pathname;
  }

  /**
   * Obtém o token
   */
  getToken() {
    return this.token;
  }

  /**
   * Obtém info do usuário
   */
  getUserInfo() {
    return this.userInfo;
  }

  /**
   * Verifica se está autenticado
   */
  isLoggedIn() {
    return this.isAuthenticated && !!this.token;
  }
}

// Instância global
export const authManager = new AuthManager();
export default authManager;
