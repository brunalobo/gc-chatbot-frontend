import CONFIG from './config.js';
import authManager from './modules/auth.js';

const API_URL = CONFIG?.API_URL || "http://localhost:3000/api";
const SYSTEM_PROMPT = "Você é um assistente virtual prestativo. Responda de forma clara e concisa em português.";

const elements = {
  chatMessages: document.getElementById("chatMessages"),
  userInput: document.getElementById("userInput"),
  sendBtn: document.getElementById("sendBtn"),
  welcomeWrapper: document.getElementById("welcomeWrapper"),
  chatContainer: document.querySelector(".chat-container"),
  mainContent: document.querySelector(".main-content"),
  inputContainer: document.querySelector(".input-container"),
  savedChatsList: document.getElementById("savedChatsList"),
  expandChatsBtn: document.getElementById("expandChatsBtn")
};

let conversationHistory = [{ role: "system", content: SYSTEM_PROMPT }];
let savedChats = [];
let currentChatId = null;
let currentSessionId = generateSessionId();

function generateSessionId() {
  return "session_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
}

window.addEventListener('DOMContentLoaded', async () => {
  authManager.loadStoredToken();
  authManager.handleAuthCallback();

  if (typeof marked === 'undefined') {
    console.error('Marked.js is required for Markdown formatting.');
  }

  setupEventListeners();
  await loadSavedChats();
  startNewChat();
});

function setupEventListeners() {
  const binds = [
    { id: "loginBtn", event: "click", handler: () => document.getElementById("loginModal").classList.add("active") },
    { id: "closeModal", event: "click", handler: () => document.getElementById("loginModal").classList.remove("active") },
    { id: "microsoftLoginBtn", event: "click", handler: () => authManager.login() },
    { id: "menuBtn", event: "click", handler: openSidebar },
    { id: "sidebarClose", event: "click", handler: closeSidebar },
    { id: "sidebarOverlay", event: "click", handler: closeSidebar },
    { id: "newChatBtn", event: "click", handler: (e) => { e.preventDefault(); startNewChat(); closeSidebar(); } },
    { id: "sendBtn", event: "click", handler: sendMessage }
  ];

  binds.forEach(b => {
    const el = document.getElementById(b.id);
    if (el) el.addEventListener(b.event, b.handler);
  });

  if (elements.userInput) {
    elements.userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    elements.userInput.addEventListener("input", handleInputResize);
    elements.userInput.addEventListener("paste", () => setTimeout(handleInputResize, 10));
  }

  if (elements.expandChatsBtn) {
    elements.expandChatsBtn.addEventListener("click", () => {
      elements.savedChatsList.classList.toggle("collapsed");
      elements.expandChatsBtn.classList.toggle("expanded");
      updateExpandButton();
    });
  }
}

function handleInputResize() {
  elements.userInput.style.height = "auto";
  if (elements.userInput.value === "") {
    elements.userInput.style.height = "";
    elements.sendBtn.classList.remove("has-text");
  } else {
    elements.userInput.style.height = Math.min(elements.userInput.scrollHeight, 200) + "px";
    elements.sendBtn.classList.add("has-text");
  }
  elements.userInput.scrollTop = 0;
}

function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarOverlay").classList.add("active");
  document.querySelector(".header-content").classList.add("sidebar-open");
  document.querySelector("main").classList.add("sidebar-open");
  elements.inputContainer.classList.add("sidebar-open");
  document.getElementById("menuBtn").classList.add("hidden");
  document.querySelector(".header .logo").classList.add("hidden");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("active");
  document.querySelector(".header-content").classList.remove("sidebar-open");
  document.querySelector("main").classList.remove("sidebar-open");
  elements.inputContainer.classList.remove("sidebar-open");
  document.getElementById("menuBtn").classList.remove("hidden");
  document.querySelector(".header .logo").classList.remove("hidden");
}

async function persistSavedChats(snapshot) {
  if (!authManager.isLoggedIn()) return;
  try {
    await fetch(`${API_URL}/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authManager.getToken()}`
      },
      body: JSON.stringify(snapshot)
    });
  } catch (error) {
    console.error("Storage error:", error);
  }
}

async function loadSavedChats() {
  if (!authManager.isLoggedIn()) {
    savedChats = [];
    renderSavedChats();
    return;
  }
  try {
    const response = await fetch(`${API_URL}/history`, {
      headers: { "Authorization": `Bearer ${authManager.getToken()}` }
    });
    savedChats = response.ok ? await response.json() : [];
  } catch (error) {
    savedChats = [];
  }
  renderSavedChats();
}

async function syncCurrentChatToStorage() {
  if (!conversationHistory.some(entry => entry.role === "user")) return renderSavedChats();

  const firstUserMsg = conversationHistory.find(entry => entry.role === "user")?.content || "Novo chat";
  const snapshot = {
    id: currentChatId || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: firstUserMsg.length > 40 ? `${firstUserMsg.replace(/\s+/g, " ").slice(0, 40)}...` : firstUserMsg,
    updatedAt: new Date().toISOString(),
    sessionId: currentSessionId,
    messages: [...conversationHistory]
  };

  currentChatId = snapshot.id;
  const existingIndex = savedChats.findIndex(entry => entry.id === snapshot.id);
  if (existingIndex !== -1) savedChats.splice(existingIndex, 1);

  savedChats.unshift(snapshot);
  await persistSavedChats(snapshot);
  renderSavedChats();
}

