import CONFIG from './config.js';
import authManager from './modules/auth.js';

// API Configuration
const API_URL = CONFIG?.API_URL || "http://localhost:3000/api";

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
const newChatBtn = document.getElementById("newChatBtn");
const savedChatsList = document.getElementById("savedChatsList");

// Login Modal Elements
const loginModal = document.getElementById("loginModal");
const loginBtn = document.getElementById("loginBtn");
const closeModal = document.getElementById("closeModal");
const microsoftLoginBtn = document.getElementById("microsoftLoginBtn");

function openLoginModal() {
  loginModal.classList.add("active");
}

function closeLoginModal() {
  loginModal.classList.remove("active");
}

function redirectToMicrosoftLogin() {
  authManager.login();
}

if (loginBtn) loginBtn.addEventListener("click", openLoginModal);
if (closeModal) closeModal.addEventListener("click", closeLoginModal);
if (microsoftLoginBtn) microsoftLoginBtn.addEventListener("click", redirectToMicrosoftLogin);
if (loginModal) {
  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) closeLoginModal();
  });
}

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

menuBtn.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

const CHAT_STORAGE_KEY = "gc_saved_chats_v1";
const SYSTEM_PROMPT = "Você é um assistente virtual prestativo. Responda de forma clara e concisa em português.";

window.addEventListener('DOMContentLoaded', () => {
  authManager.loadStoredToken();
  authManager.handleAuthCallback();

  if (typeof marked === 'undefined') {
    console.error('❌ Marked.js NÃO foi carregado! Formatação Markdown não funcionará.');
  }

  loadSavedChats();
  startNewChat();
});

const conversationHistory = [{ role: "system", content: SYSTEM_PROMPT }];
let savedChats = [];
let currentChatId = null;
let currentSessionId = generateSessionId();

function generateSessionId() {
  return "session_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
}

function createSystemMessage() {
  return { role: "system", content: SYSTEM_PROMPT };
}

function resetConversationHistory(messages = [createSystemMessage()]) {
  conversationHistory.length = 0;
  messages.forEach((message) => conversationHistory.push(message));
}

function persistSavedChats() {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(savedChats));
  } catch (error) {
    console.error("Erro ao salvar chats:", error);
  }
}

function loadSavedChats() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    savedChats = Array.isArray(parsed) ? parsed : [];
    savedChats.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  } catch (error) {
    savedChats = [];
  }
  renderSavedChats();
}

function getChatTitle(messages) {
  const firstUserMessage = messages.find((entry) => entry.role === "user");
  if (!firstUserMessage?.content) return "Novo chat";

  const normalized = firstUserMessage.content.replace(/\s+/g, " ").trim();
  return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized;
}

function syncCurrentChatToStorage() {
  const hasUserContent = conversationHistory.some((entry) => entry.role === "user");
  if (!hasUserContent) {
    renderSavedChats();
    return;
  }

  const snapshot = {
    id: currentChatId || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: getChatTitle(conversationHistory),
    updatedAt: new Date().toISOString(),
    sessionId: currentSessionId,
    messages: conversationHistory.map((entry) => ({ ...entry }))
  };

  currentChatId = snapshot.id;
  const existingIndex = savedChats.findIndex((entry) => entry.id === snapshot.id);
  if (existingIndex !== -1) savedChats.splice(existingIndex, 1);

  savedChats.unshift(snapshot);
  persistSavedChats();
  renderSavedChats();
}

