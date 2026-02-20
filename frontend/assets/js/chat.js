// API Configuration
const API_URL = "http://localhost:3000/api";

// DOM Elements
const chatMessages = document.getElementById("chatMessages");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const welcomeTitle = document.getElementById("welcomeTitle");
const welcomeWrapper = document.getElementById("welcomeWrapper");
const chatContainer = document.querySelector(".chat-container");
const mainContent = document.querySelector(".main-content");
const inputContainer = document.querySelector(".input-container");

// Sidebar Elements
const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menuBtn");
const sidebarClose = document.getElementById("sidebarClose");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const header = document.querySelector(".header");
const headerContent = document.querySelector(".header-content");
const mainElement = document.querySelector("main");
const headerLogo = document.querySelector(".header .logo");

// Login Modal Elements
const loginModal = document.getElementById("loginModal");
const loginBtn = document.getElementById("loginBtn");
const closeModal = document.getElementById("closeModal");
const microsoftLoginBtn = document.getElementById("microsoftLoginBtn");

// URL de login Microsoft (Azure AD)
const MICROSOFT_LOGIN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" +
  "client_id=SEU_CLIENT_ID&" +
  "response_type=code&" +
  "redirect_uri=" +
  encodeURIComponent(window.location.origin) +
  "&" +
  "scope=openid%20profile%20email";

// Modal Functions
function openLoginModal() {
  loginModal.classList.add("active");
}

function closeLoginModal() {
  loginModal.classList.remove("active");
}

function redirectToMicrosoftLogin() {
  // Redirecionar para página de login Microsoft
  window.location.href = MICROSOFT_LOGIN_URL;
}

// Login Modal Event Listeners
if (loginBtn) {
  loginBtn.addEventListener("click", openLoginModal);
}

if (closeModal) {
  closeModal.addEventListener("click", closeLoginModal);
}

if (microsoftLoginBtn) {
  microsoftLoginBtn.addEventListener("click", redirectToMicrosoftLogin);
}

// Fechar modal ao clicar fora
if (loginModal) {
  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) {
      closeLoginModal();
    }
  });
}

// Sidebar Functions
function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("active");
  headerContent.classList.add("sidebar-open");
  mainElement.classList.add("sidebar-open");
  inputContainer.classList.add("sidebar-open");
  menuBtn.classList.add("hidden");
  headerLogo.classList.add("hidden");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
  headerContent.classList.remove("sidebar-open");
  mainElement.classList.remove("sidebar-open");
  inputContainer.classList.remove("sidebar-open");
  menuBtn.classList.remove("hidden");
  headerLogo.classList.remove("hidden");
}

// Sidebar Event Listeners
menuBtn.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

// Session ID for Azure AI Agent threads
const sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

// Verificar se marked.js foi carregado
window.addEventListener('DOMContentLoaded', () => {
  if (typeof marked === 'undefined') {
    console.error('❌ Marked.js NÃO foi carregado! Formatação Markdown não funcionará.');
  } else {
    console.log('✅ Marked.js carregado com sucesso!');
  }
});

// Conversation history for Azure OpenAI
const conversationHistory = [
  {
    role: "system",
    content: "Você é um assistente virtual prestativo. Responda de forma clara e concisa em português."
  }
];

// Send message function
async function sendMessage() {
  const message = userInput.value.trim();

  if (!message) return;

  // Disable input while processing
  userInput.disabled = true;
  sendBtn.disabled = true;

  // Add user message to chat and history
  addMessage(message, "user");
  conversationHistory.push({ role: "user", content: message });
  
  userInput.value = "";
  // Reset textarea height and button state immediately after sending
  try {
    userInput.style.height = "52px";
    userInput.scrollTop = 0;
    sendBtn.classList.remove("has-text");
  } catch (e) {
    // ignore
  }

  // Show typing indicator
  const typingIndicator = showTypingIndicator();

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: conversationHistory, sessionId }),
    });

    const data = await response.json();

    // Remove typing indicator
    typingIndicator.remove();

    if (response.ok && data.message) {
      const assistantMessage = data.message.content;
      addMessage(assistantMessage, "assistant");
      conversationHistory.push({ role: "assistant", content: assistantMessage });
    } else {
      addMessage(
        data.error || "Desculpe, ocorreu um erro ao processar sua mensagem.",
        "assistant"
      );
    }
  } catch (error) {
    console.error("Error:", error);
    typingIndicator.remove();
    addMessage(
      "Erro de conexão. Verifique se o servidor está rodando.",
      "assistant"
    );
  }

  // Re-enable input
  userInput.disabled = false;
  sendBtn.disabled = false;
  userInput.focus();
  // Reset textarea height and scroll to default after sending
  try {
    userInput.style.height = "52px";
    userInput.scrollTop = 0;
    sendBtn.classList.remove("has-text");
  } catch (e) {
    // ignore if DOM not available
  }
}

// Hide welcome and activate chat mode
function activateChatMode() {
  if (welcomeWrapper && !welcomeWrapper.classList.contains("hidden")) {
    welcomeWrapper.classList.add("hidden");
    chatContainer.classList.add("chat-active");
    mainContent.classList.add("chat-active");
    inputContainer.classList.add("fixed");
  }
}

// Ensure messages area has enough bottom padding so last message is not hidden
function updateMessagesPadding() {
  // No longer needed - using fixed padding-bottom on main-content
}

// Scroll to latest message - scroll window/body so last message is visible above input
function scrollToBottom() {
  const last = chatMessages.lastElementChild;
  if (last) {
    setTimeout(() => {
      try {
        // Scroll window so the last message is in view, positioned at top of visible area
        last.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) {
        // fallback: scroll to bottom of page
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 50);
  }
}

// Add message to chat
function addMessage(text, sender) {
  // Activate chat mode on first message
  activateChatMode();

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}`;
  
  // Se for assistente, renderizar Markdown; se for usuário, texto simples
  if (sender === "assistant") {
    // Verificar se marked está disponível
    if (typeof marked !== 'undefined') {
      // Configurar marked para segurança e formatação
      marked.setOptions({
        breaks: true,        // Quebras de linha viram <br>
        gfm: true,          // GitHub Flavored Markdown
        headerIds: false,   // Não gerar IDs nos headers
        mangle: false       // Não codificar emails
      });
      messageDiv.innerHTML = marked.parse(text);
    } else {
      console.warn('Marked.js não encontrado, usando texto simples');
      // Fallback: pelo menos renderizar quebras de linha e negrito básico
      const formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
      messageDiv.innerHTML = formattedText;
    }
  } else {
    messageDiv.textContent = text;
  }
  
  chatMessages.appendChild(messageDiv);

  // Scroll to bottom with smooth animation
  scrollToBottom();
}

// Show typing indicator
function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.innerHTML = `
    <div class="typing-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  chatMessages.appendChild(indicator);
  scrollToBottom();
  return indicator;
}
// Event Listeners
sendBtn.addEventListener("click", sendMessage);

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 200) + "px";

  // Controlar posição do botão de enviar
  if (userInput.value.trim()) {
    sendBtn.classList.add("has-text");
  } else {
    sendBtn.classList.remove("has-text");
  }

  // Manter scroll no início do texto
  userInput.scrollTop = 0;
});

// Também verificar ao colar texto
userInput.addEventListener("paste", () => {
  setTimeout(() => {
    userInput.scrollTop = 0;

    // Controlar posição do botão após colar
    if (userInput.value.trim()) {
      sendBtn.classList.add("has-text");
    }
  }, 10);
});
// When textarea resizes, adjust messages padding so nothing is hidden