async function deleteChat(chatId) {
  const chat = savedChats.find(entry => entry.id === chatId);
  if (!chat || !window.confirm(`Deseja excluir a conversa "${chat.title || "Novo chat"}"?`)) return;

  savedChats = savedChats.filter(entry => entry.id !== chatId);
  
  if (authManager.isLoggedIn()) {
    try {
      await fetch(`${API_URL}/history/${chatId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${authManager.getToken()}` }
      });
    } catch (e) { console.error(e); }
  }

  if (currentChatId === chatId) {
    savedChats.length > 0 ? loadChat(savedChats[0].id) : startNewChat();
  } else {
    renderSavedChats();
  }
}

function renderSavedChats() {
  if (!elements.savedChatsList) return;
  elements.savedChatsList.innerHTML = "";
  
  if (savedChats.length === 0) {
    elements.savedChatsList.innerHTML = `<li class="saved-chat-empty">Nenhum chat salvo</li>`;
    return updateExpandButton();
  }

  savedChats.forEach(chat => {
    const item = document.createElement("li");
    const row = document.createElement("div");
    row.className = "saved-chat-row";

    const button = document.createElement("button");
    button.className = `saved-chat-item ${chat.id === currentChatId ? "active" : ""}`;
    button.innerHTML = `
      <span class="saved-chat-name">${chat.title || "Novo chat"}</span>
      <span class="saved-chat-date">${new Date(chat.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
    `;
    button.onclick = () => { loadChat(chat.id); closeSidebar(); };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "saved-chat-delete";
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>`;
    deleteBtn.onclick = async (e) => { e.stopPropagation(); await deleteChat(chat.id); };

    row.append(button, deleteBtn);
    item.appendChild(row);
    elements.savedChatsList.appendChild(item);
  });
  
  updateExpandButton();
}

function updateExpandButton() {
  if (!elements.expandChatsBtn) return;
  elements.expandChatsBtn.style.display = savedChats.length > 6 ? "flex" : "none";
  document.getElementById("expandChatsText").textContent = elements.savedChatsList.classList.contains("collapsed") ? "Ver mais" : "Ver menos";
}

function setChatMode(active) {
  elements.welcomeWrapper?.classList.toggle("hidden", active);
  elements.chatContainer?.classList.toggle("chat-active", active);
  elements.mainContent?.classList.toggle("chat-active", active);
  elements.inputContainer?.classList.toggle("fixed", active);
  if (elements.userInput) elements.userInput.setAttribute("rows", active ? "1" : "3");
}

function loadChat(chatId) {
  const chat = savedChats.find(entry => entry.id === chatId);
  if (!chat) return;

  currentChatId = chat.id;
  currentSessionId = chat.sessionId || generateSessionId();
  conversationHistory = Array.isArray(chat.messages) && chat.messages.length > 0 ? [...chat.messages] : [{ role: "system", content: SYSTEM_PROMPT }];
  
  elements.chatMessages.innerHTML = "";
  const visibleMessages = conversationHistory.filter(entry => ["user", "assistant"].includes(entry.role));
  
  if (visibleMessages.length === 0) {
    setChatMode(false);
  } else {
    visibleMessages.forEach(entry => addMessage(entry.content, entry.role, true));
    scrollToBottom();
  }
  renderSavedChats();
}

function startNewChat() {
  currentChatId = null;
  currentSessionId = generateSessionId();
  conversationHistory = [{ role: "system", content: SYSTEM_PROMPT }];
  elements.chatMessages.innerHTML = "";
  setChatMode(false);
  renderSavedChats();

  if (elements.userInput) {
    elements.userInput.value = "";
    elements.userInput.style.height = "";
    elements.sendBtn?.classList.remove("has-text");
  }
}

async function sendMessage() {
  const message = elements.userInput.value.trim();
  if (!message) return;

  setUIState(true);
  addMessage(message, "user");
  conversationHistory.push({ role: "user", content: message });
  await syncCurrentChatToStorage();

  const typingIndicator = showTypingIndicator();

  try {
    const headers = { "Content-Type": "application/json" };
    if (authManager.isLoggedIn()) headers["Authorization"] = `Bearer ${authManager.getToken()}`;

    const response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: conversationHistory, sessionId: currentSessionId, agent_reference: CONFIG.AGENT_REFERENCE }),
    });

    const data = await response.json();
    typingIndicator.remove();
    
    const assistantMessage = response.ok && data.message ? data.message.content : (data.error || "Erro no servidor.");
    addMessage(assistantMessage, "assistant");
    conversationHistory.push({ role: "assistant", content: assistantMessage });
    
  } catch (error) {
    typingIndicator.remove();
    const fallback = "Erro de conexão com a API.";
    addMessage(fallback, "assistant");
    conversationHistory.push({ role: "assistant", content: fallback });
  }

  await syncCurrentChatToStorage();
  setUIState(false);
}

function setUIState(disabled) {
  elements.userInput.disabled = disabled;
  elements.sendBtn.disabled = disabled;
  if (!disabled) {
    elements.userInput.focus();
    elements.userInput.value = "";
    elements.userInput.style.height = "";
    elements.sendBtn.classList.remove("has-text");
  }
}

function scrollToBottom() {
  const last = elements.chatMessages.lastElementChild;
  if (last) setTimeout(() => last.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

function addMessage(text, sender, skipScroll = false) {
  setChatMode(true);
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}`;
  
  if (sender === "assistant" && typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true, gfm: true });
    messageDiv.innerHTML = marked.parse(text);
  } else {
    messageDiv.textContent = text;
  }
  
  elements.chatMessages.appendChild(messageDiv);
  if (!skipScroll) scrollToBottom();
}

function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  elements.chatMessages.appendChild(indicator);
  scrollToBottom();
  return indicator;
}