function formatChatDate(isoDate) {
  if (!isoDate) return "";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function deleteChat(chatId) {
  const chat = savedChats.find((entry) => entry.id === chatId);
  if (!chat) return;
  const confirmed = window.confirm(`Deseja excluir a conversa "${chat.title || "Novo chat"}"?`);
  if (!confirmed) return;

  savedChats = savedChats.filter((entry) => entry.id !== chatId);
  persistSavedChats();

  if (currentChatId === chatId) {
    if (savedChats.length > 0) loadChat(savedChats[0].id);
    else startNewChat();
    return;
  }
  renderSavedChats();
}

function renderSavedChats() {
  if (!savedChatsList) return;
  savedChatsList.innerHTML = "";
  if (savedChats.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "saved-chat-empty";
    emptyItem.textContent = "Nenhum chat salvo ainda";
    savedChatsList.appendChild(emptyItem);
    return;
  }

  savedChats.forEach((chat) => {
    const item = document.createElement("li");
    const row = document.createElement("div");
    row.className = "saved-chat-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "saved-chat-item";
    if (chat.id === currentChatId) button.classList.add("active");

    const name = document.createElement("span");
    name.className = "saved-chat-name";
    name.textContent = chat.title || "Novo chat";

    const date = document.createElement("span");
    date.className = "saved-chat-date";
    date.textContent = formatChatDate(chat.updatedAt);

    button.appendChild(name);
    button.appendChild(date);
    button.addEventListener("click", () => {
      loadChat(chat.id);
      closeSidebar();
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "saved-chat-delete";
    deleteButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
    `;
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteChat(chat.id);
    });

    row.appendChild(button);
    row.appendChild(deleteButton);
    item.appendChild(row);
    savedChatsList.appendChild(item);
  });
  
  updateExpandButton();
}

// 🔥 SEGREDO 1: Ao voltar para o menu, a caixa volta a ter 3 linhas
function deactivateChatMode() {
  welcomeWrapper.classList.remove("hidden");
  chatContainer.classList.remove("chat-active");
  mainContent.classList.remove("chat-active");
  inputContainer.classList.remove("fixed");
  if (userInput) {
    userInput.setAttribute("rows", "3");
  }
}

// 🔥 SEGREDO 2: Ao descer para o rodapé, a caixa é esmagada para 1 linha
function activateChatMode() {
  if (welcomeWrapper && !welcomeWrapper.classList.contains("hidden")) {
    welcomeWrapper.classList.add("hidden");
    chatContainer.classList.add("chat-active");
    mainContent.classList.add("chat-active");
    inputContainer.classList.add("fixed");
    if (userInput) {
      userInput.setAttribute("rows", "1");
    }
  }
}

function renderConversationFromHistory() {
  chatMessages.innerHTML = "";
  const visibleMessages = conversationHistory.filter((entry) => entry.role === "user" || entry.role === "assistant");
  if (visibleMessages.length === 0) {
    deactivateChatMode();
    return;
  }
  visibleMessages.forEach((entry) => addMessage(entry.content, entry.role, { skipScroll: true }));
  scrollToBottom();
}

function loadChat(chatId) {
  const chat = savedChats.find((entry) => entry.id === chatId);
  if (!chat) return;

  currentChatId = chat.id;
  currentSessionId = chat.sessionId || generateSessionId();

  const history = Array.isArray(chat.messages) && chat.messages.length > 0 ? chat.messages : [createSystemMessage()];
  resetConversationHistory(history);
  renderConversationFromHistory();
  renderSavedChats();
}

function startNewChat() {
  currentChatId = null;
  currentSessionId = generateSessionId();
  resetConversationHistory();
  chatMessages.innerHTML = "";
  deactivateChatMode();
  renderSavedChats();

  if (userInput) {
    userInput.value = "";
    userInput.style.height = "";
    if (sendBtn) sendBtn.classList.remove("has-text");
  }
}

async function sendMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  userInput.disabled = true;
  sendBtn.disabled = true;

  addMessage(message, "user");
  conversationHistory.push({ role: "user", content: message });
  syncCurrentChatToStorage();
  
  userInput.value = "";
  try {
    userInput.style.height = ""; 
    userInput.scrollTop = 0;
    sendBtn.classList.remove("has-text");
  } catch (e) {}

  const typingIndicator = showTypingIndicator();

  try {
    const headers = { "Content-Type": "application/json" };
    if (authManager.isLoggedIn()) headers["Authorization"] = `Bearer ${authManager.getToken()}`;

    const response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ 
        messages: conversationHistory, 
        sessionId: currentSessionId,
        agent_reference: CONFIG.AGENT_REFERENCE
      }),
    });

    const data = await response.json();
    typingIndicator.remove();

    if (response.ok && data.message) {
      const assistantMessage = data.message.content;
      addMessage(assistantMessage, "assistant");
      conversationHistory.push({ role: "assistant", content: assistantMessage });
      syncCurrentChatToStorage();
    } else {
      const fallbackMessage = data.error || "Desculpe, ocorreu um erro ao processar sua mensagem.";
      addMessage(fallbackMessage, "assistant");
      conversationHistory.push({ role: "assistant", content: fallbackMessage });
      syncCurrentChatToStorage();
    }
  } catch (error) {
    typingIndicator.remove();
    const connectionErrorMessage = "Erro de conexão. Verifique se o servidor está rodando.";
    addMessage(connectionErrorMessage, "assistant");
    conversationHistory.push({ role: "assistant", content: connectionErrorMessage });
    syncCurrentChatToStorage();
  }

  userInput.disabled = false;
  sendBtn.disabled = false;
  userInput.focus();
  try {
    userInput.style.height = ""; 
    userInput.scrollTop = 0;
    sendBtn.classList.remove("has-text");
  } catch (e) {}
}

function scrollToBottom() {
  const last = chatMessages.lastElementChild;
  if (last) {
    setTimeout(() => {
      try { last.scrollIntoView({ behavior: "smooth", block: "start" }); } 
      catch (e) { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }
    }, 50);
  }
}

function addMessage(text, sender, options = {}) {
  const { skipScroll = false } = options;
  activateChatMode();

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}`;
  
  if (sender === "assistant") {
    if (typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
      messageDiv.innerHTML = marked.parse(text);
      
      const links = messageDiv.querySelectorAll('a[href*="/api/download/"]');
      links.forEach(link => {
        const url = new URL(link.href, window.location.origin);
        const filename = decodeURIComponent(url.pathname.split('/').pop());
        
        link.setAttribute('download', filename);
        link.classList.add('pdf-download');
        
        link.addEventListener('click', (e) => {
          e.preventDefault();
          fetch(`${API_URL}/download/${encodeURIComponent(filename)}`)
            .then(response => {
              if (!response.ok) throw new Error(`Erro no servidor`);
              return response.json();
            })
            .then(data => {
              if (!data.success || !data.download_url) throw new Error('Link não fornecido.');
              const downloadLink = document.createElement('a');
              downloadLink.href = data.download_url;
              downloadLink.target = '_blank'; 
              downloadLink.download = filename;
              document.body.appendChild(downloadLink);
              downloadLink.click();
              document.body.removeChild(downloadLink);
            })
            .catch(error => { alert(`❌ Erro ao baixar:\n\n${error.message}`); });
        });
      });
    } else {
      messageDiv.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    }
  } else {
    messageDiv.textContent = text;
  }
  
  chatMessages.appendChild(messageDiv);
  if (!skipScroll) scrollToBottom();
}

function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  chatMessages.appendChild(indicator);
  scrollToBottom();
  return indicator;
}

sendBtn.addEventListener("click", sendMessage);

if (newChatBtn) {
  newChatBtn.addEventListener("click", (event) => {
    event.preventDefault();
    startNewChat();
    closeSidebar();
  });
}

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function updateExpandButton() {
  const expandBtn = document.getElementById("expandChatsBtn");
  const expandText = document.getElementById("expandChatsText");
  if (!expandBtn || !expandText) return;
  
  if (savedChats.length > 6) {
    expandBtn.style.display = "flex";
    expandText.textContent = !savedChatsList.classList.contains("collapsed") ? "Ver menos" : "Ver mais";
  } else {
    expandBtn.style.display = "none";
  }
}

const expandChatsBtn = document.getElementById("expandChatsBtn");
if (expandChatsBtn) {
  expandChatsBtn.addEventListener("click", () => {
    savedChatsList.classList.toggle("collapsed");
    expandChatsBtn.classList.toggle("expanded");
    updateExpandButton();
  });
}

// 🔥 SEGREDO 3: Medição limpa que impede o pulo no primeiro caractere digitado 🔥
userInput.addEventListener("input", () => {
  // Limpa a altura forçada primeiro para poder medir apenas o conteúdo real
  userInput.style.height = "auto"; 
  
  if (userInput.value === "") {
    userInput.style.height = ""; 
    sendBtn.classList.remove("has-text");
  } else {
    // Expande apenas se houver muito texto, limitando a 200px
    userInput.style.height = Math.min(userInput.scrollHeight, 200) + "px";
    sendBtn.classList.add("has-text");
  }
  userInput.scrollTop = 0;
});

userInput.addEventListener("paste", () => {
  setTimeout(() => {
    userInput.scrollTop = 0;
    if (userInput.value.trim()) sendBtn.classList.add("has-text");
  }, 10);
});