// Runs on ad pages of Kleinanzeigen, AutoScout24 and Autohero: a small button that opens this ad
// in AutoHalle. It only links; it reads nothing from the page.

(() => {
  if (document.getElementById("autohalle-check")) return;
  const APP_URL = "https://autohalle.onrender.com/";
  const ad = window.location.href.split("#")[0];
  const link = document.createElement("a");
  link.id = "autohalle-check";
  link.href = `${APP_URL}#/analyze?url=${encodeURIComponent(ad)}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Mit AutoHalle prüfen";
  Object.assign(link.style, {
    position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647", padding: "12px 18px",
    borderRadius: "10px", background: "#16181b", color: "#fff", font: "500 15px/1.2 system-ui, sans-serif",
    textDecoration: "none", boxShadow: "0 6px 20px rgba(22, 24, 27, 0.25)",
  });
  document.body.appendChild(link);
})();
