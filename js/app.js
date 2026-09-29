const API_BASE = "https://api.best-tempmail.com/v1/inboxes";
const POLL_INTERVAL = 15000;

const createButton = document.querySelector("#create-inbox");
const refreshButton = document.querySelector("#refresh-inbox");
const copyButton = document.querySelector("#copy-address");
const addressElement = document.querySelector("#email-address");
const statusElement = document.querySelector("#inbox-status");
const stateElement = document.querySelector("#inbox-state");
const inboxPanel = document.querySelector("#inbox-panel");
const messageList = document.querySelector("#message-list");
const messageCount = document.querySelector("#message-count");
const messageReader = document.querySelector("#message-reader");

let inboxAddress = "";
let pollTimer;

async function responseError(response, fallback) {
  let details;
  try {
    details = await response.json();
  } catch {
    // Some proxy errors do not return JSON.
  }
  const message = details?.error || details?.message || fallback;
  const error = new Error(message);
  error.status = response.status;
  return error;
}

function setStatus(message, state = "Private") {
  statusElement.textContent = message;
  stateElement.textContent = state;
}

function messageText(message) {
  return message.text || message.body || message.html || "This message has no readable content.";
}

function renderReader(message) {
  const content = document.createElement("div");
  content.className = "reader-content";

  const meta = document.createElement("div");
  meta.className = "reader-meta";
  const subject = document.createElement("h3");
  subject.textContent = message.subject || "(No subject)";
  const from = document.createElement("p");
  from.innerHTML = `<strong>From:</strong> ${escapeHTML(message.from || message.sender || "Unknown sender")}`;
  const date = document.createElement("p");
  date.innerHTML = `<strong>Received:</strong> ${formatDate(message.createdAt || message.date || message.received_at)}`;
  meta.append(subject, from, date);

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = messageText(message);
  content.append(meta, body);
  messageReader.replaceChildren(content);
}

function escapeHTML(value) {
  const temp = document.createElement("span");
  temp.textContent = value;
  return temp.innerHTML;
}

function formatDate(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderMessages(messages) {
  messageList.replaceChildren();
  messageCount.textContent = `${messages.length} message${messages.length === 1 ? "" : "s"}`;

  if (!messages.length) {
    messageList.innerHTML = '<p class="empty-state">Your inbox is empty. New messages will appear here automatically.</p>';
    return;
  }

  messages.forEach((message) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "message-item";
    item.innerHTML = `<span class="message-from">${escapeHTML(message.from || message.sender || "Unknown sender")}</span><span class="message-subject">${escapeHTML(message.subject || "(No subject)")}</span>`;
    item.addEventListener("click", () => {
      document.querySelectorAll(".message-item").forEach((entry) => entry.classList.remove("is-active"));
      item.classList.add("is-active");
      renderReader(message);
    });
    messageList.append(item);
  });
}

async function readInbox() {
  if (!inboxAddress) return;
  refreshButton.disabled = true;
  setStatus("Checking for new mail…", "Syncing");
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(inboxAddress)}/messages`);
    if (!response.ok) throw await responseError(response, `Inbox request failed (${response.status})`);
    const data = await response.json();
    renderMessages(Array.isArray(data.messages) ? data.messages : []);
    setStatus("Inbox is live", "Protected");
  } catch (error) {
    setStatus(error.message || "Could not load messages. Try again.", "Offline");
    console.error(error);
  } finally {
    refreshButton.disabled = false;
  }
}

async function createInbox() {
  let creationLimitReached = false;
  createButton.disabled = true;
  createButton.textContent = "Creating inbox…";
  setStatus("Creating your private address…", "Working");
  try {
    const response = await fetch(API_BASE, { method: "POST" });
    if (!response.ok) throw await responseError(response, `Inbox creation failed (${response.status})`);
    const data = await response.json();
    if (!data.address) throw new Error("The API returned no inbox address.");
    inboxAddress = data.address;
    addressElement.textContent = inboxAddress;
    inboxPanel.classList.remove("is-hidden");
    copyButton.disabled = false;
    refreshButton.disabled = false;
    createButton.innerHTML = 'Create new address <span>→</span>';
    clearInterval(pollTimer);
    await readInbox();
    pollTimer = setInterval(readInbox, POLL_INTERVAL);
  } catch (error) {
    const isLimitReached = error.status === 429;
    creationLimitReached = isLimitReached;
    setStatus(error.message || "Could not create an inbox. Please try again.", isLimitReached ? "Limit reached" : "Unavailable");
    createButton.innerHTML = isLimitReached ? "Daily limit reached" : 'Try again <span>→</span>';
    createButton.disabled = isLimitReached;
    console.error(error);
  } finally {
    createButton.disabled = creationLimitReached;
  }
}

createButton.addEventListener("click", createInbox);
refreshButton.addEventListener("click", readInbox);
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(inboxAddress);
    copyButton.textContent = "Copied!";
    setTimeout(() => { copyButton.textContent = "Copy"; }, 1600);
  } catch (error) {
    setStatus("Copy failed — select the address manually.", "Private");
  }
});
