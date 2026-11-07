const statusLine = document.getElementById("status");

try {
  const response = await fetch("/health");
  const data = await response.json();
  statusLine.textContent = `Server status: ${data.status}`;
} catch {
  statusLine.textContent = "Server status: unreachable";
}
